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

module.exports = {
	analyze: function (params, response) {
		tone_analyzer.tone(params, function (error, res) {
            response.send(JSON.stringify(res, null, 2));
		});
	}
}