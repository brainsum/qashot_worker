'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('promisify-child-process');

const backstop = require('backstopjs');

const appRootDir = require('./app-root');
const workerConfig = require('./worker-config');

const RESULTS_ENDPOINT_URL = process.env.RESULTS_ENDPOINT_URL;

let backstopMetrics = {};
const commands = {
    test: null,
    reference: null
};

/**
 *
 * @param {String} configPath
 * @return {Object}
 */
function loadConfig(configPath) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function zeroPad(number, length = 2) {
    let str = '' + number;
    while (str.length < length) {
        str = '0' + str;
    }

    return str;
}

function dateToDirname() {
    const date = new Date();
    return `${date.getFullYear()}${zeroPad(date.getMonth() + 1)}${zeroPad(date.getDay())}-${zeroPad(date.getHours())}${zeroPad(date.getMinutes())}${zeroPad(date.getSeconds())}`;
}

// @todo: Temporary solution. When firefox works without xvfb, remove this.
if ('firefox' === workerConfig.browser) {

    let logFileDate = null;

    /**
     *
     * @param configPath
     * @returns {Promise<*>}
     */
    commands.reference = async function executeReferenceChildProcess(configPath) {
        if (null === logFileDate) {
            logFileDate = dateToDirname();
        }
        console.log('Running the reference command.');
        const logFileDir = path.join(path.dirname(configPath), 'logs');
        const outLogFileName = `${logFileDate}.reference.stdout.logs`;
        const outLogFilePath = path.join(logFileDir, outLogFileName);
        let outLog = fs.openSync(outLogFilePath, 'w');

        const errLogFileName = `${logFileDate}.reference.stderr.logs`;
        const errLogFilePath = path.join(logFileDir, errLogFileName);
        let errLog = fs.openSync(errLogFilePath, 'w');

        const execConfig = {
            shell: true,
            // 15 minutes
            timeout: 15 * 60 * 1000,
            stdio: [
                'ignore',
                outLog,
                errLog
            ]
        };

        backstopMetrics.reference = {
            'start': new Date()
        };

        return spawn(`xvfb-run -a backstop reference --configPath=${configPath}`, [], execConfig)
            .then(() => {
                backstopMetrics.reference.end = new Date();
                return Promise.resolve({
                    message: 'The "reference" command ended successfully.',
                    logs: {
                        out: outLogFilePath,
                        err: errLogFilePath
                    }
                });
            })
            .catch(error => {
                backstopMetrics.reference.end = new Date();
                console.log(`Error while running the reference command: ${error.message}`);
                return Promise.reject({
                    message: 'The "reference" command ended with an error.',
                    logs: {
                        out: outLogFilePath,
                        err: errLogFilePath
                    }
                });
            });
    };

    /**
     *
     * @param configPath
     * @returns {Promise<*>}
     */
    commands.test = async function executeTestChildProcess(configPath) {
        if (null === logFileDate) {
            logFileDate = dateToDirname();
        }

        console.log('Running the test command.');
        const logFileDir = path.join(path.dirname(configPath), 'logs');
        const outLogFileName = `${logFileDate}.test.stdout.logs`;
        const outLogFilePath = path.join(logFileDir, outLogFileName);
        let outLog = fs.openSync(outLogFilePath, 'w');

        const errLogFileName = `${logFileDate}.test.stderr.logs`;
        const errLogFilePath = path.join(logFileDir, errLogFileName);
        let errLog = fs.openSync(errLogFilePath, 'w');

        logFileDate = null;

        const execConfig = {
            shell: true,
            // 15 minutes
            timeout: 15 * 60 * 1000,
            stdio: [
                'ignore',
                outLog,
                errLog
            ]
        };

        backstopMetrics.test = {
            'start': new Date()
        };

        return spawn(`xvfb-run -a backstop test --configPath=${configPath}`, execConfig)
            .then(() => {
                backstopMetrics.test.end = new Date();
                return Promise.resolve({
                    message: 'The "test" command ended successfully.',
                    logs: {
                        out: outLogFilePath,
                        err: errLogFilePath
                    }
                });
            })
            .catch(error => {
                backstopMetrics.test.end = new Date();
                console.log(`Error while running the test command: ${error.message}`);
                // @todo: Add logs to the backstopMetrics instead of returning them.
                // These return vals are not used anyways.
                return Promise.reject({
                    message: 'The "test" command ended with an error.',
                    logs: {
                        out: outLogFilePath,
                        err: errLogFilePath
                    }
                });
            });
    }

}
else {
    commands.reference = function executeReference(configPath) {
        const config = loadConfig(configPath);

        backstopMetrics.reference = {
            'start': new Date()
        };
        // @todo: Use "fork" and execute this as a child process, so we can capture the logs in files.
        return backstop('reference', { config: config })
            .then(function () {
                console.log(`Reference success for test ${config.id}.`);
                backstopMetrics.reference.end = new Date();
            })
            .catch(function () {
                console.error(`Reference fail for test ${config.id}.`);
                backstopMetrics.reference.end = new Date();
            });
    };

    commands.test = function executeTest(configPath) {
        const config = loadConfig(configPath);

        backstopMetrics.test = {
            'start': new Date()
        };
        return backstop('test', { config: config })
            .then(function () {
                console.log(`Test success for test ${config.id}.`);
                backstopMetrics.test.end = new Date();
            })
            .catch(function () {
                console.error(`Test fail for test ${config.id}.`);
                backstopMetrics.test.end = new Date();
            });
    };
}

