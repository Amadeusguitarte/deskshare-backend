const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');
const axios = require('axios');

// ==========================================
// CONFIG & PATHS
// ==========================================
const APP_NAME = 'DeskShareLauncherV11';
const USER_DATA_PATH = app.getPath('userData');

// Portable config
const PORTABLE_CONFIG = path.join(__dirname, '..', '..', 'config.json');
const APPDATA_CONFIG = path.join(USER_DATA_PATH, 'config.json');
const CONFIG_PATH = fs.existsSync(PORTABLE_CONFIG) ? PORTABLE_CONFIG : APPDATA_CONFIG;
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
let currentSessionId = null;

// ==========================================
// LOGGING
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
    mainWindow.once('ready-to-show', () => mainWindow.show());
}

// ==========================================
// APP LIFECYCLE
// ==========================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        const url = commandLine.find(arg => arg.startsWith('deskshare://'));
        if (url) handleProtocolUrl(url);
    });

    app.whenReady().then(() => {
        if (process.defaultApp && process.argv.length >= 2) {
            app.setAsDefaultProtocolClient('deskshare', process.execPath, [path.resolve(process.argv[1])]);
        } else {
            app.setAsDefaultProtocolClient('deskshare');
        }
        createWindow();
        if (process.platform === 'win32') {
            const url = process.argv.find(arg => arg.startsWith('deskshare://'));
            if (url) handleProtocolUrl(url);
        }
    });

    app.on('window-all-closed', () => {
        cleanup();
        app.quit();
    });

    process.on('uncaughtException', (err) => {
        log(`CRITICAL: ${err.message}`, 'error');
    });
}

function cleanup() {
    if (cloudflaredProcess) { try { cloudflaredProcess.kill(); } catch (e) { } }
    if (vncProcess) { try { vncProcess.kill(); } catch (e) { } }
    if (global.heartbeatInt) clearInterval(global.heartbeatInt);
    if (global.sessionPollInt) clearInterval(global.sessionPollInt);
}

// ==========================================
// IPC HANDLERS
// ==========================================
ipcMain.on('start-mode', (event, mode) => {
    log(`User selected mode: ${mode}`, 'info');
    if (mode === 'guacamole') {
        runGuacamoleMode();
    } else if (mode === 'webrtc') {
        runPureWebRTCMode();
    }
});

ipcMain.on('open-url', (e, url) => shell.openExternal(url));
ipcMain.on('open-webrtc-debug', () => {
    if (broadcasterWindow) {
        broadcasterWindow.show();
        broadcasterWindow.focus();
        broadcasterWindow.webContents.openDevTools();
    }
});

// ==========================================
// PROTOCOL HANDLER
// ==========================================
function handleProtocolUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        const params = new URLSearchParams(url.search);
        if (params.has('computerId')) config.computerId = params.get('computerId');
        if (params.has('token')) config.token = params.get('token');
        saveConfig();
    } catch (e) {
        log(`Invalid Protocol URL: ${e.message}`, 'error');
    }
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            log(`Config Loaded (ID: ${config.computerId})`, 'info');
        }
    } catch (e) {
        log('No config found', 'warning');
    }
}

function saveConfig() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) { }
}

// ==========================================
// MODE 1: GUACAMOLE (VNC + TUNNEL)
// ==========================================
async function runGuacamoleMode() {
    log('=== STARTING GUACAMOLE MODE ===', 'info');
    loadConfig();

    if (!config.computerId || !config.token) {
        safeSend('status-update', { status: 'WAITING', details: 'Config Needed' });
        return;
    }

    safeSend('status-update', { status: 'STARTING', details: 'Iniciando VNC + Tunnel...' });
    cleanup();

    try {
        await startVNCAndTunnel();

        safeSend('status-update', {
            status: 'ONLINE',
            details: `ID: ${config.computerId} | GUACAMOLE READY`
        });

        if (global.heartbeatInt) clearInterval(global.heartbeatInt);
        global.heartbeatInt = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        log('=== GUACAMOLE MODE ACTIVE ===', 'success');

    } catch (e) {
        log(`Guacamole Error: ${e.message}`, 'error');
        safeSend('status-update', { status: 'ERROR', details: e.message });
    }
}

async function startVNCAndTunnel() {
    const osType = await checkWindowsEdition();
    log(`OS Type: ${osType}`, 'info');

    let method = 'rdp';
    let port = 3389;
    let pass = null;

    if (osType === 'Home') {
        method = 'vnc';
        port = 5900;
        pass = "12345678";
        await setupVNC();
    } else {
        await enableRDP();
    }

    const url = await createTunnel(port);
    await registerTunnel(url, method, pass);
    log('Tunnel Registered', 'success');
}

