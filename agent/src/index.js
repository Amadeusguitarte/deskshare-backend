/**
 * DeskShare Launcher Agent
 * Main Entry Point
 * 
 * This agent:
 * 1. Enables RDP on Windows (if not already enabled)
 * 2. Creates a cloudflared tunnel to expose RDP
 * 3. Registers the tunnel URL with DeskShare backend
 * 4. Sends heartbeats to keep the tunnel alive
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const os = require('os');

// Configuration
const CONFIG_PATH = path.join(os.homedir(), '.deskshare-launcher.json');
const BACKEND_URL = process.env.DESKSHARE_BACKEND || 'https://deskshare-backend-production.up.railway.app';
const HEARTBEAT_INTERVAL = 60000; // 1 minute

let config = {};
let cloudflaredProcess = null;
let tunnelUrl = null;

// ============================================
// Configuration Management
// ============================================

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            console.log('[Config] Loaded:', config);
        }
    } catch (e) {
        console.error('[Config] Failed to load:', e.message);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        console.log('[Config] Saved');
    } catch (e) {
        console.error('[Config] Failed to save:', e.message);
    }
}

// ============================================
// Parse Launch Arguments (from deskshare:// protocol)
// ============================================

function parseArgs() {
    // When launched via protocol: deskshare://start?computerId=X&token=Y
    const args = process.argv.slice(2);

    for (const arg of args) {
        if (arg.startsWith('deskshare://')) {
            const url = new URL(arg);
            const params = new URLSearchParams(url.search);

            if (params.has('computerId')) config.computerId = params.get('computerId');
            if (params.has('token')) config.token = params.get('token');
            if (params.has('action')) config.action = params.get('action');

            saveConfig();
        }
    }

    // Also check command line args
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--computerId' && args[i + 1]) config.computerId = args[i + 1];
        if (args[i] === '--token' && args[i + 1]) config.token = args[i + 1];
    }
}

// ============================================
// Enable RDP on Windows
// ============================================

async function enableRDP() {
    return new Promise((resolve, reject) => {
        console.log('[RDP] Checking/enabling RDP...');

        // PowerShell command to enable RDP
        const psCommand = `
            Set-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name "fDenyTSConnections" -Value 0;
            Enable-NetFirewallRule -DisplayGroup "Remote Desktop";
            Write-Output "RDP Enabled"
        `;

        exec(`powershell -ExecutionPolicy Bypass -Command "${psCommand}"`, { shell: true }, (error, stdout, stderr) => {
            if (error) {
                console.log('[RDP] May need admin rights to enable RDP:', error.message);
                // Continue anyway - RDP might already be enabled
                resolve(true);
            } else {
                console.log('[RDP] Status:', stdout.trim());
                resolve(true);
            }
        });
    });
}

// ============================================
// Create Cloudflared Tunnel
// ============================================

async function createTunnel() {
    return new Promise((resolve, reject) => {
        console.log('[Tunnel] Starting cloudflared...');

        // Check if cloudflared is installed
        const cloudflaredPath = process.platform === 'win32'
            ? path.join(__dirname, '..', 'assets', 'cloudflared.exe')
            : 'cloudflared';

        // For development/testing, use the system cloudflared
        const cmd = fs.existsSync(cloudflaredPath) ? cloudflaredPath : 'cloudflared';

        // Create tunnel for RDP (port 3389)
        cloudflaredProcess = spawn(cmd, [
            'tunnel', '--url', 'tcp://localhost:3389'
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';

        cloudflaredProcess.stderr.on('data', (data) => {
            const text = data.toString();
            output += text;
            console.log('[Cloudflared]', text.trim());

            // Look for the tunnel URL
            const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (match) {
                tunnelUrl = match[0];
                console.log('[Tunnel] URL:', tunnelUrl);
                resolve(tunnelUrl);
            }
        });

        cloudflaredProcess.on('error', (err) => {
            console.error('[Tunnel] Failed to start:', err.message);
            console.log('[Tunnel] Make sure cloudflared is installed: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/');
            reject(err);
        });

        cloudflaredProcess.on('exit', (code) => {
            console.log('[Tunnel] Exited with code:', code);
        });

        // Timeout after 30 seconds
        setTimeout(() => {
            if (!tunnelUrl) {
                reject(new Error('Tunnel creation timed out'));
            }
        }, 30000);
    });
}

// ============================================
// Register Tunnel with Backend
// ============================================

async function registerTunnel(url) {
    if (!config.computerId || !config.token) {
        console.error('[Register] Missing computerId or token');
        return false;
    }

    try {
        console.log('[Register] Registering tunnel with backend...');

        const response = await axios.post(
            `${BACKEND_URL}/api/tunnels/register`,
            {
                computerId: config.computerId,
                tunnelUrl: url
            },
            {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('[Register] Success:', response.data.message);
        return true;

    } catch (error) {
        console.error('[Register] Failed:', error.response?.data?.error || error.message);
        return false;
    }
}

// ============================================
// Heartbeat
// ============================================

async function sendHeartbeat() {
    if (!config.computerId || !config.token) return;

    try {
        await axios.post(
            `${BACKEND_URL}/api/tunnels/heartbeat`,
            { computerId: config.computerId },
            {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('[Heartbeat] Sent');
    } catch (error) {
        console.error('[Heartbeat] Failed:', error.message);
    }
}

// ============================================
// Cleanup
// ============================================

async function cleanup() {
    console.log('[Cleanup] Shutting down...');

    if (cloudflaredProcess) {
        cloudflaredProcess.kill();
    }

    // Notify backend we're going offline
    if (config.computerId && config.token) {
        try {
            await axios.post(
                `${BACKEND_URL}/api/tunnels/offline`,
                { computerId: config.computerId },
                {
                    headers: {
                        'Authorization': `Bearer ${config.token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log('[Cleanup] Notified backend of offline status');
        } catch (e) {
            // Ignore errors during cleanup
        }
    }

    process.exit(0);
}

// ============================================
// Main
// ============================================

async function main() {
    console.log('');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║     🚀 DeskShare Launcher v1.0.0         ║');
    console.log('║     Enabling Remote Access...            ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');

    // Load saved config
    loadConfig();

    // Parse protocol arguments
    parseArgs();

    if (!config.computerId || !config.token) {
        console.log('[Error] Missing configuration!');
        console.log('Launch via DeskShare website or provide --computerId and --token');
        console.log('');
        console.log('Usage: DeskShareLauncher.exe --computerId 123 --token eyJ...');
        process.exit(1);
    }

    console.log(`[Config] Computer ID: ${config.computerId}`);
    console.log(`[Config] Backend: ${BACKEND_URL}`);
    console.log('');

    // Step 1: Enable RDP
    await enableRDP();

    // Step 2: Create tunnel
    try {
        const url = await createTunnel();

        // Step 3: Register with backend
        await registerTunnel(url);

        // Step 4: Start heartbeat
        setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        console.log('');
        console.log('✅ DeskShare Launcher is running!');
        console.log('   Your computer is now accessible remotely.');
        console.log('   Keep this window open to maintain the connection.');
        console.log('');
        console.log('Press Ctrl+C to stop sharing.');

    } catch (error) {
        console.error('[Error]', error.message);
        console.log('');
        console.log('❌ Failed to start tunnel.');
        console.log('   Make sure cloudflared is installed.');
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Run
main().catch(console.error);
