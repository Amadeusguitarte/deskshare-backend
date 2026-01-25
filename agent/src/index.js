const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');
const axios = require('axios');

// ==========================================
// CONFIG & PATHS
// ==========================================
const APP_NAME = 'DeskShareLauncher';
const USER_DATA_PATH = app.getPath('userData');

// Portable config: Prioritize 'config.json' in the executable directory
const PORTABLE_CONFIG = path.join(__dirname, '..', '..', 'config.json');
const APPDATA_CONFIG = path.join(USER_DATA_PATH, 'config.json');
const CONFIG_PATH = fs.existsSync(PORTABLE_CONFIG) ? PORTABLE_CONFIG : APPDATA_CONFIG;

// Logs go to the same folder as config for visibility
const LOG_FILE = path.join(path.dirname(CONFIG_PATH), 'agent.log');

const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app';
const HEARTBEAT_INTERVAL = 60000;

// ==========================================
// STATE
// ==========================================
let mainWindow;
let cloudflaredProcess;
let vncProcess;
let config = {};
let webrtcMode = null;
let broadcasterWindow = null;

// ==========================================
// LOGGING & UTILS
// ==========================================
function safeSend(channel, data) {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(channel, data);
        }
    } catch (e) { }
}

function log(msg, type = 'info') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${msg}\n`;
    try { fs.appendFileSync(LOG_FILE, logLine); } catch (e) { }
    console.log(`[${type}] ${msg}`);
    safeSend('log-update', { msg, type });
}

// ==========================================
// WINDOW MANAGEMENT
// ==========================================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800, height: 600,
        backgroundColor: '#0a0a0f',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        show: false
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        startAgent();
    });
}

// ==========================================
// APP LIFECYCLE
// ==========================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    // Second Instance Handler
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        const url = commandLine.find(arg => arg.startsWith('deskshare://'));
        if (url) handleProtocolUrl(url);
    });

    // Ready Handler
    app.whenReady().then(() => {
        // Register Protocol
        if (process.defaultApp) {
            if (process.argv.length >= 2) {
                app.setAsDefaultProtocolClient('deskshare', process.execPath, [path.resolve(process.argv[1])]);
            }
        } else {
            app.setAsDefaultProtocolClient('deskshare');
        }

        createWindow();

        if (process.platform === 'win32') {
            const url = process.argv.find(arg => arg.startsWith('deskshare://'));
            if (url) handleProtocolUrl(url);
        }
    });

    // Cleanup
    app.on('window-all-closed', () => {
        if (cloudflaredProcess) cloudflaredProcess.kill();
        if (vncProcess) vncProcess.kill();
        app.quit();
    });

    // Crash Prevention
    process.on('uncaughtException', (err) => {
        log(`CRITICAL CRASH: ${err.message}`, 'error');
        try { fs.appendFileSync(LOG_FILE, `Stack: ${err.stack}\n`); } catch (e) { }
    });
}

// ==========================================
// IPC HANDLERS
// ==========================================
ipcMain.on('open-url', (e, url) => shell.openExternal(url));
ipcMain.on('retry-vnc', () => {
    log('User requested retry...', 'info');
    startAgentFallback();
});
ipcMain.on('start-webrtc-session', async (event, sessionId) => {
    log(`Starting WebRTC Session: ${sessionId}`, 'info');
    if (webrtcMode === 'browser') await startBroadcasterWindow(sessionId);
    else if (webrtcMode === 'native') require('./webrtc-broadcaster').startBroadcasting(sessionId, config.token);
});

// ==========================================
// CORE LOGIC
// ==========================================

function handleProtocolUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        const params = new URLSearchParams(url.search);
        if (params.has('computerId')) config.computerId = params.get('computerId');
        if (params.has('token')) config.token = params.get('token');
        saveConfig();

        // Restart services with new ID
        startAgent();
    } catch (e) {
        log(`Invalid Protocol URL: ${e.message}`, 'error');
    }
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            log(`Config Loaded (ID: ${config.computerId})`, 'info');
            safeSend('status-update', {
                status: 'CONFIGURED',
                details: `Computer ID: ${config.computerId}`
            });
        }
    } catch (e) {
        log('No config found', 'warning');
    }
}

function saveConfig() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) { }
}

async function startAgent() {
    loadConfig();

    if (!config.computerId || !config.token) {
        safeSend('status-update', { status: 'WAITING', details: 'Config Needed (Launch from Web)' });
        return;
    }

    safeSend('status-update', { status: 'STARTING', details: 'Initializing...' });

    // === 1. WEBRTC (P2P) ===
    try {
        log('Starting WebRTC P2P...', 'info');
        safeSend('status-update', { status: 'CONFIGURING', details: 'Setting up WebRTC...' });
        await setupWebRTC();
        safeSend('status-update', {
            status: 'ONLINE',
            details: `ID: ${config.computerId} | WebRTC: READY`
        });
    } catch (e) {
        log(`WebRTC Failed: ${e.message}`, 'warning');
    }

    // === 2. VNC + TUNNEL (Standard) ===
    // Always run this in parallel for Guacamole compat
    log('Starting Standard Tunnel...', 'info');
    startAgentFallback().catch(e => log(`Tunnel Error: ${e.message}`, 'error'));

    // Heartbeat
    if (global.heartbeatInt) clearInterval(global.heartbeatInt);
    global.heartbeatInt = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}

// ==========================================
// DUAL MODE SERVICES
// ==========================================

// --- WebRTC ---
async function setupWebRTC() {
    try {
        // Try Native first (requires binaries)
        try {
            require('wrtc');
            await setupWebRTCNative();
        } catch {
            await setupWebRTCBrowser();
        }
        return true;
    } catch (e) {
        throw e;
    }
}

async function setupWebRTCBrowser() {
    log('WebRTC: Using Browser Mode', 'info');
    broadcasterWindow = new BrowserWindow({
        width: 400, height: 300, show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
    });

    await registerWebRTCCapability('browser');
    webrtcMode = 'browser';
}

async function setupWebRTCNative() {
    const webrtc = require('./webrtc-broadcaster');
    await webrtc.registerWebRTCCapability(config.computerId, config.token);
    webrtcMode = 'native';
    log('WebRTC: Using Native Mode', 'success');
}

async function startBroadcasterWindow(sessionId) {
    if (!broadcasterWindow) return;
    const url = `file://${path.join(__dirname, 'broadcaster.html')}?sessionId=${sessionId}&token=${config.token}`;
    broadcasterWindow.loadURL(url);
}

