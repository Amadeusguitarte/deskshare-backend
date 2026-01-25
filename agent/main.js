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

// VNC Config
const VNC_PASS_HEX = "F0E43164F6C2E373"; // "12345678" (TightVNC DES)
const VNC_PASS_PLAIN = "12345678";

// ==========================================
// Logging
// ==========================================
function log(msg, type = 'info') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${msg}\n`;

    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (e) { }

    console.log(`[${type}] ${msg}`);

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

// === RustDesk P2P INTEGRATION ===
const RUSTDESK_VERSION = '1.3.7';
const RUSTDESK_DOWNLOAD_URL = `https://github.com/rustdesk/rustdesk/releases/download/${RUSTDESK_VERSION}/rustdesk-${RUSTDESK_VERSION}-x86_64.exe`;
let rustdeskProcess;

async function isRustDeskInstalled() {
    const possiblePaths = [
        'C:\\Program Files\\RustDesk\\rustdesk.exe',
        'C:\\Program Files (x86)\\RustDesk\\rustdesk.exe',
        path.join(process.env.LOCALAPPDATA || '', 'RustDesk', 'rustdesk.exe'),
        path.join(app.getPath('userData'), 'bin', 'rustdesk.exe')
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            log(`RustDesk found at: ${p}`, 'info');
            return p;
        }
    }
    return null;
}

async function downloadRustDesk() {
    const binPath = path.join(app.getPath('userData'), 'bin', 'rustdesk.exe');

    if (fs.existsSync(binPath)) {
        log('RustDesk already downloaded', 'info');
        return binPath;
    }

    log('Downloading RustDesk...', 'info');
    if (mainWindow) mainWindow.webContents.send('status-update', { status: 'DOWNLOADING', details: 'Downloading RustDesk P2P...' });

    fs.mkdirSync(path.dirname(binPath), { recursive: true });

    try {
        const response = await axios({ method: 'get', url: RUSTDESK_DOWNLOAD_URL, responseType: 'stream' });
        const writer = fs.createWriteStream(binPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                log('RustDesk downloaded successfully', 'success');
                resolve(binPath);
            });
            writer.on('error', reject);
        });
    } catch (e) {
        log(`RustDesk download failed: ${e.message}`, 'error');
        throw e;
    }
}

async function installRustDesk() {
    let rustdeskPath = await isRustDeskInstalled();

    if (rustdeskPath) {
        return rustdeskPath;
    }

    log('Installing RustDesk silently...', 'info');
    if (mainWindow) mainWindow.webContents.send('status-update', { status: 'INSTALLING', details: 'Installing RustDesk...' });

    const installerPath = await downloadRustDesk();

    return new Promise((resolve, reject) => {
        // Run silent install
        const child = spawn(installerPath, ['--silent-install'], {
            stdio: 'ignore',
            detached: true
        });

        child.on('close', async (code) => {
            log(`RustDesk installer exited with code: ${code}`, code === 0 ? 'success' : 'warning');

            // Wait a bit for installation to complete
            await new Promise(r => setTimeout(r, 3000));

            const installed = await isRustDeskInstalled();
            if (installed) {
                resolve(installed);
            } else {
                // Fallback: use portable version
                log('Using portable RustDesk', 'info');
                resolve(installerPath);
            }
        });

        child.on('error', (e) => {
            log(`RustDesk install error: ${e.message}`, 'error');
            reject(e);
        });
    });
}

