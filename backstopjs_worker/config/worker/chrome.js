'use strict';

module.exports = {
    "browser": "chrome",
    "engine": "puppeteer",
    "scriptsFolder": "puppeteer_scripts",
    "engineOptions": {
        "backstopKey": "engineOptions",
        "options": {
            "ignoreHTTPSErrors": true,
            "args": [
            ]
        }
    }
};
