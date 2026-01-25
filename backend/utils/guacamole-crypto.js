const Crypto = require('crypto');

// MUST MATCH guacamole-tunnel.js clientOptions.crypt
const algorithm = 'AES-256-CBC';
const GUAC_KEY = process.env.GUAC_KEY || 'ThisIsASecretKeyForDeskShare123!';

function getKey() {
    return Crypto.createHash('sha256').update(GUAC_KEY).digest();
}

/**
 * Base64 encode (matching Crypt.js exactly)
 */
function base64encode(string, mode) {
    return Buffer.from(string, mode || 'ascii').toString('base64');
}

/**
 * Encrypts connection details into a token that guacamole-lite can decrypt.
 * THIS IS A DIRECT COPY OF Crypt.js encrypt() for 100% compatibility.
 */
function encryptConnection(connectionParams) {
    const jsonData = { connection: connectionParams };
    const key = getKey();

    const iv = Crypto.randomBytes(16);
    const cipher = Crypto.createCipheriv(algorithm, key, iv);

    // MUST USE 'binary' encoding to match Crypt.js
    let encrypted = cipher.update(JSON.stringify(jsonData), 'utf8', 'binary');
    encrypted += cipher.final('binary');

    const data = {
        iv: base64encode(iv),
        value: base64encode(encrypted, 'binary')
    };

    return base64encode(JSON.stringify(data));
}

module.exports = { encryptConnection };
