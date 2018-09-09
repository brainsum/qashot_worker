'use strict';

// @todo: Finish this.


const db = require('../database');
const web = require('../client/microsite-web');

const ResultModel = db.models.ResultModel;

function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
}

const loop = async function loop() {
    let item = undefined;
    try {
        item = await ResultModel.findOne({
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

    if (item === null) {
        console.log('There are no items in the queue that should be sent.');
        await delay(3000);
        return await loop();
    }

    let webResponse = undefined;
    try {
        webResponse = await web.getTest(item.uuid);
    }
    catch (error) {
        console.error(error);
        await delay(3000);
        return loop();
    }

    if ('undefined' === webResponse.test) {
        console.error('The web service did not return a test.');
        await delay(3000);
        return loop();
    }

    const test = webResponse.test;
    let updatedItem = item.get({ plain: true });
    let response = undefined;
    try {
        response = await worker.addTest(test);
        updatedItem.status = 'ok';
        updatedItem.statusMessage = 'Sent to the remote worker.';
        updatedItem.sentAt = new Date();
        console.log('Test sent to the worker.');
    }
    catch (error) {
        updatedItem.status = 'error';
        updatedItem.statusMessage = error.message;
        // Wait before re-try.
        updatedItem.waitUntil = new Date(Date.now() + (1000 * 30));
    }

    let update = undefined;Key
    try {
        update = ResultModel.update(updatedItem, {
            where: {
                uuid: updatedItem.uuid
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
