'use strict';

const DataTypes = require('sequelize');

// @todo: Migrations.
// @see: http://docs.sequelizejs.com/manual/tutorial/migrations.html
module.exports = {
    attributes: {
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
        },
        uuid: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
            unique: true
        },
        status: {
            type: DataTypes.ENUM('waiting', 'ok', 'error'),
            allowNull: false,
            defaultValue: 'waiting'
        },
        statusMessage: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: 'Waiting to be sent to the consumer.'
        },
        waitUntil: {
            type: DataTypes.DATE
        },
        // Set, if status is OK.
        sentAt: {
            type: DataTypes.DATE
        },
        rawData: {
            type: DataTypes.JSONB,
            allowNull: false
        }
    },
    options: {
        timestamps: false
    }
};