/**
 *
 * @param {Object} config
 * @return {*|void|PromiseLike<T | never>|Promise<T | never>}
 */
const runABTest = function runABTest(config) {
    backstopMetrics = {
        full: {
            start: new Date()
        }
    };

    const configPath = path.join(appRootDir, 'runtime', workerConfig['browser'], config['id'], 'backstop.json');

    try {
        fs.writeFileSync(configPath, JSON.stringify(config));
    }
    catch (error) {
        backstopMetrics.full.end = new Date();
        return Promise.reject(error);
    }

    return commands.reference(configPath)
        .then(function () {
            return commands.test(configPath);
        })
        .catch(function (error) {
            console.error(`Test error: ${error.message}`);
            return error;
        })
        .finally(function () {
            backstopMetrics.full.end = new Date();
        });
};

/**
 *
 * @param {Object} backstopConfig
 * @param {Object} backstopResults
 * @return {Promise<any>}
 */
const parseResults = function parseResults(backstopConfig, backstopResults) {
    return new Promise(resolve => {
        let passedCount = 0;
        let failedCount = 0;
        let parsedResults = [];

        const resultsBasePath = `http://${RESULTS_ENDPOINT_URL}/reports/${workerConfig.browser}/${backstopConfig.id}`;

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
                'referenceUrl': null,
                'testUrl': null,
                'diffUrl': null,
                'misMatchPercentage': null
            };

            if ('undefined' !== typeof test.pair.diff && 'undefined' !== typeof test.pair.diff.misMatchPercentage) {
                currentResult.misMatchPercentage = test.pair.diff.misMatchPercentage;
            }

            if (test.pair.reference) {
                currentResult.referenceUrl = `${resultsBasePath}/${test.pair.reference.replace('../', '')}`;
            }
            if (test.pair.test) {
                currentResult.testUrl = `${resultsBasePath}/${test.pair.test.replace('../', '')}`;
            }
            if (test.pair.diffImage) {
                currentResult.diffUrl = `${resultsBasePath}/${test.pair.diffImage.replace('../', '')}`;
            }
            if (test.pair.error) {
                currentResult.error = test.pair.error;
            }

            parsedResults.push(currentResult);
        });

        const viewportCount = backstopConfig.viewports.length;
        const scenarioCount = backstopConfig.scenarios.length;
        const expectedTestCount = viewportCount * scenarioCount;
        const testCount = passedCount + failedCount;
        const passRate = (testCount === 0) ? 0 : passedCount / testCount;

        Object.keys(backstopMetrics).forEach(function (command) {
            backstopMetrics[command].duration = (backstopMetrics[command].end - backstopMetrics[command].start) / 1000;
            backstopMetrics[command].metric_type = 'seconds';
        });

        let finalResults = {
            'metadata': {
                'id': backstopConfig.id,
                'mode': 'a_b',
                'stage': null,
                'browser': workerConfig.browser,
                'engine': workerConfig.engine,
                'viewportCount': viewportCount,
                'scenarioCount': scenarioCount,
                'duration': backstopMetrics,
                'testCount': testCount,
                'passedCount': passedCount,
                'failedCount': failedCount,
                'passRate': passRate,
                'success': (failedCount === 0 && testCount > 0 && testCount === expectedTestCount)
            },
            'results': parsedResults,
            'resultsUrl': `${resultsBasePath}/html_report`
        };
        return resolve(finalResults);
    });
};

/**
 *
 * @param {String} reportPath
 * @param {String|Number} id
 * @return {Promise<any>}
 */
const loadResults = function loadResults(reportPath, id) {
    return new Promise(((resolve, reject) => {
        const resultFile = path.join(reportPath, 'config.js');
        if (!fs.existsSync(resultFile)) {
            return reject(`The results file for the ${id} test does not exits.`);
        }
        // @todo: This should work, but making it more robust would be nice.
        const results = JSON.parse(fs.readFileSync(resultFile, 'utf8').replace('report(', '').replace(');', ''));
        return resolve(results);
    }));
};

module.exports = {
    runABTest,
    loadResults,
    parseResults
};
