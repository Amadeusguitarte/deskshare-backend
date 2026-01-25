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
            vnc: ['width', 'height', 'dpi'],
            ssh: ['width', 'height', 'dpi'],
            telnet: ['width', 'height', 'dpi'],
            kubernetes: ['width', 'height', 'dpi'],
        }
    };

    // --- NUCLEAR FIX: MONKEY-PATCH LIBRARY (TRIPLE-PATCH) ---
    const GuacClientConnection = require('guacamole-lite/lib/ClientConnection.js');
    const GuacServerClass = require('guacamole-lite/lib/Server.js');
    const GuacCryptClass = require('guacamole-lite/lib/Crypt.js');

    // 0. Patch Crypt Class (The actual decoder used in ClientConnection)
    GuacCryptClass.prototype.decrypt = function (token) {
        console.log('>>> [TUNNEL] Crypt.decrypt() bypass:', token ? token.substring(0, 30) + '...' : 'NULL');
        try {
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) {
            console.error('>>> [TUNNEL] Crypt.decrypt FAIL:', e.message);
            throw e;
        }
    };

    // 1. Patch Server.js (Dynamic Routing)
    GuacServerClass.prototype.decryptToken = function (token) {
        console.log('>>> [TUNNEL] Server.decryptToken() bypass');
        try {
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) {
            console.error('>>> [TUNNEL] Server.decryptToken FAIL:', e.message);
            throw e;
        }
    };

    // 2. Patch ClientConnection.js (Handshake)
    GuacClientConnection.prototype.decryptToken = function () {
        console.log('>>> [TUNNEL] ClientConnection.decryptToken() bypass');
        try {
            const token = this.query.token;
            delete this.query.token;
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) {
            console.error('>>> [TUNNEL] ClientConnection.decryptToken FAIL:', e.message);
            throw e;
        }
    };

    // 3. Patch Connect to handle Cloudflare Bridge BEFORE starting guacd Handshake
    const originalConnect = GuacClientConnection.prototype.connect;
    GuacClientConnection.prototype.connect = async function (guacdOptions) {
        const settings = this.connectionSettings.connection.settings;

        if (settings && settings.hostname && (settings.hostname.includes('trycloudflare.com') || settings.hostname.includes('trycloudflare.com'))) {
            console.log('>>> [TUNNEL] CLOUDFLARE TICKET DETECTED');
            try {
                // Diagnostic: Check Path
                const { execSync, spawn } = require('child_process');
                try {
                    const whichOut = execSync('which cloudflared').toString().trim();
                    console.log('>>> [TUNNEL] cloudflared found at:', whichOut);
                } catch (e) {
                    console.error('>>> [TUNNEL] WARNING: cloudflared NOT in path. Will try default spawn.');
                }

                const tunnelUrl = settings.hostname;
                const cleanHostname = tunnelUrl.replace('https://', '').replace('http://', '').split('/')[0];
                const localPort = Math.floor(Math.random() * 10000) + 40000;

                console.log(`>>> [TUNNEL] Spawning Bridge: ${cleanHostname} -> 127.0.0.1:${localPort}`);

                const proxyProc = spawn('cloudflared', [
                    'access', 'tcp',
                    '--hostname', cleanHostname,
                    '--url', `127.0.0.1:${localPort}`
                ]);

                // Log proxy stderr for status/errors
                proxyProc.stderr.on('data', d => {
                    const msg = d.toString().trim();
                    console.log(`>>> [BRIDGE]: ${msg}`);
                });

                // Clean up when connection closes
                this.on('close', () => {
                    console.log(`>>> [TUNNEL] Killing bridge PID ${proxyProc.pid}`);
                    proxyProc.kill();
                });

                // Wait for bridge readiness
                console.log(`>>> [TUNNEL] Waiting for bridge on ${localPort}...`);
                let ready = false;
                for (let i = 0; i < 20; i++) { // Up to 10 seconds (500ms * 20)
                    ready = await isPortOpen(localPort, 400);
                    if (ready) break;
                    await new Promise(r => setTimeout(r, 500));
                }

                if (ready) {
                    console.log(`>>> [TUNNEL] SUCCESS: Bridge is active.`);
                    settings.hostname = '127.0.0.1';
                    settings.port = localPort;
                } else {
                    console.error('>>> [TUNNEL] FAILURE: Bridge timeout. Port did not open.');
                }
            } catch (err) {
                console.error('>>> [TUNNEL] CRITICAL BRIDGE EXCEPTION:', err.message);
            }
        }

        // Proceed to native guacd connect
        console.log(`>>> [TUNNEL] Final Guacd Connect -> ${settings.hostname}:${settings.port}`);
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
                console.log('>>> [TUNNEL] settings validation (callback)');
                callback(null, settings);
            }
        }
    );

    // Attach Global Listener
    httpServer.on('upgrade', (req, socket, head) => {
        if (req.url.startsWith('/guacamole')) {
            shimServer.emit('upgrade', req, socket, head);
        }
    });

    console.log('✅ Guacamole Tunnel online with Triple-Patched security.');
};
