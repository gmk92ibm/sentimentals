var cfenv = require("cfenv");
var reduce = require('lodash/reduce');
var config = require('./config');

var tone_analyzer;

if (config.services['tone_analyzer']) {
  console.log('found service tone_analyzer');
  var ToneAnalyzerV3 = require('watson-developer-cloud/tone-analyzer/v3');
  var credentials = config.services['tone_analyzer'][0].credentials;
  credentials['version_date'] = '2016-05-19';
  tone_analyzer = new ToneAnalyzerV3(credentials)
}

function sortByAbsoluteValueDescending(a, b) {
  if (Math.abs(a.difference) < Math.abs(b.difference)) {
    return 1;
  }
  if (Math.abs(a.difference) > Math.abs(b.difference)) {
    return -1;
  }
  return 0;
}

function compareDocumentLevel(profile_analysis, new_analysis, tone_categories) {
  var raw_comparison = new_analysis.document_tone.tone_categories; //this sets the base structure for our raw response
  var ordered_comparison = [];
  var difference_sum = 0;
  //Iterate over the categories (emotion, language, social)
  for (c in raw_comparison) {
    var new_category = raw_comparison[c];
    //check if the category should be ignored
    //this currently results in null values in the returned array rather than
    //  changing the size of the array. could be fixed by array.splice and iterating backwards
    if (!tone_categories.includes(new_category.category_id)) {
      delete raw_comparison[c];
      break;
    }
    var profile_category = profile_analysis.document_tone.tone_categories[c];
    // Iterate over tones of each category
    for (t in new_category.tones) {
      var new_tone = new_category.tones[t];
      var profile_tone = profile_category.tones[t];
      new_tone.difference = profile_tone.score - new_tone.score;
      difference_sum += Math.abs(new_tone.difference);
      delete new_tone.score; //removing unnecessary score property
      var obj = {
        "category_id" : new_category.category_id,
        "tone_id": new_tone.tone_id,
        "difference": new_tone.difference
      };
      ordered_comparison.push(obj);
    }
  }
  ordered_comparison.sort(sortByAbsoluteValueDescending);

  var summary = {};
  summary.difference_sum = difference_sum;
  summary.ordered_comparison = ordered_comparison;
  summary.raw_comparison = raw_comparison;
  return summary;
}

function compareSentenceLevel(profile_analysis, new_analysis, tone_categories) {
  if (!new_analysis.sentences_tone) {
    return {
        "error" : "New content does not contain multiple sentences. Sentence level comparison cannot be made."
    }
  }
  var raw_comparison = new_analysis.sentences_tone; //sets the base structure for our response
  //Iterate over the new content sentences analysis
  for (s in raw_comparison) {
    var new_sentence = raw_comparison[s];
    new_sentence.difference_sum = 0;
    //Iterate over the categories (emotion, language, social)
    for (c in new_sentence.tone_categories) {
      var new_sentence_category = new_sentence.tone_categories[c];
      var profile_category = profile_analysis.document_tone.tone_categories[c];
      // Iterate over tones of each category
      for (t in new_sentence_category.tones) {
        var new_sentence_tone = new_sentence_category.tones[t];
        var profile_tone = profile_category.tones[t];
        new_sentence_tone.difference = profile_tone.score - new_sentence_tone.score;
        new_sentence.difference_sum += Math.abs(new_sentence_tone.difference);
        delete new_sentence_tone.score; //removing unnecessary score property
      }
    }
  }
  var summary = {};
  summary.raw_comparison = raw_comparison;
  summary.original = {
    "new": new_analysis,
    "profile": profile_analysis
  };
  return summary;
}

function combineResultValues(combined_analysis, new_analysis) {
  if (!combined_analysis || combined_analysis === new_analysis) {
      return new_analysis;
  }
  var doc_doc = combined_analysis.document_tone;

  for (i in doc_doc.tone_categories) {
    var doc_cat = doc_doc.tone_categories[i];
    for (j in doc_cat.tones) {
      var doc_tone = doc_cat.tones[j];
      var new_doc = new_analysis.document_tone;
      for (k in new_doc.tone_categories) {
        var new_cat = new_doc.tone_categories[k];
        for (l in new_cat.tones) {
          var new_tone = new_cat.tones[l];
          if (doc_tone.tone_id == new_tone.tone_id) {
            doc_tone.score += new_tone.score
          }
        }
      }
    }
  }

  var new_sec = new_analysis.sentences_tone;
  if (combined_analysis.sentences_tone == null) {
    combined_analysis.sentences_tone = {};
  }
  for (i in new_sec) {
    var new_tone = new_sec[i];
    combined_analysis.sentences_tone.push(new_tone)
  }
  return combined_analysis;
}

