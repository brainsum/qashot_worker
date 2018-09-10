'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');
const request = require('request-promise-native');

const RESULT_URL = 'http://result_queue:9800';
const FETCH_RESULTS_PATH = '/api/v1/result/fetch';

const router = express.Router();

async function getResults(payload) {
    const reqOptions = {
        url: `${RESULT_URL}${FETCH_RESULTS_PATH}`,
        json: payload
    };

    return request.post(reqOptions)
        .then(function (response) {
            return Promise.resolve(response);
        })
        .catch(function (error) {
            return Promise.reject(error);
        });
}

router.post('/fetch', asyncHandler(async function fetchResultsHandler(req, res, next) {
    if ('undefined' === typeof req.body) {
        return res.status(400).json({
            message: 'The request body is empty.'
        });
    }

    const origin = req.body.origin;
    if ('undefined' === typeof origin) {
        return res.status(400).json({
            message: 'The origin field is required and cannot be empty.'
        });
    }

    const testUuids = req.body.testUuids;
    if ('undefined' === typeof testUuids || !Array.isArray(testUuids) || testUuids.length === 0) {
        return res.status(400).json({
            message: 'The testUuids field is required and cannot be empty.'
        });
    }

    let results = undefined;
    try {
        results = await getResults(req.body);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            message: 'Could not fetch the results.',
            error: error
        });
    }

    return res.status(200).json(results);
}));

module.exports = router;