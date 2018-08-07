'use strict';

function preFlightCheck() {
    const requiredEnvVars = [
        'SUPPORTED_TESTER_ENGINES',
        'COMPOSE_RABBITMQ_URL',
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
const url = require('url');
const amqp = require('amqplib');
const util = require('util');
const asyncHandlerMiddleware = require('express-async-handler');
const jwtHandlerMiddleware = require('express-jwt');

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';

const signals = {
    'SIGHUP': 1,
    'SIGINT': 2,
    'SIGTERM': 15
};

const rabbitConfiguration = {
    'puppeteer': {
        'queue': 'backstop-puppeteer',
        'exchange': 'backstop-worker',
        'routing': 'tests'
    }
};

const supportedEngines = process.env.SUPPORTED_TESTER_ENGINES.split(';');

let rabbitConnection = undefined;
let rabbitChannel = undefined;

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

/**
 * Publish the message to rabbit.
 *
 * @param {Array|ArrayBuffer|SharedArrayBuffer|Buffer|string} message
 * @return {Promise<any | never>}
 */
function rabbitWrite(message) {
    return new Promise(resolve => {
        rabbitChannel.publish(rabbitConfiguration['puppeteer']['exchange'], rabbitConfiguration['puppeteer']['routing'], Buffer.from(message), {
            contentType: 'application/json'
        });
        const msgTxt = message + " : Message sent at " + new Date();
        console.log(" [+] %s", msgTxt);
        return resolve(message);
    })
        .catch(err => {
            console.error(err);
            throw new Error(err.message);
        });
}

/**
 *
 * @param {Object} test
 * @return {PromiseLike<T | never>}
 */
function rabbitWriteTest(test) {
    const message = JSON.stringify(test);
    return rabbitWrite(message);
}

function connect() {
    const connectionString = process.env.COMPOSE_RABBITMQ_URL;

    if (connectionString === undefined) {
        console.error("Please set the COMPOSE_RABBITMQ_URL environment variable");
        throw new Error("Please set the COMPOSE_RABBITMQ_URL environment variable");
    }

    const parsedurl = url.parse(connectionString);
    amqp.connect(connectionString, { servername: parsedurl.hostname })
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
            return ch.assertExchange(rabbitConfiguration['puppeteer']['exchange'], 'direct', {})
                .then(() => {
                    return ch.assertQueue(rabbitConfiguration['puppeteer']['queue'], {});
                })
                .then(() => {
                    return ch.prefetch(1);
                })
                .then(q => {
                    return ch.bindQueue(q.queue, rabbitConfiguration['puppeteer']['exchange'], rabbitConfiguration['puppeteer']['routing']);
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

connect();

// App
const app = express();

app.use(express.json({
    strict: true
}));

/*
// Header:: "Authorization: Bearer <token>"
// @see: https://github.com/auth0/node-jsonwebtoken#jwtverifytoken-secretorpublickey-options-callback
app.use(jwtHandlerMiddleware({
    secret: Buffer.from(process.env.JWT_SECRET_KEY),
    requestProperty: 'auth',
    audience: '',
    issuer: '',
    algorithms: ['HS256']
}));

// https://github.com/jfromaniello/express-unless
// jwt().unless({path: [/cica]})
*/
// @todo: Implement JWT auth.
app.use(function (req, res, next) {
    let date = new Date().toISOString();
    console.log(`Incoming request: ${req.method} ${req.path} at ${date}`);
    next();
});

app.get('/', function (req, res) {
  return res.json({ message: 'General Kenobi.'});
});

// function rabbitWriteMultiple(messages) {
//     // @todo: Implement.
//     Array.prototype.forEach(function (message) {
//         rabbitWriteTest(message)
//             .then(function (resolve) {
//                 return resolve(`Message ${message} added to the queue.`);
//             })
//             .catch(function (reject) {
//                 return reject(`Couldn't add ${message} to the queue.`);
//             });
//     });
// }

/**
 * Check a test config for issues.
 *
 * @param config
 * @return {Array} The errors during validation. If it's an empty array, the config is valid.
 */
function verifyTestConfig(config) {
    let errors = [];

    if (!config.hasOwnProperty('id')) {
        errors.push('The required id field is missing from the test.');
    }

    if (!config.hasOwnProperty('engine') || !supportedEngines.includes(config['engine'])) {
        errors.push('The required "engine" field is invalid or missing from the test.');
    }

    if (!config.hasOwnProperty('viewports') || !Array.isArray(config['viewports']) || config['viewports'].length === 0) {
        errors.push('The required "viewports" field is invalid or missing from the test.');
    }
    if (!config.hasOwnProperty('scenarios') || !Array.isArray(config['scenarios']) || config['scenarios'].length === 0) {
        errors.push('The required "scenarios" field is invalid or missing from the test.');
    }

    return errors;
}

// @todo: Implement bulk-add?

app.post('/api/v1/test/add', asyncHandlerMiddleware(async function (req, res) {
    if (undefined === req.body) { // || req.body.length === 0
        res.statusCode = 400;
        return res.json({message: 'Empty request.'});
    }

    let testConfig = req.body;

    // @todo: testConfig should be in req.body.test
    // Body should contain the following:
    // Run type: A/B or before-after
    // @todo: Maybe infer run type from tests.
    // If both ref/test urls are added and they are not the same: A/B
    // Otherwise, B/A.
    const configErrors = verifyTestConfig(testConfig);
    if (configErrors.length !== 0) {
        res.statusCode = 400;
        return res.json({
            message: 'The config is not a valid test config.',
            errors: configErrors
        });
    }

    try {
        await rabbitWriteTest(testConfig);
        return res.json({
            message: 'The test has been added to the queue.',
            test: testConfig
        });
    }
    catch (error) {
        console.log(error);
        res.statusCode = 400;
        return res.json({
            message: 'Could not add test to the queue.',
            test: testConfig,
            error: error
        });
    }
}));

const server = app.listen(PORT, HOST, function () {
    console.log(`Running on http://${HOST}:${PORT}`);
});

// The signals we want to handle
// NOTE: although it is tempting, the SIGKILL signal (9) cannot be intercepted and handled

// Do any necessary shutdown logic for our application here
const shutdown = (signal, value) => {
    console.log("shutdown!");
    server.close(() => {
        console.log(`server stopped by ${signal} with value ${value}`);
        process.exitCode = 128 + value;
    });
};
// Create a listener for each of the signals that we want to handle
Object.keys(signals).forEach((signal) => {
    process.on(signal, () => {
        console.log(`process received a ${signal} signal`);
        shutdown(signal, signals[signal]);
    });
});
