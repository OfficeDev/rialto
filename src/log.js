'use strict';

const prefix = () => {
    return `[${process.env['COMPUTERNAME']}] ${new Date().toUTCString()}`
}

module.exports.error = s => {
    console.error(`${prefix()} ERROR: ${s}`);
}

module.exports.info = s => {
    console.log(`${prefix()}  INFO: ${s}`);
}
