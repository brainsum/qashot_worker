'use strict';

module.exports = {
    "browser": "phantomjs",
    "engine": "casper",
    "scriptsFolder": "casper_scripts",
    "engineOptions": {
        "backstopKey": "casperFlags",
        "options": [
            "--ignore-ssl-errors=true",
            "--ssl-protocol=any"
        ]
    }
};
