"use strict";

/*
 * @todo: Use in testresults.js.
 */

const fs = require('fs');
const { inspect } = require('util');
const fileOptions = {
    encoding: 'utf8',
};

class Metrics {

    constructor() {
        this.rawTests = {};
        this.processedTests = {};
        this.urls = [];
        this.counts = {
            testRuns: 0,
            testCases: 0,
            failed: 0,
            passed: 0,
            scenarios: 0,
            viewports: 0,
        };
        this.duration = {
            seconds: 0.0,
            minutes: 0.0,
            hours: 0.0,
        };
    }

    /**
     * Add a single test.
     *
     * @param {String} uuid
     * @param {Object} test
     */
    addTest(uuid, test) {
        console.log(`Adding metrics for ${uuid}`);
        console.debug(inspect(test));

        this.counts.testRuns += 1;

        this.rawTests[uuid] = test;

        const testData = {
            testCount: test.data.metadata.testCount,
            scenarioCount: test.data.metadata.scenarioCount,
            viewportCount: test.data.metadata.viewportCount,
            failedCount: test.data.metadata.failedCount,
            passedCount: test.data.metadata.passedCount,
            duration: test.data.metadata.duration.full.duration,
        };

        this.urls.push({
            label: test.data.original_request.test_config.scenarios[0].url || uuid,
            uuid: uuid,
            url: test.data.resultsUrl,
            fail: test.data.metadata.failedCount > 0,
        });

        this.counts.testCases += testData.testCount;
        this.counts.failed += testData.failedCount;
        this.counts.passed += testData.passedCount;
        this.counts.scenarios += testData.scenarioCount;
        this.counts.viewports += testData.viewportCount;

        this.duration.seconds += testData.duration;
        this.duration.minutes = this.duration.seconds / 60;
        this.duration.hours = this.duration.minutes / 60;

        this.processedTests[uuid] = testData;
    }

    /**
     * Add multiple tests at once.
     *
     * @param tests
     */
    addMultipleTests(tests) {
        for (let uuid in tests) {
            this.addTest(uuid, tests[uuid]);
        }
    }

    /**
     * @param {Metrics} metrics
     */
    mergeMetrics(metrics) {
        // @todo.
    }

}

/**
 *
 * @param data
 * @return {{date: *, resultsUrls: *, processedTests: *, metrics: {duration: *, counts: *}, rawData: *}}
 */
function parseData(data) {
    const CurrentMetrics = new Metrics();
    CurrentMetrics.addMultipleTests(data);

    return {
        date: (new Date()).getTime(),
        resultsUrls: CurrentMetrics.urls,
        processedTests: CurrentMetrics.processedTests,
        metrics: {
            counts: CurrentMetrics.counts,
            duration: CurrentMetrics.duration,
        },
        rawData: CurrentMetrics.rawTests,
    };
}

function resultsToHtml(results) {
    const length = results.length;
    const processedUrls = results.sort((a, b) => {
        // Order failed ones first.
        if (a.fail === b.fail) {
            return 0;
        }

        if (a.fail === true) {
            return -1;
        }

        if (b.fail === true) {
            return 1;
        }
    }).map((value) => {
        const anchorClass = value.fail ? 'danger' : 'success';
        return `<li class="list-group-item"><a href=${value.url} class="alert alert-${anchorClass}" data-uuid="${value.uuid}" title="${value.uuid}" target="_blank" rel="noreferrer nofollow noopener" >${value.label}</a></li>`;
    }).join('');

    // @todo: Add some mustache.js or some templating.
    return `
    <!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous">
<script src="https://code.jquery.com/jquery-3.3.1.slim.min.js" integrity="sha384-q8i/X+965DzO0rT7abK41JStQIAqVgRVzpbzo5smXKp4YfRvH+8abtTE1Pi6jizo" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>
</head>
<body>
<h2>There are ${length} items in the list.</h2>
<ol class="list-group">
${processedUrls}
</ol>
</body>
</html>
`;
}

/**
 *
 * @param data
 * @return {{date: *, resultsUrls: *, processedTests: *, metrics: {duration: *, counts: *}, rawData: *}}
 */
function parseMultipleData(data) {
    const AggregatedMetrics = new Metrics();

    console.log('Adding multiple tests.');
    for (let subset of data) {
        console.log('Subset:');
        console.log(inspect(subset));
        AggregatedMetrics.addMultipleTests(subset.results);
    }

    return {
        rawData: AggregatedMetrics.rawTests,
        processedTests: AggregatedMetrics.processedTests,
        date: (new Date()).getTime(),
        resultsUrls: AggregatedMetrics.urls,
        metrics: {
            counts: AggregatedMetrics.counts,
            duration: AggregatedMetrics.duration,
        },
    };
}

/**
 * Json object to String.
 *
 * @param {Object} json
 * @return {string}
 */
function jsonToString(json) {
    return JSON.stringify(json, null, 2);
}

function fileToResults(fileName) {
    const rawResults = JSON.parse(fs.readFileSync('./data/results.raw-results.1565094991564.json', fileOptions));
    const parsed = parseMultipleData(rawResults);
    const metrics = {
        metrics: parsed.metrics,
        data: parsed.processedTests,
    };

    const resultsUrls = resultsToHtml(parsed.resultsUrls);

    fs.mkdirSync(`./data/${parsed.date}`);
    fs.writeFileSync(`./data/${parsed.date}/results.data.json`, jsonToString(parsed), fileOptions);
    fs.writeFileSync(`./data/${parsed.date}/results.metrics.json`, jsonToString(metrics), fileOptions);
    fs.writeFileSync(`./data/${parsed.date}/results.urls.html`, resultsUrls, fileOptions);
}

/**
 * @param {Object} data
 */
module.exports.parseData = parseData;
module.exports.parseMultipleData = parseMultipleData;
module.exports.resultsToHtml = resultsToHtml;
module.exports.fileToResults = fileToResults;
