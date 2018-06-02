'use strict';

let path = require('path');
let express = require('express');
let bot = require('./bot');
let api = require('./api');
let log = require('./log');
let state = require('./state');

let app = express();
bot.setup(app);
api.setup(app);
app.use(express.static(path.join(__dirname, '../public')));

state.init(error => {
    if (error) {
        log.error(`Unable to init state: ${error}`);
    } else {
        app.listen(process.env.PORT || 8080, () => {
            log.info('App started listening on port 8080');
        });
    }
});
