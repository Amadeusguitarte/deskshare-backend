const GuacamoleLite = require('guacamole-lite');
const net = require('net');
const Crypto = require('crypto');

/**
 * Checks if a local port is open
 */
function isPortOpen(port, timeout = 1000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        const onError = () => {
            socket.destroy();
            resolve(false);
        };
        socket.setTimeout(timeout);
        socket.once('error', onError);
        socket.once('timeout', onError);
        socket.connect(port, '127.0.0.1', () => {
            socket.end();
            resolve(true);
        });
    });
}

/**
 * URL-safe Base64 decode
 */
function base64UrlToStandard(str) {
    let result = str.replace(/-/g, '+').replace(/_/g, '/');
    const remainder = result.length % 4;
    if (remainder === 2) result += '==';
    else if (remainder === 3) result += '=';
    return result;
}

/**
 * Custom decrypt that handles URL-safe Base64
 */
function customDecrypt(encodedToken, key) {
    console.log('[DECRYPT] Raw token length:', encodedToken.length);
    console.log('[DECRYPT] Token first 50 chars:', encodedToken.substring(0, 50));
    console.log('[DECRYPT] Token last 20 chars:', encodedToken.substring(encodedToken.length - 20));

    // Convert URL-safe to standard Base64
    const standardBase64 = base64UrlToStandard(encodedToken);
    console.log('[DECRYPT] Standard B64 first 50:', standardBase64.substring(0, 50));

    // Decode outer Base64 to get JSON string
    const jsonString = Buffer.from(standardBase64, 'base64').toString('ascii');
    console.log('[DECRYPT] JSON string first 100:', jsonString.substring(0, 100));

    // Parse JSON to get iv and value
    const parsed = JSON.parse(jsonString);
    console.log('[DECRYPT] Parsed IV exists:', !!parsed.iv);
    console.log('[DECRYPT] Parsed value exists:', !!parsed.value);

    // Decode iv and value
    const iv = Buffer.from(parsed.iv, 'base64');
    const encryptedValue = Buffer.from(parsed.value, 'base64');

    // Decrypt
    const decipher = Crypto.createDecipheriv('AES-256-CBC', key, iv);
    let decrypted = decipher.update(encryptedValue, null, 'utf8');
    decrypted += decipher.final('utf8');

    console.log('[DECRYPT] Decrypted first 100:', decrypted.substring(0, 100));
    return JSON.parse(decrypted);
}

module.exports = function attachGuacamoleTunnel(httpServer) {
    const GUAC_KEY = process.env.GUAC_KEY || 'ThisIsASecretKeyForDeskShare123!';
    const encryptionKey = Crypto.createHash('sha256').update(GUAC_KEY).digest();

    const guacdOptions = {
        host: '127.0.0.1',
        port: 4822
    };

    const clientOptions = {
        crypt: {
            cypher: 'AES-256-CBC',
            key: encryptionKey
        },
        websocket: {
            path: '/guacamole'
        },
        log: {
            level: 'VERBOSE'
        },
        allowedUnencryptedConnectionSettings: {
            rdp: ['width', 'height', 'dpi'],
            vnc: ['width', 'height', 'dpi', 'password'],
            ssh: ['width', 'height', 'dpi'],
            telnet: ['width', 'height', 'dpi'],
            kubernetes: ['width', 'height', 'dpi'],
        }
    };

    // PATCH: Override the entire decryptToken method in ClientConnection
    const GuacClientConnection = require('guacamole-lite/lib/ClientConnection.js');
    GuacClientConnection.prototype.decryptToken = function () {
        console.log('[PATCH] decryptToken called!');
        const token = this.query.token;
        delete this.query.token;

        try {
            return customDecrypt(token, encryptionKey);
        } catch (e) {
            console.error('[PATCH] Decrypt error:', e.message);
            throw e;
        }
    };

    // PATCH: Override decryptToken in Server too (for extractGuacdOptions)
    const GuacServer = require('guacamole-lite/lib/Server.js');
    GuacServer.prototype.decryptToken = function (token) {
        console.log('[PATCH-SERVER] decryptToken called!');
        try {
            return customDecrypt(token, encryptionKey);
        } catch (e) {
            console.error('[PATCH-SERVER] Decrypt error:', e.message);
            throw e;
        }
    };

    // Patch connect() to handle Cloudflare tunnels
    const originalConnect = GuacClientConnection.prototype.connect;
    GuacClientConnection.prototype.connect = async function (guacdOpts) {
        const conn = this.connectionSettings.connection;
        const config = conn.settings || conn;

        console.log(`[GUAC-BRIDGE] Connect called. Hostname: ${config.hostname}`);

        if (config.hostname && config.hostname.includes('trycloudflare.com')) {
            console.log(`[GUAC-BRIDGE] Cloudflare tunnel detected: ${config.hostname}`);
            try {
                const tunnelUrl = config.hostname;
                const cleanHostname = tunnelUrl.replace('https://', '').replace('http://', '').split('/')[0];
                const localPort = Math.floor(Math.random() * 5000) + 40000;

                const { spawn } = require('child_process');
                console.log(`[GUAC-BRIDGE] Spawning cloudflared access on port ${localPort}...`);

                const proxyProc = spawn('cloudflared', [
                    'access', 'tcp',
                    '--hostname', cleanHostname,
                    '--url', `127.0.0.1:${localPort}`
                ]);

                proxyProc.stderr.on('data', d => console.log(`[GUAC-BRIDGE LOG]: ${d.toString().trim()}`));
                proxyProc.on('error', e => console.error(`[GUAC-BRIDGE ERR]: ${e.message}`));

                this.on('close', () => {
                    console.log(`[GUAC-BRIDGE] Killing bridge process.`);
                    proxyProc.kill();
                });

                let ready = false;
                for (let i = 0; i < 30; i++) {
                    ready = await isPortOpen(localPort, 500);
                    if (ready) break;
                    await new Promise(r => setTimeout(r, 500));
                }

                if (ready) {
                    console.log(`[GUAC-BRIDGE] Bridge ACTIVE on 127.0.0.1:${localPort}`);
                    config.hostname = '127.0.0.1';
                    config.port = localPort;
                } else {
                    console.error('[GUAC-BRIDGE] Bridge FAILED to open port!');
                }
            } catch (err) {
                console.error('[GUAC-BRIDGE] Setup error:', err.message);
            }
        }

        console.log(`[GUAC-BRIDGE] Handing off to guacd -> ${config.hostname}:${config.port}`);
        originalConnect.call(this, guacdOpts);
    };

    const { EventEmitter } = require('events');
    const shimServer = new EventEmitter();

    const guacServer = new GuacamoleLite(
        { server: shimServer },
        guacdOptions,
        clientOptions,
        {
            processConnectionSettings: (settings, callback) => {
                console.log('[GUAC] Settings received.');
                callback(null, settings);
            }
        }
    );

    httpServer.on('upgrade', (req, socket, head) => {
        if (req.url.startsWith('/guacamole')) {
            console.log('[GUAC] WebSocket upgrade request received.');
            console.log('[GUAC] Full URL:', req.url.substring(0, 100) + '...');
            shimServer.emit('upgrade', req, socket, head);
        }
    });

    guacServer.on('error', (conn, err) => {
        console.error('[GUAC SERVER ERROR]:', err);
    });

    console.log('✅ Guacamole Tunnel (Debug Logging) Attached at /guacamole');
};
