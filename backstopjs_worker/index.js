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
const path = require('path');
const fs = require('fs');
const backstop = require('backstopjs');
const util = require('util');
const url = require('url');
const amqp = require('amqplib');

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

const signals = {
    'SIGHUP': 1,
    'SIGINT': 2,
    'SIGTERM': 15
};

const PORT = 8080;
const HOST = '0.0.0.0';
const workerConfig = loadWorkerConfig();
const rabbitConfiguration = {
    'queue': `backstop-${workerConfig['browser']}`,
    'exchange': 'backstop-worker',
    'routing': `${workerConfig['browser']}-tests`
};

let rabbitConnection = undefined;
let rabbitChannel = undefined;

ensureDirectory(path.join(__dirname, 'runtime'));
ensureDirectory(path.join(__dirname, 'runtime', workerConfig['browser']));

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

function startABTest(config) {
    console.log(util.inspect(config));

    return executeReference(config)
        .then(function () {
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
//       'engine_scripts': (workerConfig['browser'] === 'phantomjs') ? path.join('templates', workerConfig['scriptsFolder']) : path.join(__dirname, 'templates', workerConfig['scriptsFolder'])
//     },
//     'engine': workerConfig['engine'],
//     'asyncCaptureLimit': 10,
//     'asyncCompareLimit': 10,
//     'debug': (process.env.DEBUG === true),
//     'debugWindow': (process.env.DEBUG_WINDOW === true)
// };

function rabbitTestLoop() {
    console.time('rabbitTestLoop');

    rabbitRead()
        .then(data => {
            // @todo: Maybe use this for something.
            // const originalBackstopConfig = data;
            let backstopConfig = data;
            console.log('Data received. Config ID is: ' + backstopConfig['id']);
            const templates = path.join(__dirname, 'templates');
            const currentRuntime = path.join(__dirname, 'runtime', workerConfig['browser'], backstopConfig['id']);
            ensureDirectory(currentRuntime);

            backstopConfig['paths'] = {
                "engine_scripts": (workerConfig['browser'] === 'phantomjs') ? path.join('templates', workerConfig['scriptsFolder']) : path.join(templates, workerConfig['scriptsFolder']),
                "bitmaps_reference": path.join(currentRuntime, "reference"),
                "bitmaps_test": path.join(currentRuntime, "test"),
                "html_report": path.join(currentRuntime, "html_report"),
                "ci_report": path.join(currentRuntime, "ci_report")
            };

            Object.keys(backstopConfig['paths']).forEach(function (key) {
                ensureDirectory(backstopConfig['paths'][key]);
            });

            backstopConfig['engine'] = workerConfig['engine'];
            backstopConfig[workerConfig['engineOptions']['backstopKey']] = workerConfig['engineOptions']['options'];
            backstopConfig['asyncCaptureLimit'] = 10;
            backstopConfig['asyncCompareLimit'] = 10;

            if (process.env.DEBUG === true) {
                backstopConfig['debug'] = true;
            }
            if (process.env.DEBUG_WINDOW === true) {
                backstopConfig['debugWindow'] = true;
            }

            startABTest(backstopConfig)
                .finally(function () {
                    console.timeEnd('rabbitTestLoop');
                    console.log(`Test ${backstopConfig['id']} ended.`);
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

function connect() {
    const rabbitMqInternalURL = process.env.INTERNAL_RABBITMQ_URL;
    const parsedurl = url.parse(rabbitMqInternalURL);
    return amqp.connect(rabbitMqInternalURL, { servername: parsedurl.hostname })
        .then((conn) => {
            // Create a listener for each of the signals that we want to handle
            Object.keys(signals).forEach((signal) => {
                process.on(signal, function() { conn.close(); });
            });

            console.log('Connection to RabbitMQ has been established.');
            rabbitConnection = conn;
            return conn;
        })
        .then(conn => {
            return conn.createChannel();
        })
        .then(ch => {
            return ch.assertExchange(rabbitConfiguration['exchange'], 'direct', {})
                .then(() => {
                    return ch.assertQueue(rabbitConfiguration['queue'], {});
                })
                .then(() => {
                    return ch.prefetch(1);
                })
                .then(q => {
                    return ch.bindQueue(q.queue, rabbitConfiguration['exchange'], rabbitConfiguration['routing']);
                })
                .then(() => {
                    rabbitChannel = ch;
                    return ch;
                })
                .catch(err => {
                    console.error(err);
                    throw new Error(err.message);
                });
        })
        .catch((error) => {
            const timeout = 3000;
            console.log(`Connection to RabbitMQ failed. Retry in ${timeout / 1000} seconds ..`);
            console.log(util.inspect(error));
            delay(timeout).then(() => {
                connect();
            });
        });
}

connect().then(() => {
    rabbitTestLoop();
});

function rabbitRead() {
    return new Promise((resolve, reject) => {
        return rabbitChannel.get(rabbitConfiguration['queue'], {}).then(msgOrFalse => {
                if (msgOrFalse !== false) {
                    console.log("Reading from RabbitMQ:: [-] %s", `${msgOrFalse.content.toString()} : Message received at ${new Date()}`);
                    // @todo: Move this after the test has finished/failed.
                    rabbitChannel.ack(msgOrFalse);
                    resolve(JSON.parse(msgOrFalse.content.toString()));
                }
                else {
                    reject('No messages in queue.');
                }
        });
    });
}

// App
const app = express();
let server = undefined;

// Do any necessary shutdown logic for our application here
const shutdown = (signal, value) => {
    console.log("shutdown!");
    server.close(() => {
        console.log(`server stopped by ${signal} with value ${value}`);
        process.exitCode = 128 + value;
    });
};

connect().then(() => {
    server = app.listen(PORT, HOST, function () {
        console.log(`Running on http://${HOST}:${PORT}`);
    });

    // Create a listener for each of the signals that we want to handle
    Object.keys(signals).forEach((signal) => {
        process.on(signal, () => {
            console.log(`process received a ${signal} signal`);
            shutdown(signal, signals[signal]);
        });
    });

})
    .catch(error => {
        console.log(`Error while connecting to RabbitMQ: ${error}`);
    });
