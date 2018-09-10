'use strict';

function preFlightCheck() {
    const requiredEnvVars = [
        'WORKER_BROWSER',
        'WORKER_ENGINE',
        'INTERNAL_RABBITMQ_URL',
        'JWT_SECRET_KEY',
        'EXPOSED_PORT',
        'RESULTS_ENDPOINT_URL'
    ];

    let success = true;
    requiredEnvVars.forEach(function (variableName) {
        if (!process.env.hasOwnProperty(variableName)) {
            console.error(`The required "${variableName}" environment variable is not set.`);
            success = false;
        }
    });

    if (false === success) {
        throw new Error('Pre-flight check failed.');
    }
}

preFlightCheck();

const appRootDir = require('./src/app-root');
const express = require('express');
const terminus = require('@godaddy/terminus');
const path = require('path');
const fs = require('fs');
const util = require('util');
const workerConfig = require('./src/worker-config');
const backstopApi = require('./src/backstop-api');
const resultQueue = require('./src/client/result-queue');

const MessageQueue = require('./src/message-queue');

function ensureDirectory(path) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path, 0o775);
    }
}

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

const PORT = process.env.EXPOSED_PORT;
const HOST = '0.0.0.0';

let internalChannelConfigs = {};
internalChannelConfigs[workerConfig.browser] = {
    'name': workerConfig.browser,
    'queue': `backstop-${workerConfig.browser}`,
    'exchange': 'backstop-worker',
    'routing': `${workerConfig.browser}-tests`
};

const internalMessageQueue = new MessageQueue('InternalMQ', process.env.INTERNAL_RABBITMQ_URL, internalChannelConfigs);

ensureDirectory(path.join(appRootDir, 'runtime'));
ensureDirectory(path.join(appRootDir, 'runtime', workerConfig.browser));

/**
 *
 * @param {Object} results
 * @param {Object} message
 * @return {Promise<any>}
 */
function sendResults(results, message) {
    console.log(util.inspect(results));
    results.original_request = message;

    return resultQueue.sendResult(results);
}

/**
 *
 * @param {Object} backstopConfig
 * @param {Object} message
 * @return {Promise<any | never>}
 */
function pushResults(backstopConfig, message) {
    return backstopApi.loadResults(backstopConfig.paths.html_report, backstopConfig.id).then(loadedResults => {
        return backstopApi.parseResults(backstopConfig, loadedResults);
    })
    // @fixme: @todo: In case of errors, send them to the result_queue, too.
        .then(parsedResults => {
            return sendResults(parsedResults, message);
        })
        .catch((error) => {
            return error;
        });
}

// const defaultTestConfig = {
//     'paths': {
//       'engine_scripts': (workerConfig.browser === 'phantomjs') ? path.join('templates', workerConfig.scriptsFolder) : path.join(appRootDir, 'templates', workerConfig.scriptsFolder)
//     },
//     'engine': workerConfig.engine,
//     'asyncCaptureLimit': 10,
//     'asyncCompareLimit': 10,
//     'debug': (process.env.DEBUG === true),
//     'debugWindow': (process.env.DEBUG_WINDOW === true)
// };