async function getRustDeskId() {
    // RustDesk stores config at %APPDATA%\RustDesk\config\RustDesk.toml
    const configPath = path.join(process.env.APPDATA || '', 'RustDesk', 'config', 'RustDesk.toml');

    // Also check for ID file
    const idPath = path.join(process.env.APPDATA || '', 'RustDesk', 'config', 'RustDesk2.toml');

    for (const cp of [configPath, idPath]) {
        if (fs.existsSync(cp)) {
            try {
                const content = fs.readFileSync(cp, 'utf8');
                // Look for id = "XXXXXXXXX" pattern
                const match = content.match(/id\s*=\s*["']?(\d+)["']?/);
                if (match) {
                    log(`RustDesk ID found: ${match[1]}`, 'success');
                    return match[1];
                }
            } catch (e) {
                log(`Error reading RustDesk config: ${e.message}`, 'warning');
            }
        }
    }

    // Try running rustdesk --get-id
    return new Promise((resolve) => {
        exec('rustdesk --get-id', (err, stdout) => {
            if (!err && stdout.trim()) {
                log(`RustDesk ID from CLI: ${stdout.trim()}`, 'success');
                resolve(stdout.trim());
            } else {
                log('Could not get RustDesk ID', 'error');
                resolve(null);
            }
        });
    });
}

async function setRustDeskPassword(password) {
    return new Promise((resolve) => {
        exec(`rustdesk --password ${password}`, (err) => {
            if (!err) {
                log('RustDesk password set', 'success');
            }
            resolve(!err);
        });
    });
}

async function startRustDeskService(rustdeskPath) {
    log('Starting RustDesk service...', 'info');

    // Start RustDesk in service mode
    rustdeskProcess = spawn(rustdeskPath, ['--service'], {
        stdio: 'ignore',
        detached: true
    });

    rustdeskProcess.unref();

    // Wait for it to start
    await new Promise(r => setTimeout(r, 2000));

    return true;
}

async function registerRustDesk(rustdeskId, password) {
    log(`Registering RustDesk ID: ${rustdeskId}`, 'info');

    try {
        await axios.post(`${BACKEND_URL}/api/tunnels/rustdesk`, {
            computerId: config.computerId,
            rustdeskId: rustdeskId,
            rustdeskPassword: password
        }, {
            headers: { 'Authorization': `Bearer ${config.token}` }
        });

        log('RustDesk registered with backend', 'success');
        return true;
    } catch (e) {
        log(`RustDesk registration error: ${e.message}`, 'error');
        throw e;
    }
}

async function setupRustDesk() {
    try {
        // 1. Install RustDesk if not present
        const rustdeskPath = await installRustDesk();

        // 2. Start service
        await startRustDeskService(rustdeskPath);

        // 3. Get ID
        const rustdeskId = await getRustDeskId();
        if (!rustdeskId) {
            throw new Error('Could not get RustDesk ID');
        }

        // 4. Set password
        const password = Math.random().toString(36).substring(2, 10); // Random 8-char
        await setRustDeskPassword(password);

        // 5. Register with backend
        await registerRustDesk(rustdeskId, password);

        return { rustdeskId, password };
    } catch (e) {
        log(`RustDesk setup failed: ${e.message}`, 'error');
        throw e;
    }
}

// ==========================================
// MAIN AGENT START - Uses RustDesk FIRST
// ==========================================
async function startAgent() {
    loadConfig();

    if (!config.computerId || !config.token) {
        log('Waiting for configuration...', 'warning');
        if (mainWindow) mainWindow.webContents.send('status-update', { status: 'WAITING', details: 'Launch from website to configure' });
        return;
    }

    if (mainWindow) mainWindow.webContents.send('status-update', { status: 'STARTING', details: 'Initializing services...' });

    try {
        // === TRY RUSTDESK FIRST (P2P - LOW LATENCY) ===
        log('Setting up RustDesk P2P...', 'info');
        if (mainWindow) mainWindow.webContents.send('status-update', { status: 'CONFIGURING', details: 'Setting up RustDesk P2P...' });

        const { rustdeskId, password } = await setupRustDesk();

        // Start heartbeat
        if (global.heartbeatInt) clearInterval(global.heartbeatInt);
        global.heartbeatInt = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        log('Agent is FULLY ONLINE with RustDesk P2P!', 'success');
        if (mainWindow) mainWindow.webContents.send('status-update', {
            status: 'ONLINE',
            details: `ID: ${config.computerId} | RustDesk: ${rustdeskId} | Mode: P2P`
        });

    } catch (rustdeskError) {
        log(`RustDesk failed, falling back to VNC/Tunnel: ${rustdeskError.message}`, 'warning');

        // === FALLBACK: VNC + CLOUDFLARE TUNNEL ===
        await startAgentFallback();
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
