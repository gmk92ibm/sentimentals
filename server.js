var bodyParser = require('body-parser');
var analyzer = require("./analyzer");
var express = require("express");
var config = require('./config');

var app = express();

app.use(bodyParser.urlencoded({ extended: false }));

app.use(bodyParser.json())

/**
 * Endpoint to compare new text to an array of old 'profile' text
 * POST localhost:3000/api/analyze
 *
 * ####### REQUEST BODY #######
 * profile_docs - array of objects that contains a list of old text to compare against
 * new_doc - single object that contains the new text to compare
 * comparison_level - can be either "document" or "sentence"
 * combine_profile_docs - true/false. this indicates whether the profile documents should be concatenated into one big
 *      document or handled separately. This is probably just for testing.
 * tone_categories - an array of the included tone_categories: "emotion_tone", "languages_tone", "social_tone"
 *
 * example:
 * {
 *     "profile_docs": [
 *        {
 *     		"text": "I am very upset."
 *     	  },
 *     	  {
 *     		"text": "This is disgusting."
 *     	  }
 *     ],
 *     "new_doc": {
 *     	  "text": "I am extremely happy."
 *     },
 *     "comparison_level": "document",
 *     "combine_profile_docs": true,
 *     "tone_categories": ["emotion_tone", "languages_tone", "social_tone"]
 * }
 *
 * @return JSON analysis of text
 */
app.post("/api/analyze", function(request, response) {
    analyzer.analyze(request.body, response);;
});

app.use(express.static(__dirname + '/views'));

var port = process.env.PORT || 3000

app.listen(port, function () {
    console.log("http://localhost:" + port);
});
