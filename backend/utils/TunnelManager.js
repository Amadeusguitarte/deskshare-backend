// ==========================================
// Tunnel Manager
// Manages local bridges to Cloudflare Tunnels
// ==========================================

const { spawn } = require('child_process');
const net = require('net');

class TunnelManager {
    constructor() {
        this.activeBridges = new Map(); // bookingId -> { process, port, killed }
    }

    /**
     * Bridges a Cloudflare TCP tunnel to a local port
     * @param {string} tunnelUrl The public tunnel URL (e.g. tcp://....trycloudflare.com)
     * @param {string} bookingId Unique ID to track this bridge
     * @returns {Promise<number>} The local port to connect to
     */
    async bridgeTunnel(tunnelUrl, bookingId) {
        // Clean up existing bridge if any
        this.stopBridge(bookingId);

        return new Promise((resolve, reject) => {
            // Find a random free port
            const server = net.createServer();
            server.listen(0, () => {
                const port = server.address().port;
                server.close(() => {
                    this._startCloudflared(tunnelUrl, port, bookingId, resolve, reject);
                });
            });
        });
    }

    _startCloudflared(tunnelUrl, localPort, bookingId, resolve, reject) {
        // Ensure URL format
        const hostname = tunnelUrl.replace('tcp://', '').replace('https://', '');

        console.log(`[TunnelManager] Bridging ${hostname} to localhost:${localPort}`);

        const cf = spawn('cloudflared', [
            'access', 'tcp',
            '--hostname', hostname,
            '--url', `localhost:${localPort}`
        ]);

        const bridge = {
            process: cf,
            port: localPort,
            killed: false
        };

        this.activeBridges.set(bookingId, bridge);

        let resolved = false;

        cf.stderr.on('data', (data) => {
            const text = data.toString();
            // console.log(`[Cloudflared-Bridge] ${text}`); // Verbose

            // Cloudflared doesn't explicit "started" signal easily, 
            // but we can assume it works if it doesn't crash immediately.
            // However, to be safe, we wait 1 second then resolve.
            if (!resolved) {
                resolved = true;
                setTimeout(() => resolve(localPort), 1000);
            }
        });

        cf.on('error', (err) => {
            console.error('[TunnelManager] Failed to start cloudflared:', err);
            if (!resolved) reject(err);
        });

        cf.on('exit', (code) => {
            console.log(`[TunnelManager] Bridge closed (code ${code}): ${bookingId}`);
            if (!resolved) reject(new Error(`Bridge exited with code ${code}`));

            // Clean up map if not already removed
            const current = this.activeBridges.get(bookingId);
            if (current && current.process.pid === cf.pid) {
                this.activeBridges.delete(bookingId);
            }
        });
    }

    stopBridge(bookingId) {
        const bridge = this.activeBridges.get(bookingId);
        if (bridge) {
            console.log(`[TunnelManager] Stopping bridge for ${bookingId}`);
            bridge.killed = true;
            bridge.process.kill();
            this.activeBridges.delete(bookingId);
        }
    }
}

// Singleton
module.exports = new TunnelManager();
