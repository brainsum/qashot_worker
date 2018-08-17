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
const helmet = require('helmet');
const terminus = require('@godaddy/terminus');
const asyncHandlerMiddleware = require('express-async-handler');
const jwtHandlerMiddleware = require('express-jwt');

const fs = require('fs');
const path = require('path');
const url = require('url');

const internalMessageQueue = require('./src/message-queue');

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';

function getInternalMQOptions() {
    const parsedUrl = url.parse(process.env.INTERNAL_RABBITMQ_URL);
    const auth = parsedUrl.auth.split(':');
    return {
        protocol: 'amqp',
        hostname: parsedUrl.hostname,
        port: 5672,
        username: auth[0],
        password: auth[1],
        locale: 'en_US',
        frameMax: 0,
        channelMax: 0,
        heartbeat: 30,
        vhost: '/',
    };
}

const internalConnectionOptions = getInternalMQOptions();
const internalQueueId = 'InternalMQ';

const supportedBrowsers = process.env.SUPPORTED_BROWSERS.split(';');
const supportedModes = {
    'a_b': [],
    'before_after': [
        'before',
        'after'
    ]
};

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

function getRabbitConfig() {
    let config = {};
    supportedBrowsers.forEach((browser) => {
        config[browser] = {
            'name': browser,
            'queue': `backstop-${browser}`,
            'exchange': 'backstop-worker',
            'routing': `${browser}-tests`
        };
    });

    return config;
}

const internalChannelConfigs = getRabbitConfig();

/**
 *
 * @param {string} browser
 * @param {Object} test
 * @return {Promise<any>}
 */
function rabbitWriteTest(browser, test) {
    const message = JSON.stringify(test);
    return internalMessageQueue.write(browser, message);
}

// App
const app = express();

app.use(helmet());
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
  return res.status(200).json({ message: 'General Kenobi.'});
});

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

function testValidationMiddleware(req, res, next) {
    if (undefined === req.body) { // || req.body.length === 0
        return res.status(400).json({message: 'Empty request.'});
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
        return res.status(400).json({
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

    next();
}

/**
 * @todo: Use a JSON Validator lib.
 */
app.use('/api/v1/test/add', testValidationMiddleware);

// @todo: Implement bulk-add?
// @see https://expressjs.com/en/guide/using-middleware.html
app.post('/api/v1/test/add', asyncHandlerMiddleware(async function (req, res) {
    const testConfig = req.body.test_config;
    // Note: A standard backstop config includes an "engine" field. We don't care about that,
    // it's up to the  worker to update it according to its configuration.
    // @todo: Expose endpoint so others can query the "supported" lists.
    const browser = req.body.browser;
    const mode = req.body.mode;
    // @problem: Before/After needs to be stateful, currently this is not really the case.
    // @todo: Figure out how to make this work. Maybe add a database?
    const stage = req.body.stage;

    try {
        await rabbitWriteTest(browser, testConfig);
        return res.status(200).json({
            message: 'The test has been added to the queue.',
            test: testConfig
        });
    }
    catch (error) {
        console.log(error);
        return res.status(400).json({
            message: 'Could not add test to the queue.',
            test: testConfig,
            error: error
        });
    }
}));

// @todo: Remove this, debug only.
const serveStatic = require('serve-static');

function resultsMiddleware(req, res, next) {
    if ('GET' !== req.method) {
        return res.end(`${req.method} method not supported.`);
    }

    const browser = req.params.browser;
    const id = String(req.params.id);

    if (!supportedBrowsers.includes(browser)) {
        return res.status(400).send('There was an error while handling your request, please try again later.');
    }

    if (!id.match(/^[a-zA-Z0-9-_]+$/g)) {
        return res.status(400).send('There was an error while handling your request, please try again later.');
    }

    if (!fs.existsSync(path.join(__dirname, 'runtime', browser, id, 'html_report', 'index.html'))) {
        return res.status(400).send('There was an error while handling your request, please try again later.');
    }

    next();
}

app.use('/api/v1/reports/:browser/:id', resultsMiddleware);
app.use(`/api/v1/reports`, serveStatic(path.join(__dirname, 'runtime')));
// @todo: End of "Remove this".

let server = undefined;

function beforeShutdown () {
    // given your readiness probes run every 5 second
    // may be worth using a bigger number so you won't
    // run into any race conditions
    return new Promise(resolve => {
        setTimeout(resolve, 5000)
    })
}

function onSignal () {
    console.log('server is starting cleanup');
    return Promise.all([
        internalMessageQueue.connection().close(),
        server.close()
    ]);
}

function onShutdown () {
    console.log('cleanup finished, server is shutting down');
}

function livenessCheck() {
    console.log('Probing for liveness..');
    return Promise.resolve()
}

function readinessCheck () {
    console.log('Probing for readiness..');
    const serverReadiness = new Promise((resolve, reject) => {
        if ('undefined' === typeof server || null === server.address()) {
            return reject('The server is down.');
        }

        return resolve('The server is alive.');
    });

    return Promise.all([
        serverReadiness
    ]);
}

const signals = [
    'SIGHUP',
    'SIGINT',
    'SIGUSR2',
];

const terminusOptions = {
    // Healtcheck options.
    healthChecks: {
        '/health/liveness': livenessCheck,    // Function indicating if the service is running or not.
        '/health/readiness': readinessCheck,    // Function indicating if the service can accept requests or not.
    },

    // cleanup options
    timeout: 1000,                   // [optional = 1000] number of milliseconds before forcefull exiting
    // signal,                          // [optional = 'SIGTERM'] what signal to listen for relative to shutdown
    signals,                          // [optional = []] array of signals to listen for relative to shutdown
    beforeShutdown,                  // [optional] called before the HTTP server starts its shutdown
    onSignal,                        // [optional] cleanup function, returning a promise (used to be onSigterm)
    onShutdown,                      // [optional] called right before exiting

    // both
    // logger                           // [optional] logger function to be called with errors
};

async function run() {
    await internalMessageQueue.connect(internalConnectionOptions, internalChannelConfigs, internalQueueId);

    try {
        const message = await internalMessageQueue.waitChannels(5, 2000);
        console.log(message);
    }
    catch (error) {
        console.log(`Error! ${error.message}`);
        // @todo: Exit 1.
    }

    console.log('Setting the server..');
    server = app.listen(PORT, HOST, function () {
        console.log(`Running on http://${HOST}:${PORT}`);
        terminus(server, terminusOptions);
    });
}

run();
