'use strict';

const util = require('util');
const amqp = require('amqplib');

/**
 *
 * @type {ChannelModel}
 */
let connection = undefined;
let channelConfigs = undefined;
let channels = {};

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

/**
 * Create a channel from the config.
 *
 * @param {String} name
 * @param {Object} config
 * @return {Promise<any>}
 */
async function createChannel(name, config) {
    try {
        /**
         * @type {Channel}
         */
        const channel = await connection.createChannel();

        await channel.assertExchange(config.exchange, 'direct', {});
        await channel.assertQueue(config.queue, {});
        await channel.prefetch(1);
        await channel.bindQueue(config.queue, config.exchange, config.routing);

        channels[name] = channel;

        return new Promise(resolve => {
            return resolve(channel);
        });
    }
    catch (error) {
        console.log(`Error while creating the ${name} channel. ${error}`);
        throw error;
    }
}

/**
 * Create a channel from the config.
 *
 * @param {Object} configs
 * @return {Promise<any>}
 */
async function createChannels(configs) {
    let errors = [];

    Object.keys(configs).forEach(async (name) => {
        console.log(`MQ:: Trying to create the ${name} channel.`);
        try {
            await createChannel(name, configs[name]);
        }
        catch (error) {
            errors.push(error.message);
        }
    });

    return new Promise((resolve, reject) => {
        if (errors.length === 0) {
            console.log('MQ:: Channels created.');
            return resolve('Channels created.');
        }

        console.log('MQ:: Errors while creating the channels.');
        console.log(util.inspect(errors));
        return reject(errors);
    });
}

/**
 * Return the connection.
 *
 * @return {ChannelModel}
 */
exports.connection = function() {
    return connection;
};

exports.channels = function() {
    return channels;
};

/**
 * Handler for waitChannels.
 *
 * @param {Number} maxRetries
 *   Maximum retry count.
 * @param {Number} waitFor
 *   Delay in microseconds.
 * @param {Number} currentRetries
 *   The current retry counter.
 * @return {Promise<*>}
 */
async function doWaitChannels(maxRetries = 5, waitFor = 2000, currentRetries) {
    if (currentRetries > maxRetries) {
        throw new Error(`MQ:: Max retries (${maxRetries}) reached.`);
    }

    console.log(`MQ:: Waiting for channels (Retries ${currentRetries}/${maxRetries})..`);

    await delay(waitFor);

    let shouldWait = false;
    Object.keys(channelConfigs).forEach((name) => {
        if ('undefined' === typeof channels[name]) {
            console.log(`MQ:: The ${name} channel is not yet open, waiting.`);
            shouldWait = true;
        }
    });

    if (true === shouldWait) {
        return await doWaitChannels(maxRetries, waitFor, currentRetries + 1);
    }

    return new Promise(resolve => {
        return resolve('MQ:: The channels are open.');
    });
}

/**
 * Try waiting for channels.
 *
 * @param {Number} maxRetries
 *   Maximum retry count.
 * @param {Number} waitFor
 *   Delay in microseconds.
 * @return {Promise<*>}
 */
exports.waitChannels = async function waitChannels(maxRetries = 5, waitFor = 2000) {
    return await doWaitChannels(maxRetries, waitFor, 1);
};

/**
 *
 * @param connectionOptions
 * @return {Promise<*>}
 */
async function doConnect(connectionOptions) {
    if ('undefined' !== typeof connection) {
        return new Promise(resolve => {
            return resolve(connection);
        });
    }

    console.log('MQ:: Trying to connect.');
    try {
        const conn = await amqp.connect(connectionOptions);
        console.log('MQ:: Connection to the queue has been established.');
        connection = conn;
    }
    catch (error) {
        const timeout = 3000;
        console.log(`Connection to the MQ failed. Retry in ${timeout / 1000} seconds ..`);
        console.log(util.inspect(error));
        await delay(timeout);
        await doConnect(connectionOptions);
    }

    return new Promise(resolve => {
        return resolve(connection);
    });
}

/**
 *
 * @param connectionOptions
 * @param channelConfigurations
 * @return {Promise<*>}
 */
const connect = async function(connectionOptions, channelConfigurations) {
    if ('undefined' !== typeof connection) {
        return new Promise(resolve => {
            return resolve(connection);
        });
    }

    await doConnect(connectionOptions);

    channelConfigs = channelConfigurations;
    try {
        console.log('MQ:: Creating channels.');
        await createChannels(channelConfigs);
    }
    catch (error) {
        console.log(`MQ:: Error while creating the channels. ${error.message}`);
    }
};

/**
 * Connect according to the configuration and create the requested channels.
 *
 * @param connectionOptions
 * @param channelConfigurations
 * @return {Promise<any[]>}
 */
exports.connect = connect;

/**
 * Read from a channel.
 *
 * @param channelName
 * @return {Promise<any>}
 */
exports.read = function(channelName) {
    return new Promise((resolve, reject) => {
        console.log(`MQ:: Trying to read from the ${channelName} queue.`);
        if ('undefined' === typeof channels[channelName]) {
            return reject(`The ${channelName} queue is not yet open.`);
        }

        return channels[channelName].get(channelConfigs[channelName].queue, {}).then(msgOrFalse => {
            if (msgOrFalse !== false) {
                console.log("Reading from MQ:: [-] %s", `${msgOrFalse.content.toString()} : Message received at ${new Date()}`);
                channels[channelName].ack(msgOrFalse);
                resolve(JSON.parse(msgOrFalse.content.toString()));
            }
            else {
                reject('No messages in queue.');
            }
        });
    });
};

/**
 * Write a message to a channel.
 *
 * @param channelName
 * @return {Promise<any>}
 */
exports.write = function (channelName, message) {
    return new Promise(resolve => {
        console.log(`Trying to publish to channel "${channelName}".`);
        channels[channelName].publish(channelConfigs[channelName].exchange, channelConfigs[channelName].routing, Buffer.from(message), {
            contentType: 'application/json'
        });
        const msgTxt = message + " : Message sent at " + new Date();
        console.log(" [+] %s", msgTxt);
        return resolve(message);
    })
        .catch(err => {
            console.error(err);
            throw err;
        });
};
