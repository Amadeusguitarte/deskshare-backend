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
    clientOptions,
    {
        // Debug Callbacks
        processConnectionSettings: (settings, clientConnection) => {
            console.log('[Guacamole Debug] Processing Connection Settings:');
            // Mask password for safety in logs, but confirm it exists
            const safeSettings = { ...settings };
            if (safeSettings.settings && safeSettings.settings.password) {
                safeSettings.settings.password = '***MASKED***';
            }
            console.log(JSON.stringify(safeSettings, null, 2));

            // If type is missing or wrong, force it here if possible (debug only)
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
