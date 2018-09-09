'use strict';

// @todo: Maybe add target whitelist?

const ADD_PATH = '/api/v1/result/add';

const request = require('request-promise-native');

function sendResult(target, targetUrl, payload) {
    const currentUrl = `${targetUrl}${ADD_PATH}`;

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
            console.error(`Sending the results to ${target} failed. Error: ${error}`);
            return Promise.reject({
                code: error.statusCode,
                message: `Target (${target}): ${error.message}`,
                error: error
            });
        });
}

module.exports = {
    sendResult
};
