'use strict';

const QUEUE_URL = 'http://result_queue:9800';
const ADD_PATH = '/api/v1/result/add';

const request = require('request-promise-native');

const sendResult = async function sendResult(payload) {
    const currentUrl = `${QUEUE_URL}${ADD_PATH}`;

    const reqConfig = {
        url: currentUrl,
        json: payload
    };

    return request.post(reqConfig)
        .then(function (response) {
            return Promise.resolve({
                code: 200,
                message: 'Ok.',
                response: response
            });
        })
        .catch(function (error) {
            console.error(`Sending the results to the queue failed. Error: ${error}`);
            return Promise.reject({
                code: error.statusCode,
                message: `Result queue: ${error.message}`,
                error: error
            });
        });
};

module.exports = {
    sendResult
};
