#!/usr/bin/env node
'use strict';

const fs = require('fs');
const request = require('request-promise-native');
const { inspect } = require('util');

const { config } = require('./config');

let testList = JSON.parse(fs.readFileSync('./data/test-uuid-list.json', {encoding: 'utf8'}));
testList.origin = config.originId;

testList.uuidList.forEach((uuid) => {
    console.log(`UUID from file: ${uuid}`);
});

const uri = `http://${config.host}:${config.port}${config.resultOptions.path}`;

const options = {
    uri,
    timeout: 3000,
    method: config.method,
    headers: {
        'Content-Type': 'application/json',
    },
    json: true,
    body: {
        origin: config.originId,
        testUuids: testList.uuidList,
    },
};

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

/**
 * Do a single request.
 *
 * @return {Promise<Object>}
 *   The response as JSON object.
 */
async function doRequest() {
    try {
        return await request(options);
    }
    catch (error) {
        console.log(`Request failed. ${error.message}`);
        process.exitCode = 1;
        throw error;
    }
}

/**
 * Return every result that's available.
 *
 * This is needed as the results endpoint has a limit for returned results count.
 *
 * @return {Promise<Object>}
 *   The {results: <Object>} results.
 */
async function getEveryResult() {
    let finished = false;
    let results = {};

    while (finished === false) {
        console.log("\tRequesting results..");
        const json = await doRequest();

        if (
            (Array.isArray(json) && json.length === 0)
            || (Array.isArray(json.results) && json.results.length === 0)
            || (Object.entries(json).length === 0 && json.constructor === Object)
            || (Object.entries(json.results).length === 0 && json.results.constructor === Object)
        ) {
            console.log("\tNo more results..");
            finished = true;
        }
        else {
            console.log(`Current results json: ${inspect(json)}`);
            results = Object.assign({}, json);
            await delay(1000);
        }
    }

    return results;
}

/**
 * 
 * @param {Object} data
 */
function parseData(data) {
    console.log('Parsing data..');
    console.log(`\t${inspect(data)}`);
    let resultsUrls = [];
    let metrics = {
        testCount: 0,
        aggregated: {
            duration: {
                seconds: 0.0,
                minutes: 0.0,
                hours: 0.0,
            },
            testCount: 0,
            failedCount: 0,
            passedCount: 0,
            scenarioCount: 0,
            viewportCount: 0,
        },
        tests: {},
    };

    for (let key in data.results) {
        console.log(`PUSH url for ${key}`);
        resultsUrls.push(`[${key}](${data.results[key].data.resultsUrl})`);

        metrics.testCount += 1;
        metrics.tests[key] = {};

        metrics.tests[key].testCount = data.results[key].data.metadata.testCount;
        metrics.tests[key].scenarioCount = data.results[key].data.metadata.scenarioCount;
        metrics.tests[key].viewportCount = data.results[key].data.metadata.viewportCount;
        metrics.tests[key].failedCount = data.results[key].data.metadata.failedCount;
        metrics.tests[key].passedCount = data.results[key].data.metadata.passedCount;
        metrics.tests[key].duration = data.results[key].data.metadata.duration.full.duration;

        metrics.aggregated.testCount += data.results[key].data.metadata.testCount;
        metrics.aggregated.scenarioCount += data.results[key].data.metadata.scenarioCount;
        metrics.aggregated.viewportCount += data.results[key].data.metadata.viewportCount;
        metrics.aggregated.failedCount += data.results[key].data.metadata.failedCount;
        metrics.aggregated.passedCount += data.results[key].data.metadata.passedCount;
        metrics.aggregated.duration.seconds += data.results[key].data.metadata.duration.full.duration;
    }

    metrics.aggregated.duration.minutes = metrics.aggregated.duration.seconds / 60;
    metrics.aggregated.duration.hours = metrics.aggregated.duration.minutes / 60;

    if (resultsUrls.length > 0) {
        const date = (new Date()).getTime();
        fs.writeFileSync(`./data/results.${date}.data.json`, JSON.stringify(data, null, 2), {options: 'utf8'});
        fs.writeFileSync(`./data/results.${date}.metrics.json`, JSON.stringify(metrics, null, 2), {options: 'utf8'});
        fs.writeFileSync(`./data/results.${date}.urls.md`, JSON.stringify(resultsUrls, null, 2), {options: 'utf8'});
    }
}

getEveryResult()
    .then((data) => {
        parseData(data);
    })
    .catch((error) => {
        console.error(error);
    });
