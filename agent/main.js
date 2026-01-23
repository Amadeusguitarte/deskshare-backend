const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');
const axios = require('axios');

// Config
const APP_NAME = 'DeskShareLauncher';
// In Electron, userData is automatically %AppData%/DeskShareLauncher
const LOG_FILE = path.join(app.getPath('userData'), 'agent.log');
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// Default backend (prod)
const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app';
const HEARTBEAT_INTERVAL = 60000;

let mainWindow;
let cloudflaredProcess;
let config = {};

// ==========================================
// Logging
// ==========================================
function log(msg, type = 'info') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${msg}\n`;

    // File log
    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (e) { }

    // Console log (for dev)
    console.log(`[${type}] ${msg}`);

    // UI log
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log-update', { msg, type });
    }
}

// ==========================================
// Window Management
// ==========================================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        backgroundColor: '#0a0a0f',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        show: false // Show when ready
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        startAgent();
    });

    // Register protocol handler (Runtime check)
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient('deskshare', process.execPath, [path.resolve(process.argv[1])]);
        }
    } else {
        app.setAsDefaultProtocolClient('deskshare');
    }
}

// ==========================================
// Protocol Handling (Single Instance)
// ==========================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }

        // Handle protocol args
        const url = commandLine.find(arg => arg.startsWith('deskshare://'));
        if (url) {
            log(`New protocol request: ${url}`, 'info');
            handleProtocolUrl(url);
        }
    });

    app.whenReady().then(() => {
        createWindow();

        // Handle if launched via protocol initially
        if (process.platform === 'win32') {
            const url = process.argv.find(arg => arg.startsWith('deskshare://'));
            if (url) handleProtocolUrl(url);
        }
    });
}

// ==========================================
// Logic
// ==========================================
function handleProtocolUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        const params = new URLSearchParams(url.search);

        if (params.has('computerId')) config.computerId = params.get('computerId');
        if (params.has('token')) config.token = params.get('token');

        saveConfig();

        // Restart agent process with new config
        startAgent();
    } catch (e) {
        log(`Invalid protocol URL: ${e.message}`, 'error');
    }
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            log('Config loaded', 'info');
            if (mainWindow) mainWindow.webContents.send('status-update', {
                status: 'CONFIGURED',
                details: `Computer ID: ${config.computerId}`
            });
        }
    } catch (e) {
        log('No config found', 'warning');
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (e) {
        log(`Failed to save config: ${e.message}`, 'error');
    }
}

async function startAgent() {
    loadConfig();

    if (!config.computerId || !config.token) {
        log('Waiting for configuration...', 'warning');
        if (mainWindow) mainWindow.webContents.send('status-update', { status: 'WAITING', details: 'Launch from website to configure' });
        return;
    }

    if (mainWindow) mainWindow.webContents.send('status-update', { status: 'STARTING', details: 'Initializing services...' });

    try {
        // 1. Enable RDP
        await enableRDP();

        // 2. Start Tunnel
        const url = await createTunnel();

        // 3. Register
        await registerTunnel(url);

        // 4. Heartbeat
        // Clear existing interval if restarting
        if (global.heartbeatInt) clearInterval(global.heartbeatInt);
        global.heartbeatInt = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        log('Agent is FULLY ONLINE', 'success');
        if (mainWindow) mainWindow.webContents.send('status-update', {
            status: 'ONLINE',
            details: `ID: ${config.computerId} | Tunnel Active`
        });

    } catch (e) {
        log(e.message, 'error');
        if (mainWindow) mainWindow.webContents.send('status-update', { status: 'ERROR', details: e.message });
    }
}

async function enableRDP() {
    log('Checking RDP status...', 'info');
    return new Promise(resolve => {
        const psCommand = `
            Set-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name "fDenyTSConnections" -Value 0;
            Enable-NetFirewallRule -DisplayGroup "Remote Desktop";
            Write-Output "RDP Enabled"
        `;
        // We use spawn for better stability
        const child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-Command', psCommand]);

        child.on('close', (code) => {
            log(`RDP Check complete (Code: ${code})`, 'info');
            resolve();
        });
    });
}

// Same tunnel logic as before, but adapted paths
async function downloadCloudflared() {
    const binName = 'cloudflared.exe';
    const binPath = path.join(app.getPath('userData'), 'bin', binName);

    if (fs.existsSync(binPath)) return binPath;

    log('Downloading cloudflared...', 'info');
    fs.mkdirSync(path.dirname(binPath), { recursive: true });

    const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
    const response = await axios({ method: 'get', url, responseType: 'stream' });
    const writer = fs.createWriteStream(binPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(binPath));
        writer.on('error', reject);
    });
}

async function createTunnel() {
    if (cloudflaredProcess) cloudflaredProcess.kill();

    const binPath = await downloadCloudflared();
    log('Starting tunnel...', 'info');

    return new Promise((resolve, reject) => {
        cloudflaredProcess = spawn(binPath, ['tunnel', '--url', 'tcp://localhost:3389']);

        let foundUrl = false;

        cloudflaredProcess.stderr.on('data', (data) => {
            const text = data.toString();
            if (text.includes('trycloudflare.com')) {
                const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                if (match) {
                    foundUrl = true;
                    log(`Tunnel URL: ${match[0]}`, 'success');
                    resolve(match[0]);
                }
            }
        });

        // Timeout
        setTimeout(() => {
            if (!foundUrl) reject(new Error('Tunnel timeout'));
        }, 15000);
    });
}

async function registerTunnel(url) {
    log('Registering with backend...', 'info');
    try {
        await axios.post(`${BACKEND_URL}/api/tunnels/register`,
            { computerId: config.computerId, tunnelUrl: url },
            { headers: { 'Authorization': `Bearer ${config.token}` } }
        );
        log('Registration confirmed', 'success');
        return true;
    } catch (e) {
        throw new Error(`Registration failed: ${e.message}`);
    }
}

async function sendHeartbeat() {
    try {
        await axios.post(`${BACKEND_URL}/api/tunnels/heartbeat`,
            { computerId: config.computerId },
            { headers: { 'Authorization': `Bearer ${config.token}` } }
        );
    } catch (e) { }
}

app.on('window-all-closed', () => {
    // Keep running in tray ideally, but for now quit
    if (cloudflaredProcess) cloudflaredProcess.kill();
    app.quit();
});
