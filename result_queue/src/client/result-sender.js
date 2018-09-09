'use strict';

const TARGETS = {
    drupal: 'http://drupal',
    microsite: 'http://microsite'
};

const ADD_PATH = '/api/v1/result/add';

const request = require('request-promise-native');

function sendToTarget(target, payload) {
    if (!TARGETS.hasOwnProperty(target)) {
        return Promise.reject({
            code: 400,
            message: 'Invalid target.'
        });
    }

    const currentTarget = TARGETS[target];
    const currentUrl = `${currentTarget}${ADD_PATH}`;

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
            console.error(`Sending the test to the worker failed. Error: ${error}`);
            return Promise.reject({
                code: error.statusCode,
                message: `Remote worker: ${error.message}`,
                error: error
            });
        });
}

module.exports = {
    sendToTarget
};
