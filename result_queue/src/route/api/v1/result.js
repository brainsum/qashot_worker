'use strict';

const express = require('express');
const asyncHandler = require('express-async-handler');

const router = express.Router();
const db = require('../../../database');

/**
 * @type {Sequelize.Model}
 */
const ResultModel = db.models.Result;

router.post('/add', asyncHandler(async function addResultHandler(req, res, next) {
    const body = req.body;
    const uuid = body.uuid;

    const resultData = {
        uuid: uuid,
        rawData: body
    };

    let storedResult = undefined;
    try {
        storedResult = ResultModel.create(resultData);
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