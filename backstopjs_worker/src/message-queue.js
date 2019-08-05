'use strict';

const amqp = require('amqplib');

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

module.exports = class MessageQueue {

    constructor(id, connectionString, channelConfigurations) {
        this.queueId = id;
        this.channelConfigs = channelConfigurations;
        this.connectionOptions = this.constructor.getConnectionOptions(connectionString);
        this.channels = {};
    }

    static getConnectionOptions(connectionString) {
        const parsedUrl = new URL(connectionString);
        return {
            protocol: 'amqp',
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            username: parsedUrl.username,
            password: parsedUrl.password,
            locale: 'en_US',
            frameMax: 0,
            channelMax: 0,
            heartbeat: 30,
            vhost: '/',
        };
    }

    write(channelName, message) {
        return new Promise(resolve => {
            console.log(`${this.queueId}:: Trying to publish to channel "${channelName}".`);
            this.channels[channelName].publish(this.channelConfigs[channelName].exchange, this.channelConfigs[channelName].routing, Buffer.from(message), {
                contentType: 'application/json'
            }, function publishConfirmCallback(err, ok) {
                if (err !== null) {
                    console.error('Message nacked,');

                    return;
                }

                console.log('Message acked.');
            });
            console.log(`${this.queueId}:: Writing to MQ; ${message} : Message sent at ${new Date()}`);
            return resolve(message);
        })
            .catch(err => {
                console.error(err);
                throw err;
            });
    }

    read(channelName) {
        return new Promise((resolve, reject) => {
            console.log(`${this.queueId}:: Trying to read from the ${channelName} queue.`);
            if ('undefined' === typeof this.channels[channelName]) {
                return reject(`The ${channelName} queue is not yet open.`);
            }

            return this.channels[channelName].get(this.channelConfigs[channelName].queue, {}).then(msgOrFalse => {
                if (msgOrFalse !== false) {
                    console.log(`${this.queueId}:: Reading from MQ; ${msgOrFalse.content.toString()} : Message received at ${new Date()}`);
                    this.channels[channelName].ack(msgOrFalse);
                    resolve(JSON.parse(msgOrFalse.content.toString()));
                }
                else {
                    reject('No messages in queue.');
                }
            });
        });
    }

    async connect() {
        if ('undefined' !== typeof this.connection) {
            return new Promise(resolve => {
                return resolve(this.connection);
            });
        }

        await this.doConnect();

        try {
            console.log(`${this.queueId}:: Creating channels.`);
            await this.createChannels();
        }
        catch (error) {
            console.log(`${this.queueId}:: Error while creating the channels. ${error.message}`);
        }
    }

    /**
     * @return {Promise<*>}
     */
    async doConnect() {
        if ('undefined' !== typeof this.connection) {
            return new Promise(resolve => {
                return resolve(this.connection);
            });
        }

        console.log(`${this.queueId}:: Trying to connect.`);
        try {
            const conn = await amqp.connect(this.connectionOptions);
            console.log(`${this.queueId}:: Connection to the queue has been established.`);
            this.connection = conn;
        }
        catch (error) {
            const timeout = 3000;
            console.log(`Connection to the MQ failed. Retry in ${timeout / 1000} seconds.. (${error.message})`);
            await delay(timeout);
            await this.doConnect();
        }

        return new Promise(resolve => {
            return resolve(this.connection);
        });
    }

    async waitChannels(maxRetries = 5, waitFor = 2000) {
        return await this.doWaitChannels(maxRetries, waitFor, 1);
    }

    async createChannel(name, config) {
        try {
            /**
             * @type {Channel}
             */
            const channel = await this.connection.createConfirmChannel();

            await channel.assertExchange(config.exchange, 'direct', {});
            await channel.assertQueue(config.queue, {});
            await channel.prefetch(1);
            await channel.bindQueue(config.queue, config.exchange, config.routing);

            this.channels[name] = channel;

            return new Promise(resolve => {
                return resolve(channel);
            });
        }
        catch (error) {
            console.log(`${this.queueId}:: Error while creating the ${name} channel. ${error}`);
            throw error;
        }
    }

    /**
     * Create a channel from the config.
     *
     * @return {Promise<any>}
     */
    async createChannels() {
        let errors = [];

        Object.keys(this.channelConfigs).forEach(async (name) => {
            console.log(`${this.queueId}:: Trying to create the ${name} channel.`);
            try {
                await this.createChannel(name, this.channelConfigs[name]);
            }
            catch (error) {
                errors.push(error.message);
            }
        }, this);

        return new Promise((resolve, reject) => {
            if (errors.length === 0) {
                console.log(`${this.queueId}:: Channels created.`);
                return resolve('Channels created.');
            }

            console.log(`${this.queueId}:: Errors while creating the channels.`);
            errors.forEach(function(error) {
                console.log(`${this.queueId}:: ---- ${error}`);
            }, this);
            return reject(errors);
        });
    }

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
    async doWaitChannels(maxRetries = 5, waitFor = 2000, currentRetries) {
        if (currentRetries > maxRetries) {
            throw new Error(`${this.queueId}:: Max retries (${maxRetries}) reached.`);
        }

        console.log(`${this.queueId}:: Waiting for channels (Retries ${currentRetries}/${maxRetries})..`);

        await delay(waitFor);

        let shouldWait = false;
        Object.keys(this.channelConfigs).forEach((name) => {
            if ('undefined' === typeof this.channels[name]) {
                console.log(`${this.queueId}:: The ${name} channel is not yet open, waiting.`);
                shouldWait = true;
            }
        });

        if (true === shouldWait) {
            return await this.doWaitChannels(maxRetries, waitFor, currentRetries + 1);
        }

        return new Promise(resolve => {
            return resolve(`${this.queueId}:: The channels are open.`);
        });
    }

    getConnection() {
        return this.connection;
    }

};
