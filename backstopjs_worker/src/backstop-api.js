'use strict';

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('promisify-child-process');

const backstop = require('backstopjs');

const appRootDir = require('./app-root');
const workerConfig = require('./worker-config');

const RESULTS_ENDPOINT_URL = process.env.RESULTS_ENDPOINT_URL;

let backstopMetrics = {};
let runtimeLogs = {};

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
                console.log(`The "reference" command ended successfully.`);

                runtimeLogs.reference = {};
                runtimeLogs.reference.out = outLogFileName;
                runtimeLogs.reference.err = errLogFileName;
                runtimeLogs.reference.errorMessage = '';
            })
            .catch(error => {
                backstopMetrics.reference.end = new Date();
                console.log(`The "reference" command ended with an error.`);

                runtimeLogs.reference = {};
                runtimeLogs.reference.out = outLogFileName;
                runtimeLogs.reference.err = errLogFileName;
                runtimeLogs.reference.errorMessage = error.message;
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
                console.log(`The "test" command ended successfully.`);

                runtimeLogs.test = {};
                runtimeLogs.test.out = outLogFileName;
                runtimeLogs.test.err = errLogFileName;
                runtimeLogs.test.errorMessage = '';
            })
            .catch(error => {
                backstopMetrics.test.end = new Date();
                console.log(`The "test" command ended with an error.`);

                runtimeLogs.test = {};
                runtimeLogs.test.out = outLogFileName;
                runtimeLogs.test.err = errLogFileName;
                runtimeLogs.test.errorMessage = error.message;
            });
    }

}
else {
    commands.reference = async function executeReference(configPath) {
        const config = loadConfig(configPath);

        backstopMetrics.reference = {
            'start': new Date()
        };

        // @todo: Use "fork" and execute this as a child process, so we can capture the logs in files?
        try {
            const results = backstop('reference', { config: config });
            console.log(`The "reference" command ended successfully.`);
            backstopMetrics.reference.end = new Date();

            runtimeLogs.reference = {};
            runtimeLogs.reference.out = '';
            runtimeLogs.reference.err = '';
            runtimeLogs.reference.errorMessage = '';
        }
        catch (error) {
            console.log(`The "reference" command ended with an error.`);
            backstopMetrics.reference.end = new Date();

            runtimeLogs.reference = {};
            runtimeLogs.reference.out = '';
            runtimeLogs.reference.err = '';
            runtimeLogs.reference.errorMessage = error.message;
        }
    };

    commands.test = async function executeTest(configPath) {
        const config = loadConfig(configPath);

        backstopMetrics.test = {
            'start': new Date()
        };

        try {
            const results = backstop('test', { config: config });
            console.log(`The "test" command ended successfully.`);
            backstopMetrics.test.end = new Date();

            runtimeLogs.test = {};
            runtimeLogs.test.out = '';
            runtimeLogs.test.err = '';
            runtimeLogs.test.errorMessage = '';
        }
        catch (error) {
            console.log(`The "test" command ended with an error.`);
            backstopMetrics.test.end = new Date();

            runtimeLogs.test = {};
            runtimeLogs.test.out = '';
            runtimeLogs.test.err = '';
            runtimeLogs.test.errorMessage = error.message;
        }
    };
}

/**
 *
 * @param {Object} config
 * @return {*|void|PromiseLike<T | never>|Promise<T | never>}
 */
const runABTest = async function runABTest(config) {
    backstopMetrics = {
        full: {
            start: new Date()
        },
    };
    runtimeLogs = {};

    const configPath = path.join(appRootDir, 'runtime', workerConfig['browser'], config['id'], 'backstop.json');

    try {
        fs.writeFileSync(configPath, JSON.stringify(config));
    }
    catch (error) {
        backstopMetrics.full.end = new Date();
        throw error;
    }

    try {
        // Contains either:
        // - {message: str, logs: {out: str, err: str}}
        // - whatever backstop returns
        const reference = await commands.reference(configPath);
    }
    catch (exception) {
        console.error(`Test error | reference command: ${error.message}`);
        backstopMetrics.full.end = new Date();
        throw error;
    }

    try {
        // Contains either:
        // - {message: str, logs: {out: str, err: str}}
        // - whatever backstop returns
        const test = await commands.test(configPath);
    }
    catch (exception) {
        console.error(`Test error | test command: ${error.message}`);
        backstopMetrics.full.end = new Date();
        throw error;
    }

    try {
        const reportUpdate = await customizeHtmlReportsPage(config['paths']['html_report']);
    }
    catch (error) {
        console.error(`Test error | html reports update: ${error.message}`);
        backstopMetrics.full.end = new Date();
        throw error;
    }

    backstopMetrics.full.end = new Date();
    return 'Ok';
};

/**
 *
 * @param {Object} backstopConfig
 * @param {Object} backstopResults
 * @return {Promise<any>}
 */
const parseResults = async function parseResults(backstopConfig, backstopResults) {
    return new Promise(resolve => {
        let passedCount = 0;
        let failedCount = 0;
        let parsedResults = [];

        const resultsBasePath = `${RESULTS_ENDPOINT_URL}/reports/${workerConfig.browser}/${backstopConfig.id}`;

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
                'success': (failedCount === 0 && testCount > 0 && testCount === expectedTestCount),
            },
            'logs': runtimeLogs,
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
const loadResults = async function loadResults(reportPath, id) {
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

/**
 * Customize the HTML Report page for QAShot.com.
 *
 * @throws Error
 *   If a filesystem operation fails.
 *
 * @param {string} reportPath
 *   The path to the HTML Report.
 *
 * @return {Promise<string>}
 *   Success message.
 */
const customizeHtmlReportsPage = async function customizeHtmlReportsPage(reportPath) {
    const qashotComparePath = path.join(appRootDir, 'node_modules', 'qashot-compare');
    const customReportFolder = path.join(qashotComparePath, 'output');
    const resultFile = path.join(reportPath, 'config.js');

    // We only require read for this.
    await fs.access(customReportFolder, fs.constants.R_OK);

    // Read config.js into memory.
    const resultData = await fs.readFile(resultFile, 'utf8');

    await fs.emptyDir(reportPath);
    await fs.copy(customReportFolder, reportPath);

    // Write config.js to disk.
    await fs.writeFile(resultFile, resultData);

    return 'Custom reports page copied.';
};

module.exports = {
    runABTest,
    loadResults,
    parseResults
};
