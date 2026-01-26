const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');
const axios = require('axios');

// Config
const APP_NAME = 'DeskShareLauncher';
const LOG_FILE = path.join(app.getPath('userData'), 'agent.log');
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// Default backend (prod)
const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app';
const HEARTBEAT_INTERVAL = 60000;

let mainWindow;
let cloudflaredProcess;
let vncProcess; // For VNC Server
let config = {};

// Safe send helper
function safeSend(win, channel, data) {
    try {
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, data);
        }
    } catch (e) {
        // Silently fail for UI updates if window is gone
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
// IPC HANDLERS
// ==========================================
ipcMain.on('open-url', (event, url) => {
    shell.openExternal(url);
});

ipcMain.on('open-data-folder', () => {
    const binPath = path.join(app.getPath('userData'), 'bin');
    if (!fs.existsSync(binPath)) fs.mkdirSync(binPath, { recursive: true });
    shell.openPath(binPath);
});

ipcMain.on('retry-vnc', () => {
    log('User requested retry...', 'info');
    setupVNC(); // Retry VNC setup
});


// ==========================================
// Protocol Handling
// ==========================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }

        const url = commandLine.find(arg => arg.startsWith('deskshare://'));
        if (url) {
            log(`New protocol request: ${url}`, 'info');
            handleProtocolUrl(url);
        }
    });

    app.whenReady().then(() => {
        createWindow();

        if (process.platform === 'win32') {
            const url = process.argv.find(arg => arg.startsWith('deskshare://'));
            if (url) handleProtocolUrl(url);
        }
    });
}

function handleProtocolUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        const params = new URLSearchParams(url.search);

        if (params.has('computerId')) config.computerId = params.get('computerId');
        if (params.has('token')) config.token = params.get('token');

        saveConfig();
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

function checkWindowsEdition() {
    return new Promise((resolve) => {
        exec('wmic os get Caption', (err, stdout) => {
            if (err) return resolve('Unknown');
            const data = stdout.toString().toLowerCase();
            if (data.includes('home')) resolve('Home');
            else resolve('Pro');
        });
    });
}

// === WebRTC P2P INTEGRATION (DUAL MODE) ===
let webrtcMode = null; // 'native' or 'browser'
let broadcasterWindow = null;

// Detect WebRTC capabilities
function detectWebRTCCapabilities() {
    const capabilities = {
        webrtcNative: false,
        webrtcBrowser: true // Always available (uses Chromium)
    };

    // Try to load native modules
    try {
        require('wrtc');
        require('robotjs');
        capabilities.webrtcNative = true;
        log('WebRTC Native mode available (ultra-fast)', 'success');
    } catch (e) {
        log('WebRTC Native not available (missing dependencies), using Browser mode', 'info');
    }

    return capabilities;
}

// Setup WebRTC (Browser-based mode)
async function setupWebRTCBrowser() {
    try {
        log('Starting WebRTC Browser mode...', 'info');

        // Create hidden browser window for broadcasting
        broadcasterWindow = new BrowserWindow({
            width: 400,
            height: 300,
            show: false, // Hidden by default
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            }
        });

        // Wait for session creation from backend
        // For now, we'll register capability and wait for viewer connection
        await registerWebRTCCapability('browser');

        log('WebRTC Browser broadcaster ready', 'success');
        webrtcMode = 'browser';
        return true;

    } catch (e) {
        log(`WebRTC Browser setup failed: ${e.message}`, 'error');
        throw e;
    }
}

// Setup WebRTC (Native mode)
async function setupWebRTCNative() {
    try {
        log('Starting WebRTC Native mode...', 'info');

        const webrtc = require('./webrtc-broadcaster');
        await webrtc.registerWebRTCCapability(config.computerId, config.token);

        log('WebRTC Native broadcaster ready (ultra-fast)', 'success');
        webrtcMode = 'native';
        return true;

    } catch (e) {
        log(`WebRTC Native setup failed: ${e.message}`, 'error');
        throw e;
    }
}

// Start broadcaster window when session is created
async function startBroadcasterWindow(sessionId) {
    if (!broadcasterWindow) return;

    const broadcasterUrl = `file://${path.join(__dirname, 'broadcaster.html')}?sessionId=${sessionId}&token=${config.token}`;

    log(`Loading broadcaster: ${broadcasterUrl}`, 'info');
    broadcasterWindow.loadURL(broadcasterUrl);

    // Show window for debugging (optional)
    // broadcasterWindow.show();
}

