const crypto = require('crypto');

// MUST MATCH guacamole-tunnel.js clientOptions.crypt
const algorithm = 'AES-256-CBC';
const GUAC_KEY = process.env.GUAC_KEY || 'ThisIsASecretKeyForDeskShare123!';

function getKey() {
    // Generate a 256-bit key from the secret (same as guacamole-tunnel.js)
    return crypto.createHash('sha256').update(GUAC_KEY).digest();
}

/**
 * Encrypts connection details into a token that guacamole-lite can decrypt.
 * Format: Base64({ iv: Base64(iv), value: Base64(encryptedData) })
 */
function encryptConnection(connectionParams) {
    const jsonData = { connection: connectionParams };
    const plaintext = JSON.stringify(jsonData);
    const key = getKey();

    // Generate random IV (16 bytes for AES-CBC)
    const iv = crypto.randomBytes(16);

    // Encrypt
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'binary');
    encrypted += cipher.final('binary');

    // Build token in the format guacamole-lite expects
    const tokenData = {
        iv: iv.toString('base64'),
        value: Buffer.from(encrypted, 'binary').toString('base64')
    };

    // Final token is Base64-encoded JSON
    return Buffer.from(JSON.stringify(tokenData)).toString('base64');
}

module.exports = { encryptConnection };
