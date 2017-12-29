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

function compareDocumentLevel(profileRes, compareRes) {
    return "compare document level";
}

function compareSentenceLevel(profileRes, compareRes) {
    return "compare sentence level";
}

module.exports = {
	analyze: function (params, response) {
        // response.send(params);
        var concatenatedProfileDoc = '';
        for (i in params["profile_docs"]) {
            concatenatedProfileDoc += params["profile_docs"][i]["text"];
            concatenatedProfileDoc += " ";
        }
        var profileParams = {};
        profileParams.text = concatenatedProfileDoc;

        var compareParams = {};
        compareParams.text = params["compare_doc"]["text"];

        var profileRes = {};
        var compareRes = {};
		tone_analyzer.tone(profileParams, function (error, res) {
            if (error) 
                response.send(error);
            else {
                profileRes = res;
                tone_analyzer.tone(compareParams, function(error, res) {
                    if (error) 
                        response.send(error);
                    else {
                        compareRes = res;
                        if (params["compare_level"] === 'sentence') {
                            response.send(compareSentenceLevel(profileRes, compareRes));
                        } else if (params["compare_level"] === 'document') {
                            response.send(compareDocumentLevel(profileRes, compareRes));
                        } else {
                            response.send({
                                "error" : "Unsupported compare_level provided"
                            })
                        }
                    }
                });
            }
		});
	}
}