// Register WebRTC capability
async function registerWebRTCCapability(mode) {
    try {
        await axios.post(`${BACKEND_URL}/api/webrtc/register`, {
            computerId: config.computerId,
            mode: mode // 'native' or 'browser'
        }, {
            headers: { 'Authorization': `Bearer ${config.token}` }
        });

        log(`WebRTC capability registered (${mode})`, 'success');
        return true;
    } catch (e) {
        log(`WebRTC registration failed: ${e.message}`, 'error');
        return false;
    }
}

// Main WebRTC setup (tries native first, falls back to browser)
async function setupWebRTC() {
    const capabilities = detectWebRTCCapabilities();

    try {
        if (capabilities.webrtcNative) {
            // Try native mode first (fastest)
            await setupWebRTCNative();
        } else {
            // Fallback to browser mode (always works)
            await setupWebRTCBrowser();
        }

        return true;
    } catch (e) {
        log(`WebRTC setup failed: ${e.message}`, 'error');
        throw e;
    }
}

// Listen for session creation requests from backend
ipcMain.on('start-webrtc-session', async (event, sessionId) => {
    log(`Starting WebRTC session: ${sessionId}`, 'info');

    if (webrtcMode === 'browser') {
        await startBroadcasterWindow(sessionId);
    } else if (webrtcMode === 'native') {
        const webrtc = require('./webrtc-broadcaster');
        await webrtc.startBroadcasting(sessionId, config.token);
    }
});

// ==========================================
// MAIN AGENT START - Uses WebRTC FIRST
// ==========================================
async function startAgent() {
    loadConfig();

    if (!config.computerId || !config.token) {
        log('Waiting for configuration...', 'warning');
        safeSend(mainWindow, 'status-update', { status: 'WAITING', details: 'Launch from website to configure' });
        return;
    }

    safeSend(mainWindow, 'status-update', { status: 'STARTING', details: 'Initializing services...' });

    // 1. Setup WebRTC (P2P)
    try {
        log('Setting up WebRTC P2P...', 'info');
        safeSend(mainWindow, 'status-update', { status: 'CONFIGURING', details: 'Setting up WebRTC P2P...' });
        await setupWebRTC();

        safeSend(mainWindow, 'status-update', {
            status: 'ONLINE',
            details: `ID: ${config.computerId} | WebRTC: READY`
        });
    } catch (webrtcError) {
        log(`WebRTC setup warning: ${webrtcError.message}`, 'warning');
    }

    // 2. Setup VNC/Tunnel (Guacamole/Standard) - ALWAYS RUN THIS
    log('Starting Standard Connection (VNC/Tunnel)...', 'info');
    safeSend(mainWindow, 'status-update', { status: 'CONFIGURING', details: 'Starting VNC & Tunnel...' });

    try {
        await startAgentFallback();
    } catch (e) {
        log(`Standard connection failed: ${e.message}`, 'error');
    }
}

// Fallback to original VNC/RDP + Cloudflare tunnel
async function startAgentFallback() {
    const edition = await checkWindowsEdition();
    log(`Detected Windows Edition: ${edition}`, 'info');

    let accessMethod = 'rdp';
    let targetPort = 3389;
    let password = null;

    if (edition === 'Home') {
        accessMethod = 'vnc';
        targetPort = 5900;
        password = VNC_PASS_PLAIN;
        await setupVNC();
    } else {
        await enableRDP();
    }

    try {
        const url = await createTunnel(targetPort);
        await registerTunnel(url, accessMethod, password);

        if (global.heartbeatInt) clearInterval(global.heartbeatInt);
        global.heartbeatInt = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        log('Agent is FULLY ONLINE (Fallback Mode)', 'success');
        if (mainWindow) mainWindow.webContents.send('status-update', {
            status: 'ONLINE',
            details: `ID: ${config.computerId} | Mode: ${accessMethod.toUpperCase()} (Higher Latency)`
        });
    } catch (e) {
        log(e.message, 'error');
        if (mainWindow) mainWindow.webContents.send('status-update', { status: 'ERROR', details: e.message });
    }
}

