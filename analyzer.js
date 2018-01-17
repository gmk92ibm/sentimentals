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

//Combine (sum) each of the initial profile docs' analysis results
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

//Average all of the initial profile docs' analysis results
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
        var document = {}

        summary.sentences = sentence_analysis
        document['tones'] = compute_diff(profile,compare)
        document['average'] = average_score(document['tones']);
        summary.document = document;

        response.send(summary);
      }).catch((error) => {
        response.send(error);
      });
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

      var sentence = sentences_tone[i];
      sentence['tones'] = compute_diff(profile,tmp)
      sentence['average'] = average_score(sentence['tones']);
      delete sentence['tone_categories']
      sentences[i] = sentence
    }
  }

  return sentences;
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

function average_score(tones){
  var result = 0

  for(key in tones){
    result += tones[key]
  }

  return result / Object.keys(tones).length;
}
