'use strict';

const express = require('express');
const router = express.Router();
const appRootDir = require('../../app-root');
const path = require('path');
const fs = require('fs');

const supportedBrowsers = process.env.SUPPORTED_BROWSERS.split(';');

// @todo: Remove this, debug only.
const serveStatic = require('serve-static');

function resultsMiddleware(req, res, next) {
    if ('GET' !== req.method) {
        return res.end(`${req.method} method not supported.`);
    }

    const browser = req.params.browser;
    const id = String(req.params.id);

    if (!supportedBrowsers.includes(browser)) {
        return res.status(400).send('There was an error while handling your request, please try again later.');
    }

    if (!id.match(/^[a-zA-Z0-9-_]+$/g)) {
        return res.status(400).send('There was an error while handling your request, please try again later.');
    }

    if (!fs.existsSync(path.join(appRootDir, 'runtime', browser, id, 'html_report', 'index.html'))) {
        return res.status(400).send('There was an error while handling your request, please try again later.');
    }

    next();
}

router.use('/:browser/:id', resultsMiddleware);
router.use('/', serveStatic(path.join(appRootDir, 'runtime')));
// @todo: End of "Remove this".

module.exports = router;
