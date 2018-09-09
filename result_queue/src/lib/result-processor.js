'use strict';

// @todo: Finish this.


const db = require('../database');
// const web = require('../client/microsite-web');
const targetClient = require('../client/target');

const ResultModel = db.models.ResultModel;

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

const loop = async function loop() {
    let result = undefined;
    try {
        result = await ResultModel.findOne({
            where: {
                status: {
                    [db.Op.not]: 'ok'
                },
                waitUntil: {
                    [db.Op.or]: {
                        [db.Op.is]: null,
                        [db.Op.lt]: new Date()
                    }
                }
            }
        });
    }
    catch (error) {
        console.error(error);
        await delay(3000);
        return loop();
    }

    if (result === null) {
        console.log('There are no items in the queue that should be sent.');
        await delay(3000);
        return await loop();
    }
    
    let resultToUpdate = result.get({ plain: true });
    const target = resultToUpdate.rawData.original_request.origin;
    const targetUrl = resultToUpdate.rawData.original_request.originUrl;

    let response = undefined;
    try {
        response = await targetClient.sendResult(target, targetUrl, result);
        resultToUpdate.status = 'ok';
        resultToUpdate.statusMessage = 'Sent to the remote worker.';
        resultToUpdate.sentAt = new Date();
        console.log('Test sent to the worker.');
    }
    catch (error) {
        resultToUpdate.status = 'error';
        resultToUpdate.statusMessage = error.message;
        // Wait before re-try.
        resultToUpdate.waitUntil = new Date(Date.now() + (1000 * 30));
    }

    let update = undefined;
    try {
        update = ResultModel.update(resultToUpdate, {
            where: {
                uuid: resultToUpdate.uuid
            }
        });
        console.log('Item updated.');
    }
    catch (error) {
        console.error(error);
    }

    await delay(1000);
    return loop();
};

module.exports = {
    loop
};
