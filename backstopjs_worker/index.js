'use strict';

// @todo: Check the "request" module, maybe it's more convenient.
const client = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const backstop = require('backstopjs');
const util = require('util');
const url = require('url');
const amqp = require('amqplib');

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';
const routingKey = "tests";
const exchangeName = "backstop-worker";
const qName = "backstop-puppeteer";

let rabbitConnection = undefined;

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

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

function rabbitTestLoop() {
    console.time('rabbitTestLoop');

    rabbitRead()
        .then(data => {
            const backstopConfig = data;
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
                    rabbitTestLoop();
                });
        })
        .catch(error => {
            console.log(`Couldn't read from RabbitMQ: ${error}`);
            const timeout = 10000;
            return delay(timeout).then(() => {
                rabbitTestLoop();
            });
        });

}

function rabbitSetup() {
    rabbitConnection.then(conn => {
        return conn.createChannel();
    })
        .then(ch => {
            return ch.
            assertExchange(exchangeName, 'direct', { durable: true })
                .then(() => {
                    return ch.assertQueue(qName, { exclusive: false });
                })
                .then(q => {
                    return ch.bindQueue(q.queue, exchangeName, routingKey);
                });
        })
        .catch(err => {
            console.error(err);
            throw new Error(err.message);
        });
}

function connect() {
    const connectionString = process.env.COMPOSE_RABBITMQ_URL;

    if (connectionString === undefined) {
        console.error("Please set the COMPOSE_RABBITMQ_URL environment variable");
        throw new Error("Please set the COMPOSE_RABBITMQ_URL environment variable");
    }

    const parsedurl = url.parse(connectionString);
    const connection = amqp.connect(connectionString, { servername: parsedurl.hostname });
    connection.then(() => {
        console.log('Connection to RabbitMQ has been established.');
        rabbitConnection = connection;
        rabbitSetup();
        rabbitTestLoop();
        return null;
    })
        .catch((error) => {
            const timeout = 3000;

            console.log(`Connection to RabbitMQ failed. Retry in ${timeout / 1000} seconds..`);
            // console.log(util.inspect(error));
            delay(timeout).then(() => {
                connect();
            });
        });
}

connect();

// function rabbitWrite(message) {
//     return rabbitConnection
//         .then(conn => {
//             conn.createChannel();
//         })
//         .then(ch => {
//             ch.publish(exchangeName, routingKey, Buffer.from(message));
//             const msgTxt = message + " : Message sent at " + new Date();
//             console.log(" [+] %s", msgTxt);
//             return new Promise(resolve => {
//                 resolve(message);
//             });
//         });
// }

function rabbitRead() {
    return rabbitConnection
        .then(conn => {
            return conn.createChannel();
        })
        .then(ch => {
            return ch.get(qName, {}).then(msgOrFalse => {
                // let result = "No messages in queue";
                // if (msgOrFalse !== false) {
                //     result = `${msgOrFalse.content.toString()} : Message received at ${new Date()}`;
                //     ch.ack(msgOrFalse);
                // }
                // console.log("Reading from RabbitMQ:: [-] %s", result);

                return new Promise((resolve, reject) => {
                    if (msgOrFalse !== false) {
                        console.log("Reading from RabbitMQ:: [-] %s", `${msgOrFalse.content.toString()} : Message received at ${new Date()}`);
                        ch.ack(msgOrFalse);
                        resolve(JSON.parse(msgOrFalse.content.toString()));
                    }
                    else {
                        reject('No messages in queue.');
                    }
                });
            });
        });
}

function loadDockerId() {
    const childProcess = require('child_process');

    // @todo: Or, just use the HOSTNAME env variable.
    // @note: HOSTNAME contains a shorter version of the ID.
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

// App
const app = express();
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

const server = app.listen(PORT, HOST, function () {
    console.log(`Running on http://${HOST}:${PORT}`);
});

// The signals we want to handle
// NOTE: although it is tempting, the SIGKILL signal (9) cannot be intercepted and handled
const signals = {
    'SIGHUP': 1,
    'SIGINT': 2,
    'SIGTERM': 15
};
// Do any necessary shutdown logic for our application here
const shutdown = (signal, value) => {
    console.log("shutdown!");
    server.close(() => {
        console.log(`server stopped by ${signal} with value ${value}`);
        process.exit(128 + value);
    });
};
// Create a listener for each of the signals that we want to handle
Object.keys(signals).forEach((signal) => {
    process.on(signal, () => {
        console.log(`process received a ${signal} signal`);
        shutdown(signal, signals[signal]);
    });
});
