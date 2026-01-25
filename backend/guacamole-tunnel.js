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

    // --- NUCLEAR FIX: MONKEY-PATCH LIBRARY ---
    const GuacClientConnection = require('guacamole-lite/lib/ClientConnection.js');
    const GuacServerClass = require('guacamole-lite/lib/Server.js');
    const GuacCryptClass = require('guacamole-lite/lib/Crypt.js');

    // 0. Patch Crypt Class (The actual decoder used in ClientConnection)
    GuacCryptClass.prototype.decrypt = function (token) {
        console.log('>>> [BRIDGE] Decrypting Token...');
        try {
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) {
            console.error('>>> [BRIDGE] Decrypt Fail:', e.message);
            throw e;
        }
    };

    // 1. Patch Server.js
    GuacServerClass.prototype.decryptToken = function (token) {
        try {
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) { throw e; }
    };

    // 2. Patch ClientConnection.js (Handshake)
    GuacClientConnection.prototype.decryptToken = function () {
        try {
            return JSON.parse(Buffer.from(this.query.token, 'base64').toString());
        } catch (e) { throw e; }
    };

    // 3. Robust Bridge Patch
    const originalConnect = GuacClientConnection.prototype.connect;
    GuacClientConnection.prototype.connect = async function (guacdOpts) {
        // Access settings safely
        const conn = this.connectionSettings.connection;
        const config = conn.settings || conn;

        if (config.hostname && config.hostname.includes('trycloudflare.com')) {
            console.log(`>>> [BRIDGE] Starting setup for ${config.hostname}`);
            try {
                const tunnelUrl = config.hostname;
                const cleanHostname = tunnelUrl.replace('https://', '').replace('http://', '').split('/')[0];
                const localPort = Math.floor(Math.random() * 5000) + 40000;

                const { spawn } = require('child_process');
                console.log(`>>> [BRIDGE] Spawning cloudflared access on port ${localPort}`);

                const proxyProc = spawn('cloudflared', [
                    'access', 'tcp',
                    '--hostname', cleanHostname,
                    '--url', `127.0.0.1:${localPort}`
                ]);

                // Log proxy output
                proxyProc.stderr.on('data', d => console.log(`>>> [BRIDGE LOG]: ${d.toString().trim()}`));

                // Cleanup
                this.on('close', () => {
                    console.log(`>>> [BRIDGE] Killing proxy...`);
                    proxyProc.kill();
                });

                // Wait for Readiness
                let ready = false;
                for (let i = 0; i < 30; i++) {
                    ready = await isPortOpen(localPort, 500);
                    if (ready) break;
                    await new Promise(r => setTimeout(r, 500));
                }

                if (ready) {
                    console.log(`>>> [BRIDGE] Proxy is ACTIVE on 127.0.0.1:${localPort}`);
                    config.hostname = '127.0.0.1';
                    config.port = localPort;
                } else {
                    console.error('>>> [BRIDGE] Proxy FAILED to open port.');
                }
            } catch (err) {
                console.error('>>> [BRIDGE] Setup error:', err.message);
            }
        }

        console.log(`>>> [BRIDGE] Handing off to guacd at ${config.hostname}:${config.port}`);
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
                callback(null, settings);
            }
        }
    );

    httpServer.on('upgrade', (req, socket, head) => {
        if (req.url.startsWith('/guacamole')) {
            shimServer.emit('upgrade', req, socket, head);
        }
    });

    console.log('✅ Guacamole Tunnel (Nuclear Final) Attached');
};
