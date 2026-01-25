const GuacamoleLite = require('guacamole-lite');
const net = require('net');

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
 * URL-safe Base64 decode (reverse of frontend encoding)
 */
function base64UrlDecode(str) {
    // Add padding back
    let padded = str;
    const remainder = str.length % 4;
    if (remainder === 2) padded += '==';
    else if (remainder === 3) padded += '=';

    // Replace URL-safe chars with standard Base64 chars
    return padded.replace(/-/g, '+').replace(/_/g, '/');
}

module.exports = function attachGuacamoleTunnel(httpServer) {
    const GUAC_KEY = process.env.GUAC_KEY || 'ThisIsASecretKeyForDeskShare123!';
    const encryptionKey = require('crypto').createHash('sha256').update(GUAC_KEY).digest();

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

    // PATCH: Override Crypt's base64decode to handle URL-safe Base64
    const Crypt = require('guacamole-lite/lib/Crypt.js');
    const originalBase64Decode = Crypt.base64decode;
    Crypt.base64decode = function (string, mode) {
        // Convert URL-safe Base64 to standard Base64 first
        const standardBase64 = base64UrlDecode(string);
        return originalBase64Decode.call(this, standardBase64, mode);
    };

    // Get library internals for patching the CONNECT method
    const GuacClientConnection = require('guacamole-lite/lib/ClientConnection.js');

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

                // Wait for bridge readiness (up to 15 seconds)
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
            shimServer.emit('upgrade', req, socket, head);
        }
    });

    guacServer.on('error', (conn, err) => {
        console.error('[GUAC SERVER ERROR]:', err);
    });

    console.log('✅ Guacamole Tunnel (URL-Safe Base64) Attached at /guacamole');
};