async function registerWebRTCCapability(mode) {
    try {
        await axios.post(`${BACKEND_URL}/api/webrtc/register`,
            { computerId: config.computerId, mode },
            { headers: { 'Authorization': `Bearer ${config.token}` } }
        );
    } catch (e) { log(`WebRTC Reg Error: ${e.message}`, 'warning'); }
}


// --- STANDARD TUNNEL (VNC) ---

async function startAgentFallback() {
    const osType = await checkWindowsEdition();
    log(`OS Type: ${osType}`, 'info');

    let method = 'rdp';
    let port = 3389;
    let pass = null;

    if (osType === 'Home') {
        method = 'vnc';
        port = 5900;
        pass = "12345678"; // Internal password for VNC
        await setupVNC();
    } else {
        await enableRDP();
    }

    try {
        const url = await createTunnel(port);
        await registerTunnel(url, method, pass);
        log('Tunnel Registered Successfully', 'success');
    } catch (e) {
        throw e;
    }
}

async function checkWindowsEdition() {
    return new Promise(resolve => {
        exec('wmic os get Caption', (e, stdout) => {
            if (e) return resolve('Unknown');
            resolve(stdout.toString().toLowerCase().includes('home') ? 'Home' : 'Pro');
        });
    });
}

async function runPowershell(content) {
    const scriptPath = path.join(os.tmpdir(), `deskshare_setup_${Date.now()}.ps1`);
    fs.writeFileSync(scriptPath, content);
    return new Promise(resolve => {
        const child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath]);
        child.on('close', () => {
            try { fs.unlinkSync(scriptPath); } catch { }
            resolve();
        });
    });
}

// RDP Setup
async function enableRDP() {
    log('Enabling RDP...', 'info');
    const script = `
    Set-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name "fDenyTSConnections" -Value 0 -Force;
    Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue;
    `;
    await runPowershell(script);
}

