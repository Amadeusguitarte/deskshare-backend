const GuacamoleLite = require('guacamole-lite');
const net = require('net');

/**
 * Checks if a local port is open (TCP connection test)
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

module.exports = function attachGuacamoleTunnel(httpServer) {
    const guacdOptions = {
        host: '127.0.0.1',
        port: 4822 // Default guacd port
    };

    const clientOptions = {
        crypt: {
            cypher: 'AES-256-CBC',
            key: require('crypto').createHash('sha256').update(process.env.GUAC_KEY || 'ThisIsASecretKeyForDeskShare123!').digest()
        },
        websocket: {
            path: '/guacamole' // Endpoint for websocket
        },
        allowedUnencryptedConnectionSettings: {
            rdp: ['width', 'height', 'dpi'],
            vnc: ['width', 'height', 'dpi', 'password'],
            ssh: ['width', 'height', 'dpi'],
            telnet: ['width', 'height', 'dpi'],
            kubernetes: ['width', 'height', 'dpi'],
        }
    };

    // --- NUCLEAR FIX: MONKEY-PATCH LIBRARY (V3 - STABLE) ---
    const GuacClientConnection = require('guacamole-lite/lib/ClientConnection.js');
    const GuacServerClass = require('guacamole-lite/lib/Server.js');
    const GuacCryptClass = require('guacamole-lite/lib/Crypt.js');

    // 0. Patch Crypt Class (Actual decoder)
    GuacCryptClass.prototype.decrypt = function (token) {
        try {
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) {
            console.error('>>> [DECRYPT FAIL]:', e.message);
            throw e;
        }
    };

    // 1. Patch Server.js
    GuacServerClass.prototype.decryptToken = function (token) {
        try {
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) {
            throw e;
        }
    };

    // 2. Patch ClientConnection.js
    GuacClientConnection.prototype.decryptToken = function () {
        try {
            const token = this.query.token;
            // Note: Don't delete token yet, we might need it for re-connect logic if library does it
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) {
            throw e;
        }
    };

    // 3. Patch Connect to handle Cloudflare Bridge
    const originalConnect = GuacClientConnection.prototype.connect;
    GuacClientConnection.prototype.connect = async function (guacdOptions) {
        // IMPORTANT: settings can be nested or merged
        const conn = this.connectionSettings.connection;
        const s = conn.settings || conn;

        if (s.hostname && s.hostname.includes('trycloudflare.com')) {
            console.log('>>> [BRIDGE] Initializing for:', s.hostname);
            try {
                const tunnelUrl = s.hostname;
                const cleanHostname = tunnelUrl.replace('https://', '').replace('http://', '').split('/')[0];
                const localPort = Math.floor(Math.random() * 5000) + 45000;

                const { spawn } = require('child_process');
                const proxyProc = spawn('cloudflared', [
                    'access', 'tcp',
                    '--hostname', cleanHostname,
                    '--url', `127.0.0.1:${localPort}`
                ]);

                proxyProc.stderr.on('data', d => {
                    const msg = d.toString();
                    if (msg.includes('error')) console.error(`>>> [BRIDGE ERR]: ${msg.trim()}`);
                });

                this.on('close', () => {
                    console.log('>>> [BRIDGE] Terminating proxy...');
                    proxyProc.kill();
                });

                // Patience loop (Wait for bridge to PC)
                let ready = false;
                for (let i = 0; i < 30; i++) { // Max 15 seconds
                    ready = await isPortOpen(localPort, 500);
                    if (ready) break;
                    await new Promise(r => setTimeout(r, 500));
                }

                if (ready) {
                    console.log('>>> [BRIDGE] READY on port', localPort);
                    s.hostname = '127.0.0.1';
                    s.port = localPort;
                } else {
                    console.error('>>> [BRIDGE] TIMEOUT');
                }
            } catch (err) {
                console.error('>>> [BRIDGE FATAL]:', err.message);
            }
        }

        // Final handshake with guacd
        console.log(`>>> [GUACD] Connecting to ${s.hostname}:${s.port} (${conn.type || 'vnc'})`);
        originalConnect.call(this, guacdOptions);
    };

    const { EventEmitter } = require('events');
    const shimServer = new EventEmitter();

    const guacServer = new GuacamoleLite(
        { server: shimServer },
        guacdOptions,
        clientOptions,
        {
            processConnectionSettings: (settings, callback) => {
                callback(null, settings);
            }
        }
    );

    httpServer.on('upgrade', (req, socket, head) => {
        if (req.url.startsWith('/guacamole')) {
            shimServer.emit('upgrade', req, socket, head);
        }
    });

    console.log('✅ Guacamole Tunnel (Nuclear V3) Attached');
};
