'use strict';

// @todo: Check the "request" module, maybe it's more convenient.
const client = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const backstop = require('backstopjs');
const util = require('util');

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';

// App
const app = express();

function loadDockerId() {
    const childProcess = require('child_process');

    try {
        return childProcess.execSync(`cat /proc/self/cgroup | grep "docker" | sed s/\\\\//\\\\n/g | tail -1`);
    }
    catch (error) {
        console.error('There was an error while getting the docker ID.');
    }

    return undefined;
}

const dockerId = loadDockerId();

function loadWorkerConfig() {
    let browser = process.env.WORKER_BROWSER ? process.env.WORKER_BROWSER : undefined;

    const supportedBrowsers = [
        'chrome',
        'firefox',
    ];

    if (supportedBrowsers.includes(browser)) {
        // @todo: Add YML parsing.
        const filename = `worker-config.${browser}.json`;
        return JSON.parse(fs.readFileSync(path.join(__dirname, filename)));
    }

    throw new Error('Could not load configuration for the worker.');
}

const workerConfig = loadWorkerConfig();

console.log('Worker config should be loaded. See:');
console.log(util.inspect(workerConfig));

app.get('/', (req, res) => {
    client.get('http://frontend:8080/', (response) => {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });

        response.on('end', () => {
            res.send("Hello there! " + data);
        });
    });
});

app.get('/hello', (req, res) => {
    const message = req.query.message ? req.query.message : 'no msg';

    const name = dockerId ? `${dockerId} worker` : 'backstop worker';

    console.log(`${name} says: Hello there! ${message}`);
    res.send(`${name} says: Hello there! ${message}`);
});

app.listen(PORT, HOST, function () {
    console.log(`Running on http://${HOST}:${PORT}`);
});

function executeReference(config) {
    return backstop('reference', { config: config })
        .then(function () {
            console.error(`Reference success for test ${config['id']}.`);
        })
        .catch(function () {
            console.error(`Reference fail for test ${config['id']}.`);
        });
}

function executeTest(config) {
    return backstop('test', { config: config })
        .then(function () {
            console.log(`Test success for test ${config['id']}.`);
        })
        .catch(function () {
            console.log(`Test fail for test ${config['id']}.`);
        });
}

function startTest(config) {
    console.log(util.inspect(config));

    return executeReference(config)
        .then(function () {
            return executeTest(config);
        });
}

function ensureDirectory(path) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path, 0o775);
    }
}

function testLoop() {
    /** @todo
     * Clean up code (e.g use "request" module, maybe it's cleaner)
     * Add JWT authentication to the request
     * Add recursive call
     */

    console.time('testLoop');
    const payload = JSON.stringify({});
    const options = {
        hostname: 'frontend',
        port: 8080,
        path: '/api/v1/test/start',
        method: 'POST'
    };
    const request = client.request(options, function (response) {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });

        response.on('end', () => {
            const backstopConfig = JSON.parse(data);

            console.log('Data received. Config ID is: ' + backstopConfig['id']);

            const templates = path.join(__dirname, 'templates');
            const runtime = path.join(__dirname, 'runtime', backstopConfig['id']);

            ensureDirectory(runtime);

            // Engine options:
            // - puppeteer, chromy
            // - slimerjs
            // - casper
            backstopConfig['paths'] = {
                "engine_scripts": path.join(templates, "puppeteer_scripts"),
                "bitmaps_reference": path.join(runtime, "reference"),
                "bitmaps_test": path.join(runtime, "test"),
                "html_report": path.join(runtime, "html_report"),
                "ci_report": path.join(runtime, "ci_report")
            };

            backstopConfig['engineOptions'] = {
                'ignoreHTTPSErrors': false,
                'args': [
                    '--no-sandbox',
                    // '--disable-setuid-sandbox',
                ],
            };



            // backstopConfig['debug'] = true;
            // backstopConfig['debugWindow'] = true;

            Object.keys(backstopConfig['paths']).forEach(function (key) {
                ensureDirectory(backstopConfig['paths'][key]);
            });

            startTest(backstopConfig)
                .finally(function () {
                    console.timeEnd('testLoop');
                    console.log(`Test ${backstopConfig['id']} ended.`);
                    // testLoop();
                });
        });
    });

    request.on('error', function (error) {
        console.error(`Requesting a new test failed. Error: ${error.message}`);
    });

    request.write(payload);
    request.end();
}

testLoop();
