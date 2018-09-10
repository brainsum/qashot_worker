'use strict';

const express = require('express');
const router = express.Router();

router.use('/result', require('./result'));
router.use('/test', require('./test'));

module.exports = router;
