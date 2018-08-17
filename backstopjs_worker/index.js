'use strict';

function preFlightCheck() {
    const requiredEnvVars = [
        'WORKER_BROWSER',
        'WORKER_ENGINE',
        'INTERNAL_RABBITMQ_URL',
        'JWT_SECRET_KEY'
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

const express = require('express');
const terminus = require('@godaddy/terminus');
const path = require('path');
const fs = require('fs');
const backstop = require('backstopjs');
const util = require('util');
const url = require('url');

const internalMessageQueue = require('./src/message-queue');

function loadWorkerConfig() {
    const supportedBrowsers = [
        'chrome',
        'firefox',
        'phantomjs'
    ];

    if (supportedBrowsers.includes(process.env.WORKER_BROWSER)) {
        const filename = `worker-config.${process.env.WORKER_BROWSER}.json`;
        return JSON.parse(fs.readFileSync(path.join(__dirname, filename)));
    }

    throw new Error('Could not load configuration for the worker.');
}

function ensureDirectory(path) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path, 0o775);
    }
}

const PORT = 8080;
const HOST = '0.0.0.0';
const workerConfig = loadWorkerConfig();
let internalChannelConfigs = {};
internalChannelConfigs[workerConfig.browser] = {
    'name': workerConfig.browser,
    'queue': `backstop-${workerConfig.browser}`,
    'exchange': 'backstop-worker',
    'routing': `${workerConfig.browser}-tests`
};

const parsedUrl = url.parse(process.env.INTERNAL_RABBITMQ_URL);
const auth = parsedUrl.auth.split(':');
const internalConnectionOptions = {
    protocol: 'amqp',
    hostname: parsedUrl.hostname,
    port: 5672,
    username: auth[0],
    password: auth[1],
    locale: 'en_US',
    frameMax: 0,
    channelMax: 0,
    heartbeat: 30,
    vhost: '/',
};

let commandMetrics = {};

ensureDirectory(path.join(__dirname, 'runtime'));
ensureDirectory(path.join(__dirname, 'runtime', workerConfig.browser));

function executeReference(config) {
    commandMetrics.reference = {
        'start': new Date()
    };
    return backstop('reference', { config: config })
        .then(function () {
            console.log(`Reference success for test ${config.id}.`);
            commandMetrics.reference.end = new Date();
        })
        .catch(function () {
            console.error(`Reference fail for test ${config.id}.`);
            commandMetrics.reference.end = new Date();
        });
}

function executeTest(config) {
    commandMetrics.test = {
        'start': new Date()
    };
    return backstop('test', { config: config })
        .then(function () {
            console.log(`Test success for test ${config.id}.`);
            commandMetrics.test.end = new Date();
        })
        .catch(function () {
            console.error(`Test fail for test ${config.id}.`);
            commandMetrics.test.end = new Date();
        });
}

/**
 *
 * @param {Object} backstopConfig
 * @param {Object} backstopResults
 * @return {Promise<any>}
 */
function parseResults(backstopConfig, backstopResults) {
    return new Promise(resolve => {
        let passedCount = 0;
        let failedCount = 0;
        let parsedResults = [];

        backstopResults.tests.forEach(function(test) {
            const isSuccess = (test.status === 'pass');
            if (isSuccess) {
                ++passedCount;
            }
            else {
                ++failedCount;
            }

            let currentResult = {
                'scenarioLabel': test.pair.label,
                'viewportLabel': test.pair.viewportLabel,
                'success': isSuccess,
                'reference': test.pair.reference,
                'test': test.pair.test,
                'diffImage': test.pair.diffImage,
                'misMatchPercentage': test.pair.diff.misMatchPercentage
            };

            parsedResults.push(currentResult);
        });

        const testCount = passedCount + failedCount;
        const passRate = (testCount === 0) ? 0 : passedCount / testCount;

        Object.keys(commandMetrics).forEach(function (command) {
            commandMetrics[command].duration = (commandMetrics[command].end - commandMetrics[command].start) / 1000;
            commandMetrics[command].metric_type = 'seconds';
        });

        let finalResults = {
            'metadata': {
                'id': backstopConfig.id,
                'mode': 'a_b',
                'stage': null,
                'browser': workerConfig.browser,
                'engine': workerConfig.engine,
                'viewportCount': backstopConfig.viewports.length,
                'scenarioCount': backstopConfig.scenarios.length,
                'duration': commandMetrics,
                'testCount': testCount,
                'passedCount': passedCount,
                'failedCount': failedCount,
                'passRate': passRate,
                'success': (failedCount === 0)
            },
            'results': parsedResults
        };
        return resolve(finalResults);
    });
}

/**
 *
 * @param {String} reportPath
 * @param {String|Number} id
 * @return {Promise<any>}
 */
function loadResults(reportPath, id) {
    return new Promise(((resolve, reject) => {
        const resultFile = path.join(reportPath, 'config.js');
        if (!fs.existsSync(resultFile)) {
            return reject(`The results file for the ${id} test does not exits.`);
        }
        // @todo: This should work, but making it more robust would be nice.
        const results = JSON.parse(fs.readFileSync(resultFile, 'utf8').replace('report(', '').replace(');', ''));
        return resolve(results);
    }));
}

/**
 *
 * @param {Object} results
 * @return {Promise<any>}
 */
function sendResults(results) {
    return new Promise(((resolve, reject) => {
        console.log(util.inspect(results));

        resolve('TODO:: Implement sendResults function..');
    }));
}

/**
 *
 * @param {Object} backstopConfig
 * @return {Promise<any | never>}
 */
function pushResults(backstopConfig) {
    return loadResults(backstopConfig.paths.html_report, backstopConfig.id).then(loadedResults => {
        return parseResults(backstopConfig, loadedResults);
    })
        .then(parsedResults => {
            return sendResults(parsedResults);
        })
        .catch((error) => {
            return error;
        });
}

function runABTest(config) {
    commandMetrics.full = {
        'start': new Date()
    };
    console.log(util.inspect(config));

    return executeReference(config)
        .then(function () {
            commandMetrics.full.end = new Date();
            return executeTest(config);
        });
}

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

// const defaultTestConfig = {
//     'paths': {
//       'engine_scripts': (workerConfig.browser === 'phantomjs') ? path.join('templates', workerConfig.scriptsFolder) : path.join(__dirname, 'templates', workerConfig.scriptsFolder)
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
        .then(data => {
            // @todo: Maybe use this for something.
            // const originalBackstopConfig = data;
            let backstopConfig = data;
            console.log('Data received. Config ID is: ' + backstopConfig.id);
            const templates = path.join(__dirname, 'templates');
            const currentRuntime = path.join(__dirname, 'runtime', workerConfig.browser, backstopConfig.id);
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

            if (process.env.DEBUG === true) {
                backstopConfig.debug = true;
            }
            if (process.env.DEBUG_WINDOW === true) {
                backstopConfig.debugWindow = true;
            }

            fs.writeFileSync(path.join(currentRuntime, 'backstop.json'), JSON.stringify(backstopConfig));

            runABTest(backstopConfig)
                .finally(async function () {
                    console.timeEnd('rabbitTestLoop');
                    console.log(`Test ${backstopConfig.id} ended.`);
                    const results = await pushResults(backstopConfig);
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
        internalMessageQueue.connection().close(),
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
    try {
        await internalMessageQueue.connect(internalConnectionOptions, internalChannelConfigs);
    }
    catch (error) {
        console.log(`Error while connecting to RabbitMQ: ${error}`);
        await delay(3000);
        run();
    }

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
