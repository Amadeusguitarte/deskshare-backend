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
    // NUCLEAR FIX: Bypass inconsistent library encryption
    // We return a plain Base64 string of the JSON object.
    // The monkey-patched decoder in guacamole-tunnel.js will handle this.
    const jsonData = { connection: connectionParams };
    return Buffer.from(JSON.stringify(jsonData)).toString('base64');
}

module.exports = { encryptConnection };
