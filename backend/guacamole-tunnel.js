const GuacamoleLite = require('guacamole-lite');

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

    // --- FIX: UPGRADE CONFLICT SHIM ---
    // GuacamoleLite attempts to handle ALL upgrades if passed the server directly.
    // Socket.IO also handles upgrades.
    // Solution: Pass a fake "Shim" server to GuacamoleLite to capture its listener,
    // then manually route only requests starting with '/guacamole' from the real server.

    const { EventEmitter } = require('events');
    const shimServer = new EventEmitter();

    // 1. Initialize GuacamoleLite with Shim
    const guacServer = new GuacamoleLite(
        { server: shimServer },
        guacdOptions,
        clientOptions,
        {
            // Callbacks
            processConnectionSettings: (settings, clientConnection) => {
                console.log('[Guacamole] Processing Params...');

                // --- CLOUDFLARE PROXY LOGIC ---
                // If hostname is a Cloudflare Tunnel URL, we must bridge it via 'cloudflared access'
                // because guacd cannot speak HTTP-Tunnel-TCP natively.

                if (settings.settings.hostname && settings.settings.hostname.includes('trycloudflare.com')) {
                    try {
                        const tunnelUrl = settings.settings.hostname;
                        // Pick random port 40000-50000
                        const localPort = Math.floor(Math.random() * 10000) + 40000;

                        console.log(`[Guacamole Proxy] Cloudflare Tunnel Detected: ${tunnelUrl}`);
                        console.log(`[Guacamole Proxy] Spawning bridge on 127.0.0.1:${localPort}...`);

                        const { spawn } = require('child_process');
                        const proxyProc = spawn('cloudflared', [
                            'access', 'tcp',
                            '--hostname', tunnelUrl,
                            '--url', `127.0.0.1:${localPort}`
                        ]);

                        proxyProc.stdout.on('data', d => console.log(`[Proxy Out]: ${d}`));
                        proxyProc.stderr.on('data', d => console.log(`[Proxy Err]: ${d}`));

                        proxyProc.on('error', (err) => {
                            console.error(`[Guacamole Proxy Error] Failed to spawn: ${err.message}`);
                        });

                        // Clean up when client disconnects
                        clientConnection.on('close', () => {
                            console.log(`[Guacamole Proxy] Client closed. Killing proxy PID ${proxyProc.pid}`);
                            proxyProc.kill();
                        });

                        // Rewrite Settings for Guacd
                        settings.settings.hostname = '127.0.0.1';
                        settings.settings.port = localPort;

                        // Wait a tiny bit for spawn? Guacd retries, so it's fine.

                        console.log(`[Guacamole Proxy] Rewrote target to 127.0.0.1:${localPort}`);
                    } catch (e) {
                        console.error(`[Guacamole Proxy Exception] ${e.message}`);
                    }
                }

                // Log final (masked)
                const safe = { ...settings };
                if (safe.settings?.password) safe.settings.password = '***MASKED***';
                console.log(JSON.stringify(safe, null, 2));

                return settings;
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
