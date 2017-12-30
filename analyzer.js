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

function compareDocumentLevel(profile_analysis, new_analysis) {
    var raw_comparison = new_analysis.document_tone.tone_categories; //this sets the base structure for our response
    //Iterate over the categories (emotion, language, social)
    for (i in new_analysis.document_tone.tone_categories) {
        var new_category = new_analysis.document_tone.tone_categories[i];
        var profile_category = profile_analysis.document_tone.tone_categories[i];
        // Iterate over tones of each category
        for (j in new_category.tones) {
            var new_tone = new_category.tones[j];
            var profile_tone = profile_category.tones[j];
            raw_comparison[i].tones[j].difference = profile_tone.score - new_tone.score;
            delete raw_comparison[i].tones[j].score; //removing unnecessary score property
        }
    }

    var ordered_comparison = [];
    for (i in raw_comparison) {
        for (j in raw_comparison[i].tones) {
            var obj = {
                "category_id" : raw_comparison[i].category_id,
                "tone_id": raw_comparison[i].tones[j].tone_id,
                "difference": raw_comparison[i].tones[j].difference
            };
            ordered_comparison.push(obj);
        }
    }
    ordered_comparison.sort(sortByAbsoluteValueDescending);

    var summary = {};
    summary.ordered_comparison = ordered_comparison;
    summary.raw_comparison = raw_comparison;
    return summary;
}

function compareSentenceLevel(profile_analysis, new_analysis) {
    return "Not implemented yet";
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
                            response.send(compareSentenceLevel(profile_analysis, new_analysis));
                        } else if (request_body.comparison_level === 'document') {
                            response.send(compareDocumentLevel(profile_analysis, new_analysis));
                        } else {
                            response.send({
                                "error" : "Unsupported compare_level provided"
                            });
                            return;
                        }
                    }
                });
            }
		});
	}
}