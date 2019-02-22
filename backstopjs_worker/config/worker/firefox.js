'use strict';

module.exports = {
    "browser": "firefox",
    "engine": "slimerjs",
    "scriptsFolder": "casper_scripts",
    "engineOptions": {
        "backstopKey": "casperFlags",
        "options": [
            // @todo: Update to SlimerJS v1.
            // @todo: Update docker image for headless.
            // @todo: Enable headless.
            // '--headless',
            // @todo: maybe?
            // '--web-security=no',
            '--ignore-ssl-errors=true',
            '--ssl-protocol=any'
        ]
    }
};
