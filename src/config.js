'use strict'

let log = require('./log');

// For unclear reasons, this is necessary to get the env variables
// visible via process.env in Azure app service.
log.info(`env:\r\n${JSON.stringify(process.env, null, '  ')}`);

module.exports.botAppId = process.env.APPSETTING_BOT_APP_ID;
module.exports.botAppPassword = process.env.CUSTOMCONNSTR_BOT_APP_PASSWORD;
module.exports.tableStorageConnectionString = process.env.CUSTOMCONNSTR_TABLE_STORAGE;
