var cfenv = require("cfenv");
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

module.exports = {
	analyze: function (request_body, response) {
        if (!request_body.combine_profile_docs) {
            response.send({
                "error" : "Not implemented yet (combine_profile_docs set to false)"
            });
            return;
        } else {
            var combined_profile_doc = '';
            for (i in request_body.profile_docs) {
                combined_profile_doc += request_body.profile_docs[i].text;
                combined_profile_doc += " ";
            }
            var profile_params = {};
            profile_params.text = combined_profile_doc;
        }

        var new_params = {};
        new_params.text = request_body.new_doc.text;

        var profile_analysis = {};
        var new_analysis = {};
		tone_analyzer.tone(profile_params, function (error, res) {
            if (error) 
                response.send(error);
            else {
                profile_analysis = res;
                tone_analyzer.tone(new_params, function(error, res) {
                    if (error) 
                        response.send(error);
                    else {
                        new_analysis = res;
                        if (request_body.comparison_level === 'sentence') {
                            response.send(compareSentenceLevel(profile_analysis, new_analysis, request_body.tone_categories));
                        } else if (request_body.comparison_level === 'document') {
                            response.send(compareDocumentLevel(profile_analysis, new_analysis, request_body.tone_categories));
                        } else {
                            response.send({
                                "error" : "Unsupported compare_level provided"
                            });
                        }
                    }
                });
            }
		});
	}
}