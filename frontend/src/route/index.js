'use strict';

const express = require('express');
const router = express.Router();

router.get('/', function (req, res) {
    return res.status(200).json({ message: 'General Kenobi.'});});

router.use('/api', require('./api'));
router.use('/reports', require('./reports'));

module.exports = router;
