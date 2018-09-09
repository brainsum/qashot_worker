'use strict';

const Sequelize = require('sequelize');
const connection = new Sequelize('result_db', process.env.DB_USER, process.env.DB_PASSWORD, {
    host: 'result_db',
    dialect: 'postgres',

    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },

    // http://docs.sequelizejs.com/manual/tutorial/querying.html#operators
    operatorsAliases: false
});

async function checkConnection() {
    try {
        await connection.authenticate();
        console.log('PGSQL:: Connection has been established successfully.')
    }
    catch (error) {
        console.error('PGSQL:: Unable to connect to the database:', error);
        throw new Error(error.message);
    }
}

checkConnection();

const Op = Sequelize.Op;

const models = {};
const definitions = require('./definitions');

for (const name in definitions) {
    models[name] = connection.define(name, definitions[name].attributes, definitions[name].options);
}

module.exports = {
    connection,
    models,
    Op
};
