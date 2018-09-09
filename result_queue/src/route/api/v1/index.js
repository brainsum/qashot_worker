'use strict';

const express = require('express');
const router = express.Router();

router.use('/result', require('./result'));

module.exports = router;
