'use strict';

module.exports = {
    "browser": "chrome",
    "engine": "puppeteer",
    "scriptsFolder": "puppeteer_scripts",
    "engineOptions": {
        "backstopKey": "engineOptions",
        "options": {
            "waitTimeout": 20000,
            "ignoreHTTPSErrors": true,
            "args": [
                // '--no-sandbox',
                // '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--headless',
                '--disable-gpu',
                '--ignore-certificate-errors',
                '--force-device-scale-factor=1',
                '--disable-infobars=true'
            ]
        }
    }
};
