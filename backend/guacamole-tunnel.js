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
 * Custom decrypt that handles URL-safe Base64 AND sanitizes token
 */
function customDecrypt(encodedToken, key) {
    // SANITIZE: Remove any URL pollution (e.g., ?undefined, &width=x)
    let cleanToken = encodedToken;
    if (cleanToken.includes('?')) {
        cleanToken = cleanToken.split('?')[0];
        console.log('[DECRYPT] SANITIZED: removed ?params from token');
    }
    if (cleanToken.includes('&')) {
        cleanToken = cleanToken.split('&')[0];
        console.log('[DECRYPT] SANITIZED: removed &params from token');
    }

    console.log('[DECRYPT] Clean token length:', cleanToken.length);
    console.log('[DECRYPT] Token first 50 chars:', cleanToken.substring(0, 50));
    console.log('[DECRYPT] Token last 20 chars:', cleanToken.substring(cleanToken.length - 20));

    // Convert URL-safe to standard Base64
    const standardBase64 = base64UrlToStandard(cleanToken);

    // Decode outer Base64 to get JSON string
    const jsonString = Buffer.from(standardBase64, 'base64').toString('ascii');
    console.log('[DECRYPT] JSON string first 100:', jsonString.substring(0, 100));

    // Parse JSON to get iv and value
    const parsed = JSON.parse(jsonString);

    // Decode iv and value
    const iv = Buffer.from(parsed.iv, 'base64');
    const encryptedValue = Buffer.from(parsed.value, 'base64');

    // Decrypt
    const decipher = Crypto.createDecipheriv('AES-256-CBC', key, iv);
    let decrypted = decipher.update(encryptedValue, null, 'utf8');
    decrypted += decipher.final('utf8');

    console.log('[DECRYPT] SUCCESS! Decrypted first 80:', decrypted.substring(0, 80));
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
        connectionTimeout: 60000, // EXTENDED TIMEOUT: 60s for Cloudflare Tunnel startup
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
        console.log('[PATCH] ClientConnection.decryptToken called!');
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
        console.log('[PATCH-SERVER] Server.decryptToken called!');
        try {
            return customDecrypt(token, encryptionKey);
        } catch (e) {
            console.error('[PATCH-SERVER] Decrypt error:', e.message);
            throw e;
        }
    };

    // === HELPER: CLOUDFLARED AUTO-DOWNLOADER ===
    async function getCloudflaredPath() {
        const { spawn } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        const axios = require('axios');
        const os = require('os');

        // 1. Check Global Path
        const globalCheck = new Promise(resolve => {
            const proc = spawn('cloudflared', ['--version']);
            proc.on('error', () => resolve(false));
            proc.on('close', code => resolve(code === 0 ? 'cloudflared' : false));
        });

        if (await globalCheck) return 'cloudflared';

        // 2. Check /tmp/cloudflared
        const tmpPath = path.join(os.tmpdir(), 'cloudflared-linux-amd64');
        if (fs.existsSync(tmpPath)) {
            try {
                fs.chmodSync(tmpPath, 0o777);
                return tmpPath;
            } catch (e) { }
        }

        // 3. Download
        console.log('[GUAC-BRIDGE] Cloudflared not found. Downloading to /tmp...');
        try {
            const writer = fs.createWriteStream(tmpPath);
            const response = await axios({
                method: 'get',
                url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
                responseType: 'stream'
            });
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            fs.chmodSync(tmpPath, 0o777);
            console.log('[GUAC-BRIDGE] Download complete.');
            return tmpPath;
        } catch (e) {
            console.error('[GUAC-BRIDGE] Download failed:', e.message);
            throw e;
        }
    }

    // Patch connect() to handle Cloudflare tunnels
    const originalConnect = GuacClientConnection.prototype.connect;
    GuacClientConnection.prototype.connect = async function (guacdOpts) {
        const conn = this.connectionSettings.connection;
        const config = conn.settings || conn;

        console.log(`[GUAC-BRIDGE] Hostname: ${config.hostname}`);

        if (config.hostname && config.hostname.includes('trycloudflare.com')) {
            console.log(`[GUAC-BRIDGE] Cloudflare tunnel detected`);
            try {
                const cleanHostname = config.hostname.replace('https://', '').replace('http://', '').split('/')[0];
                const localPort = Math.floor(Math.random() * 5000) + 40000;

                // GET BINARY
                const binPath = await getCloudflaredPath();
                console.log(`[GUAC-BRIDGE] Spawning ${binPath} on port ${localPort}...`);

                const { spawn } = require('child_process');
                const proxyProc = spawn(binPath, [
                    'access', 'tcp',
                    '--hostname', cleanHostname,
                    '--url', `127.0.0.1:${localPort}`
                ]);

                proxyProc.stderr.on('data', d => console.log(`[BRIDGE]: ${d.toString().trim()}`));
                proxyProc.on('error', e => console.error(`[BRIDGE ERR]: ${e.message}`));

                this.on('close', () => {
                    console.log(`[BRIDGE] Cleanup`);
                    proxyProc.kill();
                });

                let ready = false;
                for (let i = 0; i < 30; i++) {
                    ready = await isPortOpen(localPort, 500);
                    if (ready) break;
                    await new Promise(r => setTimeout(r, 500));
                }

                if (ready) {
                    console.log(`[BRIDGE] ACTIVE on 127.0.0.1:${localPort}`);
                    config.hostname = '127.0.0.1';
                    config.port = localPort;
                } else {
                    console.error('[BRIDGE] TIMEOUT');
                }
            } catch (err) {
                console.error('[BRIDGE] Error:', err.message);
            }
        }

        console.log(`[GUACD] Connecting to ${config.hostname}:${config.port}`);
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
                console.log('[GUAC] Settings OK');
                callback(null, settings);
            }
        }
    );

    httpServer.on('upgrade', (req, socket, head) => {
        if (req.url.startsWith('/guacamole')) {
            console.log('[GUAC] WebSocket upgrade');
            shimServer.emit('upgrade', req, socket, head);
        }
    });

    guacServer.on('error', (conn, err) => {
        console.error('[GUAC ERROR]:', err);
    });

    console.log('✅ Guacamole Tunnel (Token Sanitizer) Ready');
};
