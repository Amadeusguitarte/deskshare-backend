const crypto = require('crypto');

const algorithm = 'AES-256-CBC';
const key = process.env.GUAC_KEY || 'ThisIsASecretKeyForDeskShare123!'; // Must match tunnel config
const keyBuffer = Buffer.from(key); // Ensure it's treated correctly, might need padding if not 32 chars

// Helper to ensure key is 32 bytes
function getKey() {
    return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypts connection details into a token string that guacamole-lite can consume.
 * @param {Object} connectionParams - { type: 'rdp', settings: { ... } }
 */
function encryptConnection(connectionParams) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, getKey(), iv);

    const jsonStr = JSON.stringify({ connection: connectionParams });

    let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tokenObj = {
        iv: iv.toString('base64'),
        value: encrypted
    };

    // guacamole-lite expects the raw base64 encoded string of this JSON object
    // Wait, the client usually sends `token=...` query param.
    // The library decodes base64, then parses JSON to get iv and value.

    return Buffer.from(JSON.stringify(tokenObj)).toString('base64');
}

module.exports = { encryptConnection };
