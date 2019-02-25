#!/usr/bin/env node
'use strict';

const http = require('http');
const uuid = require('uuid/v4');
const fs = require('fs');

const { config } = require('./config');

const options = {
    'host': config.host,
    'port': config.port,
    'timeout': 3000,
    'method': config.method,
    'path': config.callOptions.path,
    'headers': {
        'Content-Type': 'application/json',
    }
};

const template = JSON.parse(fs.readFileSync('./data/testcalls-template.json', {encoding: 'utf8'}));
const urlList = JSON.parse(fs.readFileSync('./data/urls-to-use.json', {encoding: 'utf8'}));
template.origin = config.originId;

let uuidList = {
    uuidList: []
};

for (let urlIndex in urlList) {
    const testUuid = uuid();

    uuidList.uuidList.push(testUuid);

    let currentData = template;
    currentData.uuid = testUuid;
    currentData.test_config.id = testUuid;
    currentData.test_config.scenarios[0].referenceUrl = urlList[urlIndex].referenceUrl;
    currentData.test_config.scenarios[0].url = urlList[urlIndex].url;

    const request = http.request(options, (res) => {
        console.log(`POST for uuid '${testUuid}' : ${res.statusCode}`);
    });

    request.on('error', function (error) {
        console.log(`Test calls failed: ${error.message}`);
        process.exitCode = 1;
    });

    request.write(JSON.stringify(currentData));

    request.end();
}

fs.writeFileSync('./data/test-uuid-list.json', JSON.stringify(uuidList, null, 2), {options: 'utf8'});
