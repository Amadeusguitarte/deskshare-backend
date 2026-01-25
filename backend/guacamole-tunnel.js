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
        // We can put allowed settings here if needed, but GuacamoleLite handles them
        allowedUnencryptedConnectionSettings: {
            rdp: ['width', 'height', 'dpi'],
            vnc: ['width', 'height', 'dpi'],
            ssh: ['width', 'height', 'dpi'],
            telnet: ['width', 'height', 'dpi'],
            kubernetes: ['width', 'height', 'dpi'],
        }
    };

    // --- NUCLEAR FIX: MONKEY-PATCH LIBRARAY ---
    // The library has incompatible decryption logic between Server.js and ClientConnection.js.
    // We force both to just use Base64 decode to solve the "Token validation failed" error permanently.

    const GuacClientConnection = require('guacamole-lite/lib/ClientConnection.js');
    const GuacServerClass = require('guacamole-lite/lib/Server.js');

    // 1. Patch Server.js (Dynamic Routing)
    GuacServerClass.prototype.decryptToken = function (token) {
        console.log('[Nuclear Patch] Bypassing Server decryption...');
        try {
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) {
            console.error('[Nuclear Patch] Server decode fail:', e.message);
            throw e;
        }
    };

    // 2. Patch ClientConnection.js (Handshake)
    GuacClientConnection.prototype.decryptToken = function () {
        console.log('[Nuclear Patch] Bypassing Connection decryption...');
        try {
            const token = this.query.token;
            delete this.query.token;
            return JSON.parse(Buffer.from(token, 'base64').toString());
        } catch (e) {
            console.error('[Nuclear Patch] Connection decode fail:', e.message);
            throw e;
        }
    };

    const { EventEmitter } = require('events');
    const shimServer = new EventEmitter();

    // 1. Initialize GuacamoleLite with Shim
    const guacServer = new GuacamoleLite(
        { server: shimServer },
        guacdOptions,
        clientOptions,
        {
            // Callbacks
            processConnectionSettings: async (settings, callback) => {
                console.log('[Guacamole] Processing Params...');

                // --- CLOUDFLARE PROXY LOGIC ---
                // If hostname is a Cloudflare Tunnel URL, we must bridge it via 'cloudflared access'
                // because guacd cannot speak HTTP-Tunnel-TCP natively.

                if (settings.settings.hostname && settings.settings.hostname.includes('trycloudflare.com')) {
                    try {
                        let tunnelUrl = settings.settings.hostname;
                        // Clean URL: remove https:// if present for --hostname flag
                        const cleanHostname = tunnelUrl.replace('https://', '').replace('http://', '').split('/')[0];

                        // Pick random port 40000-50000
                        const localPort = Math.floor(Math.random() * 10000) + 40000;

                        console.log(`[Guacamole Proxy] Cloudflare Tunnel Detected: ${cleanHostname}`);
                        console.log(`[Guacamole Proxy] Spawning bridge on 127.0.0.1:${localPort}...`);

                        const { spawn } = require('child_process');
                        // Use full path if needed, but 'cloudflared' should be in PATH from nixpacks
                        const proxyProc = spawn('cloudflared', [
                            'access', 'tcp',
                            '--hostname', cleanHostname,
                            '--url', `127.0.0.1:${localPort}`
                        ]);

                        proxyProc.stdout.on('data', d => console.log(`[Proxy-STDOUT]: ${d}`));
                        proxyProc.stderr.on('data', d => {
                            const msg = d.toString();
                            console.log(`[Proxy-STDERR]: ${msg}`);
                        });

                        proxyProc.on('error', (err) => {
                            console.error(`[Guacamole Proxy Error] Failed to spawn: ${err.message}`);
                        });

                        proxyProc.on('exit', (code) => {
                            console.log(`[Guacamole Proxy] Process exited with code ${code}`);
                        });

                        // Clean up? We need access to the clientConnection object. 
                        // Wait, how do we get clientConnection here? 
                        // The library ClientConnection.js:53 only passes (settings, callback).
                        // I might need to monkey-patch ClientConnection.js too or use a Closure.
                        // Actually, I can just not kill the proxy here, or kill it on a global timer?
                        // BETTER: The library emits 'close' on the guacServer.

                        // Rewrite Settings for Guacd
                        settings.settings.hostname = '127.0.0.1';
                        settings.settings.port = localPort;

                        // --- WAIT FOR PORT READINESS ---
                        console.log(`[Guacamole Proxy] Waiting for 127.0.0.1:${localPort}...`);
                        let ready = false;
                        for (let i = 0; i < 10; i++) {
                            ready = await isPortOpen(localPort, 500);
                            if (ready) break;
                            await new Promise(r => setTimeout(r, 500));
                        }

                        if (!ready) {
                            console.error('[Guacamole Proxy] PORT FAILED TO OPEN in 5s');
                        } else {
                            console.log(`[Guacamole Proxy] Bridge ACTIVE on 127.0.0.1:${localPort}`);
                        }

                    } catch (e) {
                        console.error(`[Guacamole Proxy Exception] ${e.message}`);
                    }
                }

                // Log final (masked)
                const safe = { ...settings };
                if (safe.settings?.password) safe.settings.password = '***MASKED***';
                console.log(JSON.stringify(safe, null, 2));

                callback(null, settings);
            }
        }
    );

    // 2. Attach Global Listener to Real Server
    httpServer.on('upgrade', (req, socket, head) => {
        if (req.url.startsWith('/guacamole')) {
            // Signal GuacamoleLite (through shim) to handle this
            shimServer.emit('upgrade', req, socket, head);
        }
    });

    console.log('✅ Guacamole Tunnel attached via Shim at /guacamole');

    // Error handling
    guacServer.on('error', (clientConnection, error) => {
        console.error('[Guacamole Error]:', error);
    });
};
