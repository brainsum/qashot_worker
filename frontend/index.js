'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';

// App
const app = express();
app.get('/', function (req, res) {
  res.json({ message: 'General Kenobi.'});
});

app.post('/api/v1/test/start', function (req, res) {
    const testId = Math.floor(Math.random() * 7) + 1;
    const backstopConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'tmp', 'backstop.' + testId + '.json'), 'utf8'));
    return res.json(backstopConfig);

    /*
        Query an idle test.
        Set it to "in progress".
        Return the test data.

        @todo: What if there are no tests?
     */
});

app.listen(PORT, HOST, function () {
    console.log(`Running on http://${HOST}:${PORT}`);
});