function rabbitTestLoop() {
    console.time('rabbitTestLoop');

    internalMessageQueue.read(workerConfig.browser)
        .then(message => {
            // @todo: Maybe use this for something.
            // const originalBackstopConfig = message.test_config;
            let backstopConfig = message.test_config;
            // @fixme @todo: This is temporary:
            backstopConfig.id = String(backstopConfig.id);
            backstopConfig.fileNameTemplate = '{scenarioLabel}_{selectorIndex}_{selectorLabel}_{viewportIndex}_{viewportLabel}';

            console.log('Data received. Config ID is: ' + backstopConfig.id);
            const templates = path.join(appRootDir, 'templates');
            const currentRuntime = path.join(appRootDir, 'runtime', workerConfig.browser, backstopConfig.id);
            ensureDirectory(currentRuntime);

            backstopConfig.paths = {
                "engine_scripts": (workerConfig.browser === 'phantomjs') ? path.join('templates', workerConfig.scriptsFolder) : path.join(templates, workerConfig.scriptsFolder),
                "bitmaps_reference": path.join(currentRuntime, "reference"),
                "bitmaps_test": path.join(currentRuntime, "test"),
                "html_report": path.join(currentRuntime, "html_report"),
                "ci_report": path.join(currentRuntime, "ci_report")
            };

            Object.keys(backstopConfig.paths).forEach(function (key) {
                ensureDirectory(backstopConfig.paths[key]);
            });

            backstopConfig.engine = workerConfig.engine;
            backstopConfig[workerConfig.engineOptions.backstopKey] = workerConfig.engineOptions.options;
            backstopConfig.asyncCaptureLimit = 10;
            backstopConfig.asyncCompareLimit = 10;
            // Force CI reporting, otherwise backstop opens the html report and
            // the processes hang indefinitely.
            backstopConfig.report = [
                "CI"
            ];

            if (process.env.DEBUG === true) {
                backstopConfig.debug = true;
            }
            if (process.env.DEBUG_WINDOW === true) {
                backstopConfig.debugWindow = true;
            }

            fs.writeFileSync(path.join(currentRuntime, 'backstop.json'), JSON.stringify(backstopConfig));

            backstopApi.runABTest(backstopConfig)
                .finally(async function () {
                    console.timeEnd('rabbitTestLoop');
                    console.log(`Test ${backstopConfig.id} ended.`);
                    const results = await pushResults(backstopConfig, message);
                    console.log(`Results: ${results}`);
                    rabbitTestLoop();
                });
        })
        .catch(error => {
            console.timeEnd('rabbitTestLoop');
            console.log(`Couldn't read from RabbitMQ: ${error}`);
            const timeout = 10000;
            return delay(timeout).then(() => {
                rabbitTestLoop();
            });
        });
}

// App
const app = express();
let server = undefined;

function beforeShutdown () {
    // given your readiness probes run every 5 second
    // may be worth using a bigger number so you won't
    // run into any race conditions
    return new Promise(resolve => {
        setTimeout(resolve, 5000)
    })
}

function onSignal () {
    console.log('server is starting cleanup');
    return Promise.all([
        internalMessageQueue.getConnection().close(),
        server.close()
    ]);
}

function onShutdown () {
    console.log('cleanup finished, server is shutting down');
}

function livenessCheck() {
    console.log('Probing for liveness..');
    return Promise.resolve()
}

function readinessCheck () {
    console.log('Probing for readiness..');
    const serverReadiness = new Promise((resolve, reject) => {
        if ('undefined' === typeof server || null === server.address()) {
            return reject('The server is down.');
        }

        return resolve('The server is alive.');
    });

    return Promise.all([
        serverReadiness
    ]);
}

const signals = [
    'SIGHUP',
    'SIGINT',
    'SIGUSR2',
];

const terminusOptions = {
    // Healtcheck options.
    healthChecks: {
        '/health/liveness': livenessCheck,    // Function indicating if the service is running or not.
        '/health/readiness': readinessCheck,    // Function indicating if the service can accept requests or not.
    },

    // cleanup options
    timeout: 1000,                   // [optional = 1000] number of milliseconds before forcefull exiting
    // signal,                          // [optional = 'SIGTERM'] what signal to listen for relative to shutdown
    signals,                          // [optional = []] array of signals to listen for relative to shutdown
    beforeShutdown,                  // [optional] called before the HTTP server starts its shutdown
    onSignal,                        // [optional] cleanup function, returning a promise (used to be onSigterm)
    onShutdown,                      // [optional] called right before exiting

    // both
    // logger                           // [optional] logger function to be called with errors
};

async function run() {
    await internalMessageQueue.connect();

    try {
        const message = await internalMessageQueue.waitChannels(5, 2000);
        console.log(message);
    }
    catch (error) {
        console.log(`Error! ${error.message}`);
        // @todo: Exit 1.
    }

    rabbitTestLoop();

    console.log('Setting the server..');
    server = app.listen(PORT, HOST, function () {
        console.log(`Running on http://${HOST}:${PORT}`);
        terminus(server, terminusOptions);
    });
}

run();