// === RDP LOGIC (For Pro) ===
async function enableRDP() {
    log('Configuring Windows for RDP...', 'info');
    if (mainWindow) mainWindow.webContents.send('status-update', { status: 'CONFIGURING', details: 'Checking RDP Settings...' });

    return new Promise((resolve, reject) => {
        const scriptPath = path.join(app.getPath('temp'), 'deskshare_rdp.ps1');
        const scriptContent = `
            # Force Enable RDP
            Set-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name "fDenyTSConnections" -Value 0 -Force;
            $w = "HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp";
            if (Test-Path $w) { Set-ItemProperty -Path $w -Name "UserAuthentication" -Value 0 -Force; }
            Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue;
            if (!(Get-NetFirewallRule -DisplayName "DeskShare-RDP" -ErrorAction SilentlyContinue)) {
                New-NetFirewallRule -DisplayName "DeskShare-RDP" -Direction Inbound -LocalPort 3389 -Protocol TCP -Action Allow -Profile Any;
            }
            Set-Service "TermService" -StartupType Automatic;
            Start-Service "TermService";
        `;

        try { fs.writeFileSync(scriptPath, scriptContent); } catch (e) { return resolve(); }

        const psCommand = `Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File '${scriptPath}'" -Verb RunAs -WindowStyle Hidden -Wait`;
        const child = spawn('powershell', ['-Command', psCommand]);

        child.on('close', () => {
            log('RDP Config Cycle Finished', 'success');
            try { fs.unlinkSync(scriptPath); } catch (e) { }
            resolve();
        });
    });
}

// === VNC LOGIC (For Home) - BUNDLED + REGISTRY INJECTION ===
async function setupVNC() {
    log('Windows Home Detected - Starting Bundled VNC...', 'info');
    if (mainWindow) mainWindow.webContents.send('status-update', { status: 'INSTALLING_ENGINE', details: 'Configuring VNC...' });

    // Look for bundled binary
    let potentialPaths = [
        path.join(__dirname, 'bin', 'tvnserver.exe'), // Dev
        path.join(process.resourcesPath, 'bin', 'tvnserver.exe'), // Prod
        path.join(app.getAppPath(), '..', 'bin', 'tvnserver.exe') // Fallback
    ];

    let binPath = potentialPaths.find(p => fs.existsSync(p));

    if (!binPath) {
        log('CRITICAL: Bundled VNC Binary NOT FOUND!', 'error');
        if (mainWindow) mainWindow.webContents.send('status-update', {
            status: 'MANUAL_ACTION_REQUIRED',
            details: 'Missing VNC Engine (Bin Not Found)',
            url: 'https://www.tightvnc.com/download.php'
        });
        return false;
    }

    log(`Found VNC at: ${binPath}`, 'success');

    // Kill existing VNC
    exec('taskkill /F /IM tvnserver.exe /T', () => { });

    // --- REGISTRY INJECTION (Zero Config Password) ---
    log('Injecting VNC Config (Zero Config)...', 'info');
    await injectVNCRegistry();

    await openVNCFirewall();

    try {
        log('Spawning VNC process...', 'info');

        // Spawn with -run ONLY (silent not supported with -run)
        // Now that Registry has the password, it should listen immediately.
        vncProcess = spawn(binPath, ['-run'], { detached: true });

        vncProcess.on('exit', (code) => {
            log(`VNC Process Exited with code: ${code}`, 'warning');
        });

        log('VNC Engine Spawned (Background)', 'success');
        return true;
    } catch (e) {
        log(`Failed to start VNC: ${e.message}`, 'error');
        return false;
    }
}

