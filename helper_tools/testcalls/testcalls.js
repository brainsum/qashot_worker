'use strict';

const { config } = require('./config');
// const urlList = readJson('./data/urls-to-use.json');
const urlList = readJson('./data/urls-as-arrays.json');
const template = readJson('./data/testcalls-template.json');
template.origin = config.originId;

const http = require('http');
const uuid = require('uuid/v4');
const { inspect } = require('util');

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

/**
 *
 * @param a
 * @return {boolean}
 */
function isObject(a) {
    return (!!a) && (a.constructor === Object);
}

/**
 * @param {String} path
 *
 * @return {any}
 */
function readJson(path) {
    const fileSystem = require('fs');
    const data = fileSystem.readFileSync(path, {
        encoding: 'utf8',
    });

    return JSON.parse(data);
}

/**
 *
 * @param {String} path
 * @param data
 */
function writeJson(path, data) {
    const fileSystem = require('fs');
    return fileSystem.writeFileSync(
        path,
        JSON.stringify(data, null, 2),
        {
            encoding: 'utf8'
        }
    );
}

/**
 *
 * @param {Object|String|any} element
 * @return {null|String}
 */
function sendElement(element) {
    const testUuid = uuid();
    let currentData = template;

    currentData.uuid = testUuid;
    currentData.test_config.id = testUuid;

    if (isObject(element)) {
        currentData.test_config.scenarios[0].referenceUrl = element.referenceUrl;
        currentData.test_config.scenarios[0].url = element.url;
    }
    else if (typeof element === 'string') {
        currentData.test_config.scenarios[0].referenceUrl = element.trim();
        currentData.test_config.scenarios[0].url = element.trim();
    }
    else {
        console.error(`Element debug [unknown type]: -------`);
        console.error(`\t${inspect(element)}`);
        return null;
    }

    const request = http.request(options, (res) => {
        console.log(`POST for uuid '${testUuid}' : ${res.statusCode}`);
    });

    request.on('error', function (error) {
        console.log(`Test calls failed: ${error.message}`);
        process.exitCode = 1;
    });

    request.write(JSON.stringify(currentData));
    request.end();
    console.log(`\tSent: ${testUuid}`);

    return testUuid;
}

let uuidList = {
    uuidList: []
};

console.log(`---------------------`);
console.log(`\n`);
console.debug(inspect(urlList));
console.log(`\n\n\n`);
console.log(`---------------------`);
console.log(`Sending...`);

for (const element of urlList) {
    const uuid = sendElement(element);

    uuidList.uuidList.push(uuid);
}

console.debug(`UUIDs: -----`);
console.debug(`\t${inspect(uuidList)}`);

writeJson(`./data/test-uuid-list.json`, uuidList);