// VNC Setup
async function setupVNC() {
    // 1. Locate Binary
    const binName = 'tvnserver.exe';
    let binPath = [
        path.join(__dirname, 'bin', binName),
        path.join(process.resourcesPath, 'bin', binName),
        path.join(__dirname, '..', '..', 'bin', binName)
    ].find(p => fs.existsSync(p));

    if (!binPath) {
        log('Error: VNC Binary Missing', 'error');
        safeSend('status-update', { status: 'MANUAL_ACTION_REQUIRED', details: 'Missing VNC Engine' });
        return;
    }

    // 2. Kill Old
    exec('taskkill /F /IM tvnserver.exe /T', () => { });

    // 3. Configure Registry (Password: 12345678)
    const script = `
    $path = "HKCU:\\Software\\TightVNC\\Server";
    if (!(Test-Path $path)) { New-Item -Path $path -Force; }
    $hex = "F0,E4,31,64,F6,C2,E3,73"; 
    $bytes = $hex.Split(',') | ForEach-Object { [byte]('0x' + $_) };
    Set-ItemProperty -Path $path -Name "Password" -Value $bytes -Type Binary -Force;
    Set-ItemProperty -Path $path -Name "RfbPort" -Value 5900 -Type DWord -Force;
    Set-ItemProperty -Path $path -Name "UseVncAuthentication" -Value 1 -Type DWord -Force;
    Set-ItemProperty -Path $path -Name "AllowLoopback" -Value 1 -Type DWord -Force;
    `;
    await runPowershell(script);

    // 4. Firewall
    await runPowershell(`
    if (!(Get-NetFirewallRule -DisplayName "DeskShare-VNC" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName "DeskShare-VNC" -Direction Inbound -LocalPort 5900 -Protocol TCP -Action Allow -Profile Any;
    }
    `);

    // 5. Spawn Process
    log('Spawning VNC Engine...', 'info');
    setTimeout(() => {
        vncProcess = spawn(binPath, ['-run'], { detached: true });
        log('VNC Engine Started', 'success');
    }, 1000);
}

// Cloudflare Tunnel
async function createTunnel(port) {
    if (cloudflaredProcess) cloudflaredProcess.kill();

    // Find binary
    const binName = 'cloudflared.exe';
    let binPath = [
        path.join(process.resourcesPath, 'bin', binName),
        path.join(__dirname, 'bin', binName),
        path.join(USER_DATA_PATH, 'bin', binName)
    ].find(p => fs.existsSync(p));

    // Download if missing
    if (!binPath) {
        log('Downloading Tunnel Engine...', 'info');
        binPath = path.join(USER_DATA_PATH, 'bin', binName);
        fs.mkdirSync(path.dirname(binPath), { recursive: true });
        const writer = fs.createWriteStream(binPath);
        const response = await axios({ method: 'get', url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', responseType: 'stream' });
        response.data.pipe(writer);
        await new Promise(r => writer.on('finish', r));
    }

    log(`Starting Tunnel on port ${port}...`, 'info');
    return new Promise((resolve, reject) => {
        cloudflaredProcess = spawn(binPath, ['tunnel', '--url', `tcp://localhost:${port}`]);
        cloudflaredProcess.stderr.on('data', d => {
            const t = d.toString();
            const m = t.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (m) resolve(m[0]);
        });
        setTimeout(() => reject(new Error('Tunnel Connection Timeout')), 20000);
    });
}

async function registerTunnel(url, method, pass) {
    try {
        await axios.post(`${BACKEND_URL}/api/tunnels/register`,
            { computerId: config.computerId, tunnelUrl: url, accessMethod: method, accessPassword: pass },
            { headers: { 'Authorization': `Bearer ${config.token}` } }
        );
    } catch (e) { log('Tunnel Registration Failed', 'error'); }
}

async function sendHeartbeat() {
    try {
        await axios.post(`${BACKEND_URL}/api/tunnels/heartbeat`, { computerId: config.computerId }, { headers: { 'Authorization': `Bearer ${config.token}` } });
    } catch { }
}
