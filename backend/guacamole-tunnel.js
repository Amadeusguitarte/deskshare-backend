const GuacamoleLite = require('guacamole-lite');

module.exports = function attachGuacamoleTunnel(httpServer) {
    const guacdOptions = {
        host: '127.0.0.1',
        port: 4822 // Default guacd port
    };

    const clientOptions = {
        crypt: {
            cypher: 'AES-256-CBC',
            key: process.env.GUAC_KEY || 'ThisIsASecretKeyForDeskShare123!' // 32 chars recommended
        },
        websocket: {
            path: '/guacamole' // Endpoint for websocket
        }
    };

    // Attach the tunnel to the existing HTTP server
    const guacServer = new GuacamoleLite(
        { server: httpServer },
        guacdOptions,
        clientOptions
    );

    console.log('✅ Guacamole Tunnel attached at /guacamole');

    // Error handling
    guacServer.on('error', (clientConnection, error) => {
        console.error('[Guacamole Error]:', error);
    });
};