// ==========================================
// MODE 2: PURE WEBRTC (P2P - NO VNC/TUNNEL)
// ==========================================
async function runPureWebRTCMode() {
    log('=== STARTING PURE WEBRTC MODE ===', 'info');
    loadConfig();

    if (!config.computerId || !config.token) {
        safeSend('status-update', { status: 'WAITING', details: 'Config Needed' });
        return;
    }

    safeSend('status-update', { status: 'STARTING', details: 'Iniciando WebRTC P2P...' });
    cleanup();

    try {
        // Step 1: Create broadcaster window
        log('[WebRTC] Creating broadcaster window...', 'info');
        broadcasterWindow = new BrowserWindow({
            width: 600, height: 400, show: false,
            title: 'DeskShare WebRTC Broadcaster',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            }
        });
        broadcasterWindow.loadFile('broadcaster.html');
        webrtcMode = 'browser';
        log('[WebRTC] Broadcaster window created', 'success');

        // Step 2: Register WebRTC capability
        log('[WebRTC] Registering capability...', 'info');
        await axios.post(`${BACKEND_URL}/api/webrtc/register`,
            { computerId: config.computerId, mode: 'browser' },
            { headers: { 'Authorization': `Bearer ${config.token}` } }
        );
        log('[WebRTC] Registered webrtcCapable=true', 'success');

        // Step 3: Start polling for sessions
        log('[WebRTC] Starting session poll...', 'info');
        if (global.sessionPollInt) clearInterval(global.sessionPollInt);
        global.sessionPollInt = setInterval(pollPendingSessions, 2000);
        log('[WebRTC] Polling every 2 seconds', 'success');

        // Step 4: Update UI
        safeSend('status-update', {
            status: 'ONLINE',
            details: `ID: ${config.computerId} | WEBRTC P2P READY`
        });

        log('=== WEBRTC MODE ACTIVE ===', 'success');
        log('Waiting for viewer to connect...', 'info');

        // Heartbeat
        if (global.heartbeatInt) clearInterval(global.heartbeatInt);
        global.heartbeatInt = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    } catch (e) {
        log(`WebRTC Error: ${e.message}`, 'error');
        safeSend('status-update', { status: 'ERROR', details: `WebRTC: ${e.message}` });
    }
}

async function pollPendingSessions() {
    try {
        if (!config.computerId || !config.token) return;

        const response = await axios.get(`${BACKEND_URL}/api/webrtc/host/pending`, {
            params: { computerId: config.computerId },
            headers: { 'Authorization': `Bearer ${config.token}` }
        });

        if (response.data.sessionId) {
            const sid = response.data.sessionId;
            if (currentSessionId !== sid) {
                log(`[WebRTC] Found session: ${sid}`, 'info');
                currentSessionId = sid;
                startBroadcasterWithSession(sid);
            }
        }
    } catch (e) {
        // Ignore 404
    }
}

function startBroadcasterWithSession(sessionId) {
    if (!broadcasterWindow) {
        log('[WebRTC] No broadcaster window!', 'error');
        return;
    }

    const url = `file://${path.join(__dirname, 'broadcaster.html')}?sessionId=${sessionId}&token=${config.token}`;
    log(`[WebRTC] Loading broadcaster with session: ${sessionId}`, 'info');
    broadcasterWindow.loadURL(url);
    broadcasterWindow.show();
    broadcasterWindow.focus();
}

// ==========================================
// VNC SETUP
// ==========================================
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

async function enableRDP() {
    log('Enabling RDP...', 'info');
    const script = `
    Set-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name "fDenyTSConnections" -Value 0 -Force;
    Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue;
    `;
    await runPowershell(script);
}

async function setupVNC() {
    const binName = 'tvnserver.exe';
    let binPath = [
        path.join(__dirname, 'bin', binName),
        path.join(process.resourcesPath, 'bin', binName),
        path.join(__dirname, '..', '..', 'bin', binName)
    ].find(p => fs.existsSync(p));

    if (!binPath) {
        log('VNC Binary Missing', 'error');
        throw new Error('VNC Binary Missing');
    }

    exec('taskkill /F /IM tvnserver.exe /T', () => { });
    await new Promise(r => setTimeout(r, 1500));

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

    await runPowershell(`
    if (!(Get-NetFirewallRule -DisplayName "DeskShare-VNC" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName "DeskShare-VNC" -Direction Inbound -LocalPort 5900 -Protocol TCP -Action Allow -Profile Any;
    }
    `);

    log('Starting VNC...', 'info');
    vncProcess = spawn(binPath, ['-run'], { detached: true });
    log('VNC Started', 'success');
}

// ==========================================
// TUNNEL
// ==========================================
async function createTunnel(port) {
    if (cloudflaredProcess) cloudflaredProcess.kill();

    const binName = 'cloudflared.exe';
    let binPath = [
        path.join(process.resourcesPath, 'bin', binName),
        path.join(__dirname, 'bin', binName),
        path.join(USER_DATA_PATH, 'bin', binName)
    ].find(p => fs.existsSync(p));

    if (!binPath) {
        log('Downloading cloudflared...', 'info');
        binPath = path.join(USER_DATA_PATH, 'bin', binName);
        fs.mkdirSync(path.dirname(binPath), { recursive: true });
        const writer = fs.createWriteStream(binPath);
        const response = await axios({ method: 'get', url: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', responseType: 'stream' });
        response.data.pipe(writer);
        await new Promise(r => writer.on('finish', r));
    }

    log(`Starting tunnel on port ${port}...`, 'info');
    return new Promise((resolve, reject) => {
        cloudflaredProcess = spawn(binPath, ['tunnel', '--url', `tcp://localhost:${port}`]);
        let found = false;

        cloudflaredProcess.stderr.on('data', d => {
            const t = d.toString();
            const m = t.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (m && !found) { found = true; resolve(m[0]); }
        });

        cloudflaredProcess.stdout.on('data', d => {
            const t = d.toString();
            const m = t.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (m && !found) { found = true; resolve(m[0]); }
        });

        setTimeout(() => {
            if (!found) reject(new Error('Tunnel Timeout'));
        }, 45000);
    });
}

async function registerTunnel(url, method, pass) {
    await axios.post(`${BACKEND_URL}/api/tunnels/register`,
        { computerId: config.computerId, tunnelUrl: url, accessMethod: method, accessPassword: pass },
        { headers: { 'Authorization': `Bearer ${config.token}` } }
    );
}

async function sendHeartbeat() {
    try {
        await axios.post(`${BACKEND_URL}/api/tunnels/heartbeat`,
            { computerId: config.computerId },
            { headers: { 'Authorization': `Bearer ${config.token}` } }
        );
    } catch { }
}
