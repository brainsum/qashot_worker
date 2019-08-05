'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');

const router = express.Router();
const db = require('../../../database');

/**
 * @type {Sequelize.Model}
 */
const ResultModel = db.models.Result;

// @todo: Add results endpoint for fetching a single result, not a bunch of them.
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
        results = await ResultModel.findAll({
            // @todo: createdAt : Fetch only the latest for each UUID?
            // @todo: Allow fetching every result again.
            where: {
                "rawData.original_request.origin": origin,
                testUuid: {
                    [db.Op.in]: testUuids
                },
                sentAt: {
                    [db.Op.is]: null
                }
            },
            limit: 20
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            error: error
        });
    }

    let rowsKeyed = {};
    results.forEach(async function (result) {
        rowsKeyed[result.uuid] = {
            createdAt: result.createdAt,
            sentAt: new Date(),
            data: result.rawData
        };
    });

    const resultUuids = Object.keys(rowsKeyed);
    console.log(`Fetch request: ${resultUuids.length} results queried.`);
    if ('undefined' !== typeof resultUuids && resultUuids.length > 0) {
        console.log('Updating results.');
        try {
            let update = ResultModel.update({
                status: 'ok',
                statusMessage: `Fetched by consumer (${origin}).`,
                sentAt: new Date()
            }, {
                where: {
                    uuid: {
                        [db.Op.in]: resultUuids
                    }
                }
            });
        }
        catch (error) {
            console.error(error);
        }
    }

    console.log('Returning results:');
    console.log(rowsKeyed);

    return res.status(200).json({
        results: rowsKeyed
    });
}));

// @internal
router.post('/add', asyncHandler(async function addResultHandler(req, res, next) {
    const body = req.body;
    const uuid = body.uuid;

    const resultData = {
        uuid: uuid,
        testUuid: body.original_request.uuid,
        rawData: body
    };

    let storedResult = undefined;
    try {
        storedResult = await ResultModel.create(resultData);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal error while trying to save the results."
        });
    }

    console.log(storedResult.get({ plain: true }));

    return res.status(201).json({
        message: 'Result saved.',
        data: storedResult.get({ plain: true })
    });

}));

module.exports = router;