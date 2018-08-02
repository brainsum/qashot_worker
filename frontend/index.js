'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const url = require('url');
const amqp = require('amqplib');

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';
const routingKey = "tests";
const exchangeName = "backstop-worker";
const qName = "backstop-puppeteer";

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

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

function pushToRabbit() {
    for (let testId = 1; testId < 7; ++testId) {
        const backstopConfig = JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname, 'tmp', 'backstop.' + testId + '.json'), 'utf8')));
        rabbitWrite(backstopConfig);
    }
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
        pushToRabbit();
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
app.get('/', function (req, res) {
  res.json({ message: 'General Kenobi.'});
});

app.post('/api/v1/test/start', function (req, res) {
    const testId = Math.floor(Math.random() * 7) + 1;
    const backstopConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'tmp', 'backstop.' + testId + '.json'), 'utf8'));
    console.log('Test start request, test ID: ' + testId);
    return res.json(backstopConfig);

    /*
        Query an idle test.
        Set it to "in progress".
        Return the test data.

        @todo: What if there are no tests?
     */
});

app.listen(PORT, HOST, function () {
    console.log(`Running on http://${HOST}:${PORT}`);
});
