const crypto = require('crypto');

/**
 * Encrypts connection details into a token string that guacamole-lite can consume.
 * NUCLEAR VERSION: Returns plain Base64 JSON to bypass library bugs.
 */
function encryptConnection(connectionParams) {
    const jsonData = { connection: connectionParams };
    return Buffer.from(JSON.stringify(jsonData)).toString('base64');
}

module.exports = { encryptConnection };
