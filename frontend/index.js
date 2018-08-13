'use strict';

function preFlightCheck() {
    const requiredEnvVars = [
        'SUPPORTED_BROWSERS',
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

const supportedBrowsers = process.env.SUPPORTED_BROWSERS.split(';');
const supportedModes = {
    'a_b': [],
    'before_after': [
        'before',
        'after'
    ]
};

function getRabbitConfig() {
    let config = {};
    supportedBrowsers.forEach((browser) => {
        config[browser] = {
            'queue': `backstop-${browser}`,
            'exchange': 'backstop-worker',
            'routing': `${browser}-tests`
        };
    });

    return config;
}

const rabbitConfiguration = getRabbitConfig();

let rabbitConnection = undefined;
let rabbitChannels = {};

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

/**
 * Publish the message to rabbit.
 *
 * @param {string} browser
 * @param {Array|ArrayBuffer|SharedArrayBuffer|Buffer|string} message
 * @return {Promise<any | never>}
 */
function rabbitWrite(browser, message) {
    return new Promise(resolve => {
        console.log(`Trying to publish to channel "${browser}".`);
        rabbitChannels[browser].publish(rabbitConfiguration[browser]['exchange'], rabbitConfiguration[browser]['routing'], Buffer.from(message), {
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
 * @param {string} browser
 * @param {Object} test
 * @return {Promise<T | never>}
 */
function rabbitWriteTest(browser, test) {
    const message = JSON.stringify(test);
    return rabbitWrite(browser, message);
}

/**
 * Create a single channel according to the config.
 *
 * @param {string} browser
 * @param {Object} config
 * @return {PromiseLike<T | never>}
 */
function createChannel(browser, config) {
    return rabbitConnection.createChannel().then(ch => {
        // @todo: Add multiple channels, one for each browser.
        return ch.assertExchange(config['exchange'], 'direct', {})
            .then(() => {
                return ch.assertQueue(config['queue'], {});
            })
            .then(() => {
                return ch.prefetch(1);
            })
            .then(q => {
                return ch.bindQueue(q.queue, config['exchange'], config['routing']);
            })
            .then(() => {
                rabbitChannels[browser] = ch;
                return ch;
            })
            .catch(err => {
                console.error(err);
                throw new Error(err.message);
            });
    })
}

function createChannels() {
    let promises = [];

    Object.keys(rabbitConfiguration).forEach(browser => {
        promises.push(createChannel(browser, rabbitConfiguration[browser]));
    });

    return Promise.all(promises);
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
        .then(() => {
            return createChannels();
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

    if ('undefined' === typeof config || null === config || !config) {
        errors.push('The test configuration is empty.');
        return errors;
    }

    if (config.constructor !== Object) {
        errors.push('The test configuration is not an Object.');
        return errors;
    }

    if (!config.hasOwnProperty('id')) {
        errors.push('The required id field is missing from the test.');
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

// @todo: Move validations into a custom middleware.
// @see https://expressjs.com/en/guide/using-middleware.html
app.post('/api/v1/test/add', asyncHandlerMiddleware(async function (req, res) {
    if (undefined === req.body) { // || req.body.length === 0
        res.statusCode = 400;
        return res.json({message: 'Empty request.'});
    }

    const testConfig = req.body.test_config;
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

    // Note: A standard backstop config includes an "engine" field. We don't care about that,
    // it's up to the  worker to update it according to its configuration.
    // @todo: Expose endpoint so others can query the "supported" lists.
    const browser = req.body.browser;
    if (!supportedBrowsers.includes(browser)) {
        console.error(`Request for unsupported "${browser}" browser.`);
    }

    const mode = req.body.mode;
    if (!supportedModes.hasOwnProperty(mode)) {
        console.error(`Request for unsupported "${mode}" mode.`);
    }

    // @problem: Before/After needs to be stateful, currently this is not really the case.
    // @todo: Figure out how to make this work. Maybe add a database?
    const stage = req.body.stage;
    if (supportedModes[mode].length > 0 && !supportedModes[mode].includes(stage)) {
        console.error(`Request for unsupported "${stage}" stage.`);
    }

    try {
        await rabbitWriteTest(browser, testConfig);
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