async function injectVNCRegistry() {
    return new Promise((resolve) => {
        // TightVNC Server stores password in HKCU\Software\TightVNC\Server
        // Pass: "12345678" -> HEX: F0E43164F6C2E373

        const scriptPath = path.join(app.getPath('temp'), 'deskshare_vnc_reg.ps1');
        // We use PowerShell to write binary registry value
        const scriptContent = `
            $path = "HKCU:\\Software\\TightVNC\\Server";
            if (!(Test-Path $path)) { New-Item -Path $path -Force; }
            
            # Password "12345678"
            $hex = "F0,E4,31,64,F6,C2,E3,73";
            $bytes = $hex.Split(',') | ForEach-Object { [byte]('0x' + $_) };
            
            Set-ItemProperty -Path $path -Name "Password" -Value $bytes -Type Binary -Force;
            Set-ItemProperty -Path $path -Name "PasswordViewOnly" -Value $bytes -Type Binary -Force;
            Set-ItemProperty -Path $path -Name "UseVncAuthentication" -Value 1 -Type DWord -Force;
            Set-ItemProperty -Path $path -Name "AllowLoopback" -Value 1 -Type DWord -Force;
            Set-ItemProperty -Path $path -Name "AcceptHttpConnections" -Value 0 -Type DWord -Force;
            Set-ItemProperty -Path $path -Name "RfbPort" -Value 5900 -Type DWord -Force;
        `;

        try { fs.writeFileSync(scriptPath, scriptContent); } catch (e) { return resolve(); }

        // Run as User (HKCU) - No Elevate needed for HKCU!
        const child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath]);

        child.on('close', () => {
            log('VNC Registry Injection Completed', 'success');
            try { fs.unlinkSync(scriptPath); } catch (e) { }
            resolve();
        });
    });
}


async function openVNCFirewall() {
    return new Promise((resolve) => {
        const scriptPath = path.join(app.getPath('temp'), 'deskshare_vnc_fw.ps1');
        const scriptContent = `
            if (!(Get-NetFirewallRule -DisplayName "DeskShare-VNC" -ErrorAction SilentlyContinue)) {
                New-NetFirewallRule -DisplayName "DeskShare-VNC" -Direction Inbound -LocalPort 5900 -Protocol TCP -Action Allow -Profile Any;
            }
        `;
        try { fs.writeFileSync(scriptPath, scriptContent); } catch (e) { return resolve(); }
        const psCommand = `Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File '${scriptPath}'" -Verb RunAs -WindowStyle Hidden -Wait`;
        const child = spawn('powershell', ['-Command', psCommand]);
        child.on('close', () => {
            try { fs.unlinkSync(scriptPath); } catch (e) { }
            resolve();
        });
    });
}


async function downloadCloudflared() {
    const binName = 'cloudflared.exe';

    let bundled = [
        path.join(process.resourcesPath, 'bin', binName),
        path.join(__dirname, 'bin', binName)
    ].find(p => fs.existsSync(p));

    if (bundled) return bundled;

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

async function createTunnel(port = 3389) {
    if (cloudflaredProcess) cloudflaredProcess.kill();

    const binPath = await downloadCloudflared();
    log(`Starting tunnel on port ${port}...`, 'info');

    return new Promise((resolve, reject) => {
        cloudflaredProcess = spawn(binPath, ['tunnel', '--url', `tcp://localhost:${port}`]);

        let foundUrl = false;

        cloudflaredProcess.stderr.on('data', (data) => {
            const text = data.toString();
            if (text.length < 500) log(`[TUNNEL] ${text.trim()}`, 'debug');

            if (text.includes('trycloudflare.com')) {
                const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                if (match) {
                    foundUrl = true;
                    log(`Tunnel URL: ${match[0]}`, 'success');
                    resolve(match[0]);
                }
            }
        });

        setTimeout(() => {
            if (!foundUrl) reject(new Error('Tunnel timeout'));
        }, 15000);
    });
}

async function registerTunnel(url, accessMethod = 'rdp', password = null) {
    log(`Registering (${accessMethod}) with backend...`, 'info');
    const payload = {
        computerId: config.computerId,
        tunnelUrl: url,
        accessMethod: accessMethod,
        accessPassword: password // Send injected password
    };

    try {
        await axios.post(`${BACKEND_URL}/api/tunnels/register`,
            payload,
            { headers: { 'Authorization': `Bearer ${config.token}` } }
        );
        log('Registration confirmed', 'success');
        return true;
    } catch (e) {
        let errorMsg = e.message;
        if (e.response) {
            errorMsg = `Status: ${e.response.status} | Data: ${JSON.stringify(e.response.data)}`;
        }
        log(`Registration Error: ${errorMsg}`, 'error');
        throw new Error(errorMsg);
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
    if (cloudflaredProcess) cloudflaredProcess.kill();
    // Don't kill VNC strictly? Actually yes we should.
    if (vncProcess) vncProcess.kill();
    app.quit();
});
