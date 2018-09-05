'use strict';

const path = require('path');
const fs = require('fs');
const appRootDir = require('./app-root');

function loadWorkerConfig() {
    const supportedBrowsers = [
        'chrome',
        'firefox',
        'phantomjs'
    ];

    if (supportedBrowsers.includes(process.env.WORKER_BROWSER)) {
        const filename = `worker-config.${process.env.WORKER_BROWSER}.json`;
        return JSON.parse(fs.readFileSync(path.join(appRootDir, filename), 'utf8'));
    }

    throw new Error('Could not load configuration for the worker.');
}

/**
 * @type {Object}
 */
const loadedConfigs = loadWorkerConfig();

module.exports = loadedConfigs;
