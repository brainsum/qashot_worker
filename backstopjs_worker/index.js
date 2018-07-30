'use strict';

const express = require('express');

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';

// App
const app = express();

app.get('/', (req, res) => {
  const http = require('http');
  http.get('http://frontend:8080/', (response) => {
    let data = '';
    response.on('data', (chunk) => {
      data += chunk;
    });

    response.on('end', () => {
      res.send("Response data: " + data);
    });
  });
});

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
