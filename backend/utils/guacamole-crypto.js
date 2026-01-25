const Crypto = require('crypto');

// MUST MATCH guacamole-tunnel.js clientOptions.crypt
const algorithm = 'AES-256-CBC';
const GUAC_KEY = process.env.GUAC_KEY || 'ThisIsASecretKeyForDeskShare123!';

function getKey() {
    return Crypto.createHash('sha256').update(GUAC_KEY).digest();
}

/**
 * URL-safe Base64 encode (replaces + with -, / with _, removes padding =)
 */
function base64UrlEncode(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Encrypts connection details into a token that guacamole-lite can decrypt.
 * Uses URL-safe Base64 to prevent corruption in URLs.
 */
function encryptConnection(connectionParams) {
    const jsonData = { connection: connectionParams };
    const key = getKey();

    const iv = Crypto.randomBytes(16);
    const cipher = Crypto.createCipheriv(algorithm, key, iv);

    // Match Crypt.js encoding: utf8 input, binary output
    let encrypted = cipher.update(JSON.stringify(jsonData), 'utf8', 'binary');
    encrypted += cipher.final('binary');

    const data = {
        iv: Buffer.from(iv).toString('base64'),
        value: Buffer.from(encrypted, 'binary').toString('base64')
    };

    // Use STANDARD base64 for inner JSON, but URL-safe for outer wrapper
    return base64UrlEncode(Buffer.from(JSON.stringify(data)));
}

module.exports = { encryptConnection };
