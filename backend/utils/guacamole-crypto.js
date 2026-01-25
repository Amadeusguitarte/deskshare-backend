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
    const jsonData = { connection: connectionParams };
    const cypher = algorithm;
    const encryptionKey = getKey();

    // Exact replica of guacamole-lite/lib/Crypt.js encrypt()
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(cypher, encryptionKey, iv);

    let encrypted = cipher.update(JSON.stringify(jsonData), 'utf8', 'binary');
    encrypted += cipher.final('binary');

    const data = {
        iv: iv.toString('base64'),
        value: Buffer.from(encrypted, 'binary').toString('base64')
    };

    return Buffer.from(JSON.stringify(data)).toString('base64');
}

module.exports = { encryptConnection };
