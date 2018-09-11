'use strict';

function loadWorkerConfig() {
    const supportedBrowsers = [
        'chrome',
        'firefox',
        'phantomjs'
    ];

    if (supportedBrowsers.includes(process.env.WORKER_BROWSER)) {
        return require(`../config/worker/${process.env.WORKER_BROWSER}`);
    }

    throw new Error('Could not load configuration for the worker.');
}

/**
 * @type {Object}
 */
const loadedConfigs = loadWorkerConfig();

module.exports = loadedConfigs;
