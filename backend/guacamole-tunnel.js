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
            vnc: ['width', 'height', 'dpi'],
            ssh: ['width', 'height', 'dpi'],
            telnet: ['width', 'height', 'dpi'],
            kubernetes: ['width', 'height', 'dpi'],
        }
    };

    // --- NUCLEAR FIX: MONKEY-PATCH LIBRARY (ULTRA VERBOSE) ---
    const GuacClientConnection = require('guacamole-lite/lib/ClientConnection.js');
    const GuacServerClass = require('guacamole-lite/lib/Server.js');
    const GuacCryptClass = require('guacamole-lite/lib/Crypt.js');

    // 0. Patch Crypt Class (Used by ClientConnection)
    GuacCryptClass.prototype.decrypt = function (token) {
        console.log('>>> [TUNNEL] Crypt.decrypt() called for token:', token ? token.substring(0, 50) + '...' : 'NULL');
        try {
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) {
            console.error('>>> [TUNNEL] Crypt Decrypt FAIL:', e.message);
            throw e;
        }
    };

    // 1. Patch Server.js (Dynamic Routing)
    GuacServerClass.prototype.decryptToken = function (token) {
        console.log('>>> [TUNNEL] Server.decryptToken() called with token:', token ? token.substring(0, 50) + '...' : 'NULL');
        try {
            const decoded = Buffer.from(token, 'base64').toString();
            console.log('>>> [TUNNEL] Server Decoded raw:', decoded);
            const parsed = JSON.parse(decoded);
            console.log('>>> [TUNNEL] Server Parsed successfully.');
            return parsed;
        } catch (e) {
            console.error('>>> [TUNNEL] Server Decrypt FAIL:', e.message);
            // Fallback to original if we somehow still have encrypted tokens (unlikely)
            throw e;
        }
    };

    // 2. Patch ClientConnection.js (Handshake)
    GuacClientConnection.prototype.decryptToken = function () {
        const token = this.query.token;
        console.log('>>> [TUNNEL] ClientConnection.decryptToken() for token:', token ? token.substring(0, 50) + '...' : 'NULL');
        try {
            const decoded = Buffer.from(token, 'base64').toString();
            console.log('>>> [TUNNEL] ClientConnection Decoded raw:', decoded);
            const parsed = JSON.parse(decoded);
            console.log('>>> [TUNNEL] ClientConnection Parsed successfully.');
            delete this.query.token;
            return parsed;
        } catch (e) {
            console.error('>>> [TUNNEL] ClientConnection Decrypt FAIL:', e.message);
            throw e;
        }
    };

    // 3. Patch Connect to handle Cloudflare Bridge BEFORE starting guacd Handshake
    const originalConnect = GuacClientConnection.prototype.connect;
    GuacClientConnection.prototype.connect = async function (guacdOptions) {
        console.log('>>> [TUNNEL] ClientConnection.connect() triggered.');
        const settings = this.connectionSettings.connection.settings;

        if (settings && settings.hostname && settings.hostname.includes('trycloudflare.com')) {
            try {
                const tunnelUrl = settings.hostname;
                const cleanHostname = tunnelUrl.replace('https://', '').replace('http://', '').split('/')[0];
                const localPort = Math.floor(Math.random() * 10000) + 40000;

                console.log(`[Bridge] Tunnel Detected: ${cleanHostname}. Spawning bridge on port ${localPort}...`);

                const { spawn } = require('child_process');
                const proxyProc = spawn('cloudflared', [
                    'access', 'tcp',
                    '--hostname', cleanHostname,
                    '--url', `127.0.0.1:${localPort}`
                ]);

                // Log error/status output
                proxyProc.stderr.on('data', d => console.log(`[Bridge-Log]: ${d.toString().trim()}`));

                // Clean up when connection closes
                this.on('close', () => {
                    console.log(`[Bridge] Closing bridge PID ${proxyProc.pid}`);
                    proxyProc.kill();
                });

                // Wait for bridge readiness
                console.log(`[Bridge] Waiting for port ${localPort}...`);
                let ready = false;
                for (let i = 0; i < 15; i++) {
                    ready = await isPortOpen(localPort, 500);
                    if (ready) break;
                    await new Promise(r => setTimeout(r, 500));
                }

                if (ready) {
                    console.log(`[Bridge] SUCCESS: Bridge active on 127.0.0.1:${localPort}`);
                    settings.hostname = '127.0.0.1';
                    settings.port = localPort;
                } else {
                    console.error('[Bridge] FAILURE: Port never opened in 7.5s.');
                }
            } catch (err) {
                console.error('[Bridge] Fatal Setup Error:', err.message);
            }
        }

        // Proceed to native connect() logic
        originalConnect.call(this, guacdOptions);
    };

    const { EventEmitter } = require('events');
    const shimServer = new EventEmitter();

    // Initialize GuacamoleLite with Shim
    const guacServer = new GuacamoleLite(
        { server: shimServer },
        guacdOptions,
        clientOptions,
        {
            processConnectionSettings: (settings, callback) => {
                console.log('[Guacamole] Connection settings validated.');
                callback(null, settings);
            }
        }
    );

    // Attach Global Listener to Real Server
    httpServer.on('upgrade', (req, socket, head) => {
        if (req.url.startsWith('/guacamole')) {
            shimServer.emit('upgrade', req, socket, head);
        }
    });

    console.log('✅ Guacamole Tunnel attached (Nuclear Mode) at /guacamole');

    // Error handling
    guacServer.on('error', (clientConnection, error) => {
        console.error('[Guacamole Server Error]:', error);
    });
};
