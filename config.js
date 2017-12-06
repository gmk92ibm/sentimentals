var cfenv = require("cfenv");

// load local VCAP configuration  and service credentials
var vcapLocal;
try {
    vcapLocal = require('./vcap-local.json');
} catch (e) { }

const appEnvOpts = vcapLocal ? { vcap: vcapLocal } : {}

module.exports = cfenv.getAppEnv(appEnvOpts);