function averageScores(combined_analysis, count) {
  var doc_doc = combined_analysis.document_tone;

  for (i in doc_doc.tone_categories) {
    var doc_cat = doc_doc.tone_categories[i];
    for (j in doc_cat.tones) {
      var doc_tone = doc_cat.tones[j];

      doc_tone.score = doc_tone.score / count;
    }
  }
  return  combined_analysis
}

// Wrap the tone analysis API call in a Promise so that
// we can take advantage of Promise.all for parallel execution
function analyzeTone(params) {
  return new Promise(function(resolve, reject) {
    tone_analyzer.tone(params, function (error, res) {
      return error ? reject(error) : resolve(res);
    });
  });
}

module.exports = {
  analyze: function (request_body, response) {
    if (!request_body.combine_profile_docs) {
      var profile_doc_promises = request_body.profile_docs.map(doc => analyzeTone(doc));
      var new_doc_promise = analyzeTone(request_body.new_doc);

      Promise.all([...profile_doc_promises, new_doc_promise]).then(values => {
        // The new doc values will always be the last result
        var new_analysis = values.pop();
        var profile_doc_values = values;
        var combinedResponse = reduce(profile_doc_values, (result, value) => combineResultValues(result, value));
        var profile_analysis = averageScores(combinedResponse, request_body.profile_docs.length);

        profile = parse_response(profile_analysis)

        compare = parse_response(new_analysis)

        sentence_analysis = analyze_sentences(profile,new_analysis) // have to use new_analysis as it still has sentences

        var summary = {}

        summary.sentences = sentence_analysis.sentences
        summary.sentence_averages = sentence_analysis.sentence_averages
        summary.document = compute_diff(profile,compare)
        summary.document_average = average_scores([compute_diff(profile,compare)])[0]

        response.send(summary);
      }).catch((error) => {
        response.send(error);
      });
    } else {
      var profile_params = {};
      var new_params = {};

      // Combine all profile text separated by spaces
      profile_params.text = request_body.profile_docs.map(doc => doc.text).join(' ');
      new_params = request_body.new_doc;

      var profile_analysis_promise = analyzeTone(profile_params);
      var new_analysis_promise = analyzeTone(new_params);
      Promise.all([profile_analysis_promise, new_analysis_promise]).then(function(res) {
        var profile_analysis = res[0];
        var new_analysis = res[1];

        var comparisonFunc = request_body.comparison_level === 'sentence' ? compareSentenceLevel : compareDocumentLevel;
        response.send(comparisonFunc(profile_analysis, new_analysis, request_body.tone_categories));
      }).catch(function(error) {
        response.send(error);
      });
    }
  }
}


function analyze_sentences(profile, response){
  var sentences = []

  sentences_tone = response['sentences_tone']

  if(!sentences_tone) return {}

  for(i = 0; i < sentences_tone.length; i++){
    tone_categories = sentences_tone[i]['tone_categories']

    tmp = {}

    for(j = 0; j < tone_categories.length; j++){
      tones = tone_categories[j]['tones']
      category_id = tone_categories[j]['category_id']

      for(k = 0; k < tones.length; k++){
        tone_id = tones[k]['tone_id']
        score = tones[k]['score'];

        tmp[tone_id] = score
      }

      sentences[i] = compute_diff(profile,tmp)
    }
  }

  var summary = {}

  summary.sentences = sentences
  summary.sentence_averages = average_scores(sentences)

  return summary
}

function parse_response(response){
  var dictionary = {}

  document_tone = response['document_tone']
  tone_categories = document_tone['tone_categories']

  for(i = 0; i < tone_categories.length; i++){
    tones = tone_categories[i]['tones']
    category_id = tone_categories[i]['category_id']

    for(j = 0; j < tones.length; j++){
      tone_id = tones[j]['tone_id']
      score = tones[j]['score'];

      dictionary[tone_id] = score
    }
  }

  return dictionary
}

function compute_diff(profile, compare){
  var result = {}

  for(key in profile){
  	result[key] = difference(profile[key], compare[key])
  }

  return result
}

function difference(x,y){
  if( x + y == 0) return 0
  else return (Math.abs(x - y) / ((x + y) / 2)) * 100
}

function clone(obj){
   return JSON.parse(JSON.stringify(obj))
}

function average_scores(list){
  var result = []

  for(i = 0; i < list.length; i++){
    tmp = 0
    count = 0

    for(key in list[i]){
      count++

      tmp += list[i][key]
    }

    result[i] = tmp / count
  }

  return result
}
