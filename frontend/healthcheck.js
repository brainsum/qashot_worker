'use strict';

const http = require('http');

const options = {
    'host': '0.0.0.0',
    'port': 8080,
    'timeout': 3000,
    'path': '/health/readiness'
};

const request = http.request(options, (res) => {
    console.log(`Health check, status: ${res.statusCode}`);
    if (200 <= res.statusCode && res.statusCode <= 399) {
        process.exitCode = 0;
    }
    else {
        process.exitCode = 1;
    }
});

request.on('error', function (error) {
    console.log(`Health check error: ${error.message}`);
    process.exitCode = 1;
});

request.end();
