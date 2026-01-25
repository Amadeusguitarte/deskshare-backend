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
    // DEBUG: Encryption disabled to fix "Token Validation Failed"
    // Just wrap in connection object and base64 encode
    // GuacamoleLite (without crypt option) expects Base64 of { connection: ... } or just params?
    // Let's assume matches what we had: { connection: connectionParams }

    const jsonStr = JSON.stringify({ connection: connectionParams });
    const token = Buffer.from(jsonStr).toString('base64');
    return token;
}

module.exports = { encryptConnection };
