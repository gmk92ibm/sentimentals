var express = require("express");
var app = express();
var bodyParser = require('body-parser')
var analyzer = require("./analyzer");
var config = require('./config');

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

if (config.services['cloudantNoSQLDB']) {
    // Load the Cloudant library.
    var Cloudant = require('cloudant');

    // Initialize database with credentials
    var cloudant = Cloudant(config.services['cloudantNoSQLDB'][0].credentials);

    //database name
    var dbName = 'mydb';

    // Create a new "mydb" database.
    cloudant.db.create(dbName, function (err, data) {
        if (!err) //err if database doesn't already exists
            console.log("Created database: " + dbName);
    });

    // Specify the database we are going to use (mydb)...
    mydb = cloudant.db.use(dbName);
}

var mydb;

/* Endpoint to greet and add a new visitor to database.
* Send a POST request to localhost:3000/api/visitors with body
* {
* 	"name": "Bob"
* }
*/
app.post("/api/visitors", function (request, response) {
    var userName = request.body.name;
    if (!mydb) {
        console.log("No database.");
        response.send("Hello " + userName + "!");
        return;
    }
    // insert the username as a document
    mydb.insert({ "name": userName }, function (err, body, header) {
        if (err) {
            return console.log('[mydb.insert] ', err.message);
        }
        response.send("Hello " + userName + "! I added you to the database.");
    });
});

/**
 * Endpoint to get a JSON array of all the visitors in the database
 * REST API example:
 * <code>
 * GET http://localhost:3000/api/visitors
 * </code>
 *
 * Response:
 * [ "Bob", "Jane" ]
 * @return An array of all the visitor names
 */
app.get("/api/visitors", function (request, response) {
    var names = [];
    if (!mydb) {
        response.json(names);
        return;
    }

    mydb.list({ include_docs: true }, function (err, body) {
        if (!err) {
            body.rows.forEach(function (row) {
                if (row.doc.name)
                    names.push(row.doc.name);
            });
            response.json(names);
        }
    });
});

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
 * ####### RESPONSE #######
 * 
 * All values in response are represented as a difference. This is calculated by profile score - new score.
 * A positive difference means the tone/emotion is more prominently expressed in the PROFILE doc(s).
 *      ex: A difference value of 0.9 for anger means the profile doc is much more angry than the new doc.
 *          A difference value of 0.1 for anger means the profile doc is slightly more angry.
 * A negative difference means the tone/emtions is more prominently expressed in the NEW doc.
 *      ex: A difference value of -0.9 for anger means the new doc is much more angry than the profile doc.
 * 
 * raw_comparison - Same structure as api response but showing difference values.
 * ordered_comparison - Less nested structure of values in descending order by highest difference (absolute value)
 * 
 * {
 *  "raw_comparison":[
 *      {
 *          "tones":[
 *              {
 *                  "tone_id":   "anger",
 *                  "tone_name": "Anger",
 *                  "difference": 0.534822
 *              },
 *              ......... etc
 *          ]
 *      }
 *  ],
 *  "ordered_comparison": [
 *      {
 *          "category_id": "emotion_tone",
 *          "tone_id":     "joy",
 *          "difference":  -0.898867
 *      },
 *      {
 *          "category_id": "emotion_tone",
 *          "tone_id":     "disgust",
 *          "difference":  0.661432
 *      },
 *      ......... etc
 *  ]
 * }
 * @return JSON analysis of text
 */
app.post("/api/analyze", function(request, response) {
    analyzer.analyze(request.body, response);;
});

//serve static file (index.html, images, css)
app.use(express.static(__dirname + '/views'));

var port = process.env.PORT || 3000
app.listen(port, function () {
    console.log("To view your app, open this link in your browser: http://localhost:" + port);
});
