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
const APP_NAME = 'DeskShareLauncher';
const INSTALL_DIR = path.join(os.homedir(), 'AppData', 'Local', 'DeskShare');
const INSTALL_PATH = path.join(INSTALL_DIR, 'DeskShareLauncher.exe');
const CONFIG_PATH = path.join(INSTALL_DIR, 'config.json');
const BACKEND_URL = process.env.DESKSHARE_BACKEND || 'https://deskshare-backend-production.up.railway.app';
const HEARTBEAT_INTERVAL = 60000; // 1 minute

let config = {};
let cloudflaredProcess = null;
let tunnelUrl = null;

// ============================================
// Self-Installation & Protocol Registration
// ============================================

async function ensureInstalled() {
    // Create install directory
    if (!fs.existsSync(INSTALL_DIR)) {
        fs.mkdirSync(INSTALL_DIR, { recursive: true });
        console.log('[Install] Creando directorio:', INSTALL_DIR);
    }

    // Get current exe path
    const currentExe = process.execPath;

    // Check if we're already running from install location
    if (currentExe.toLowerCase() === INSTALL_PATH.toLowerCase()) {
        console.log('[Install] Ya instalado ✓');
        return true;
    }

    // Check if this is a pkg-bundled exe (not node.exe)
    if (!currentExe.includes('node.exe')) {
        console.log('[Install] Instalando DeskShare Launcher...');

        try {
            // Copy exe to install location
            fs.copyFileSync(currentExe, INSTALL_PATH);
            console.log('[Install] Copiado a:', INSTALL_PATH);

            // Register protocol handler
            await registerProtocol();

            console.log('[Install] ¡Instalación completa! ✓');
            console.log('[Install] Ahora puedes usar DeskShare desde la web.');

        } catch (e) {
            console.error('[Install] Error:', e.message);
        }
    }

    return true;
}

async function registerProtocol() {
    return new Promise((resolve, reject) => {
        console.log('[Protocol] Registrando deskshare://...');

        // PowerShell command to register protocol handler in registry
        const regCommands = `
            $protocolPath = 'HKCU:\\Software\\Classes\\deskshare'
            
            # Create protocol key
            New-Item -Path $protocolPath -Force | Out-Null
            Set-ItemProperty -Path $protocolPath -Name '(Default)' -Value 'URL:DeskShare Protocol'
            Set-ItemProperty -Path $protocolPath -Name 'URL Protocol' -Value ''
            
            # Create shell/open/command
            New-Item -Path "$protocolPath\\shell\\open\\command" -Force | Out-Null
            Set-ItemProperty -Path "$protocolPath\\shell\\open\\command" -Name '(Default)' -Value '"\\"${INSTALL_PATH.replace(/\\/g, '\\\\')}"\\" \\"%1\\"'
            
            Write-Output 'Protocol registered'
        `;

        exec(`powershell -ExecutionPolicy Bypass -Command "${regCommands}"`, { shell: true }, (error, stdout, stderr) => {
            if (error) {
                console.error('[Protocol] Error:', error.message);
                reject(error);
            } else {
                console.log('[Protocol] Registrado ✓');
                resolve(true);
            }
        });
    });
}

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
// Download Cloudflared (Auto on first run)
// ============================================

const CLOUDFLARED_PATH = path.join(os.homedir(), '.deskshare', 'cloudflared.exe');

async function downloadCloudflared() {
    const cloudflaredDir = path.dirname(CLOUDFLARED_PATH);

    // Create directory if not exists
    if (!fs.existsSync(cloudflaredDir)) {
        fs.mkdirSync(cloudflaredDir, { recursive: true });
    }

    // Check if already downloaded
    if (fs.existsSync(CLOUDFLARED_PATH)) {
        console.log('[Cloudflared] Ya instalado ✓');
        return CLOUDFLARED_PATH;
    }

    console.log('[Cloudflared] Descargando... (solo la primera vez)');
    console.log('[Cloudflared] Esto puede tardar 1-2 minutos...');

    const downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

    try {
        const response = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream',
            timeout: 120000 // 2 minutes timeout
        });

        const writer = fs.createWriteStream(CLOUDFLARED_PATH);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log('[Cloudflared] Descargado correctamente ✓');
        return CLOUDFLARED_PATH;

    } catch (error) {
        console.error('[Cloudflared] Error al descargar:', error.message);
        throw error;
    }
}

// ============================================
// Create Cloudflared Tunnel
// ============================================

