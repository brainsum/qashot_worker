'use strict';

const express = require('express');
const router = express.Router();

router.get('/', function (req, res) {
    return res.status(200).json({ message: 'Microsite mailer reporting in.'});
});

router.use('/api', require('./api'));

module.exports = router;
