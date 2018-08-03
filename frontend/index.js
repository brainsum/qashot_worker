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
const asyncHandlerMiddleware = require('express-async-handler');
const jwtHandlerMiddleware = require('express-jwt');

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';
const routingKey = "tests";
const exchangeName = "backstop-worker";
const qName = "backstop-puppeteer";

const supportedEngines = process.env.SUPPORTED_TESTER_ENGINES.split(';');

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

/**
 *
 * @param {Array|ArrayBuffer|SharedArrayBuffer|Buffer|string} message
 * @return {PromiseLike<T | never>}
 */
function rabbitWrite(message) {
    return rabbitConnection
        .then(conn => {
            return conn.createChannel();
        })
        .then(ch => {
            ch.publish(exchangeName, routingKey, Buffer.from(message));
            const msgTxt = message + " : Message sent at " + new Date();
            console.log(" [+] %s", msgTxt);
            return new Promise(resolve => {
                resolve(message);
            });
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

let rabbitConnection = undefined;
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
        return null;
    })
        .catch((error) => {
            const timeout = 3000;

            console.log(`Connection to RabbitMQ failed. Retry in ${timeout / 1000} seconds ..`);
            // console.log(util.inspect(error));
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
    console.log(`Incoming request at ${Date.now()}`);
    next();
});

app.get('/', function (req, res) {
  return res.json({ message: 'General Kenobi.'});
});

function rabbitWriteMultiple(messages) {
    // @todo: Implement.
    Array.prototype.forEach(function (message) {
        rabbitWriteTest(message)
            .then(function (resolve) {
                return resolve(`Message ${message} added to the queue.`);
            })
            .catch(function (reject) {
                return reject(`Couldn't add ${message} to the queue.`);
            });
    });
}

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