async function createTunnel() {
    // Step 1: Auto-download cloudflared if needed
    const cloudflaredPath = await downloadCloudflared();

    return new Promise((resolve, reject) => {
        console.log('[Tunnel] Iniciando túnel seguro...');

        // Create tunnel for RDP (port 3389)
        cloudflaredProcess = spawn(cloudflaredPath, [
            'tunnel', '--url', 'tcp://localhost:3389'
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';

        cloudflaredProcess.stderr.on('data', (data) => {
            const text = data.toString();
            output += text;

            // Only log important lines
            if (text.includes('trycloudflare.com') || text.includes('INF')) {
                console.log('[Tunnel]', text.trim().substring(0, 100));
            }

            // Look for the tunnel URL
            const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (match) {
                tunnelUrl = match[0];
                console.log('[Tunnel] ¡Conectado!');
                console.log('[Tunnel] URL:', tunnelUrl);
                resolve(tunnelUrl);
            }
        });

        cloudflaredProcess.on('error', (err) => {
            console.error('[Tunnel] Error al iniciar:', err.message);
            reject(err);
        });

        cloudflaredProcess.on('exit', (code) => {
            if (code !== 0) {
                console.log('[Tunnel] Se cerró con código:', code);
            }
        });

        // Timeout after 45 seconds
        setTimeout(() => {
            if (!tunnelUrl) {
                reject(new Error('El túnel tardó demasiado en conectar'));
            }
        }, 45000);
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
// Logging & UI Utilities
// ============================================

const LOG_FILE = path.join(INSTALL_DIR, 'debug.log');

function logToFile(msg) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (e) {
        // Ignored
    }
}

function log(msg, type = 'info') {
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} ${msg}`);
    logToFile(`${type.toUpperCase()}: ${msg}`);
}

function waitAndExit(code = 0) {
    console.log('');
    console.log('Press any key to close this window...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(code));
}

// ============================================
// Main
// ============================================

async function main() {
    // Initial Setup
    if (!fs.existsSync(INSTALL_DIR)) fs.mkdirSync(INSTALL_DIR, { recursive: true });
    logToFile('--- Starting DeskShare Launcher ---');

    console.clear();
    console.log('\x1b[36m%s\x1b[0m', '╔════════════════════════════════════════════════╗');
    console.log('\x1b[36m%s\x1b[0m', '║           DeskShare Launcher Agent             ║');
    console.log('\x1b[36m%s\x1b[0m', '║        Zero-Config Remote Access Tool          ║');
    console.log('\x1b[36m%s\x1b[0m', '╚════════════════════════════════════════════════╝');
    console.log('');

    try {
        // Step 0: Ensure installed & protocol registered (first run only)
        log('Verifying installation...', 'info');
        await ensureInstalled();

        // Load saved config
        loadConfig();

        // Parse protocol arguments
        parseArgs();
        log(`Arguments parsed: ${JSON.stringify(process.argv)}`, 'info');

        if (!config.computerId || !config.token) {
            log('Configuration missing!', 'error');
            log('Please launch this agent via the DeskShare website.', 'info');
            console.log('');
            console.log('Or use command line: --computerId X --token Y');
            waitAndExit(1);
            return;
        }

        log(`Computer ID: ${config.computerId}`, 'info');
        log(`Backend: ${BACKEND_URL}`, 'info');

        // Step 1: Enable RDP
        log('Enabling Remote Desktop Protocol...', 'info');
        await enableRDP();

        // Step 2: Create tunnel
        log('Starting secure tunnel...', 'info');
        const url = await createTunnel();

        // Step 3: Register with backend
        log('Registering with DeskShare Network...', 'info');
        const success = await registerTunnel(url);

        if (!success) {
            throw new Error('Failed to register with backend');
        }

        // Step 4: Start heartbeat
        setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        console.clear();
        console.log('\x1b[32m%s\x1b[0m', '╔════════════════════════════════════════════════╗');
        console.log('\x1b[32m%s\x1b[0m', '║              ✅ SYSTEM ONLINE                  ║');
        console.log('\x1b[32m%s\x1b[0m', '╚════════════════════════════════════════════════╝');
        console.log('');
        console.log('  🟢 Tunnel Status:  CONNECTED');
        console.log(`  🔗 Secure URL:     ${url}`);
        console.log(`  🖥️  Computer ID:    ${config.computerId}`);
        console.log('');
        console.log('  Your computer is now securely accessible.');
        console.log('  You can minimize this window, but DO NOT CLOSE IT.');
        console.log('');
        console.log('  [Quit: Ctrl+C]');

    } catch (error) {
        log(error.message, 'error');
        log(error.stack, 'error');
        console.log('');
        console.log('❌ FATAL ERROR: The agent could not start.');
        console.log(`   Logs saved to: ${LOG_FILE}`);
        waitAndExit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
    logToFile(`UNCAUGHT: ${err.message}\n${err.stack}`);
    console.error('CRASH:', err.message);
    waitAndExit(1);
});

// Run
main().catch(e => {
    console.error(e);
    waitAndExit(1);
});
