const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

// === AGENT V1 (ZERO BASE) ===
// No legacy dependencies. Pure Electron.

let guiWin = null;
let engineWin = null;
let config = { token: null, computerId: null };

// 1. DATA PERSISTENCE
const CONFIG_PATH = path.join(app.getPath('userData'), 'deskshare_v1_config.json');

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) config = JSON.parse(fs.readFileSync(CONFIG_PATH));
    } catch (e) { }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config));
}

// 2. PROTOCOL LOCK
if (process.defaultApp) {
    if (process.argv.length >= 2) app.setAsDefaultProtocolClient('deskshare', process.execPath, [path.resolve(process.argv[1])]);
} else {
    app.setAsDefaultProtocolClient('deskshare');
}

if (!app.requestSingleInstanceLock()) { app.quit(); }

app.on('second-instance', (e, argv) => {
    handleLink(argv);
    if (guiWin && !guiWin.isDestroyed()) {
        if (guiWin.isMinimized()) guiWin.restore();
        guiWin.focus();
    } else {
        createWindows(); // Re-create if closed
    }
});

// 3. LINK HANDLER
function handleLink(argv) {
    const link = argv.find(arg => arg.startsWith('deskshare://'));
    if (link) {
        try {
            const url = new URL(link);
            const t = url.searchParams.get('token');
            const c = url.searchParams.get('computerId');
            const n = url.searchParams.get('userName');

            if (t && c) {
                config = { token: t, computerId: c, userName: n || 'Usuario' };
                saveConfig();
                if (engineWin && !engineWin.isDestroyed()) engineWin.webContents.send('init-engine', config);
                if (guiWin && !guiWin.isDestroyed()) guiWin.webContents.send('ui-state', { mode: 'linking', userName: config.userName });
            }
        } catch (e) { }
    }
}

// 4. WINDOWS
function createWindows() {
    const iconPath = path.join(__dirname, '../icon.png');

    // GUI (Fixed Transparency & Shadow)
    guiWin = new BrowserWindow({
        width: 440, height: 640, // Oversized buffer
        frame: false,
        transparent: true,
        resizable: false,
        hasShadow: false, // Important to avoid square artifact
        alwaysOnTop: true,
        backgroundColor: '#00000000', // HEX Alpha Zero
        icon: fs.existsSync(iconPath) ? iconPath : null,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    guiWin.loadFile(path.join(__dirname, 'gui.html'));
    guiWin.setIgnoreMouseEvents(false); // Ensure clickable

    // ENGINE (Background Worker)
    engineWin = new BrowserWindow({
        width: 100, height: 100, show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
    });
    engineWin.loadFile(path.join(__dirname, 'webrtc.html'));
}

app.whenReady().then(() => {
    loadConfig();
    createWindows();
    handleLink(process.argv);

    // Allow dragging
    ipcMain.on('app-quit', () => app.quit());
    ipcMain.on('app-minimize', () => { if (guiWin) guiWin.minimize(); });

    // REAL ACTIONS (Native PowerShell Bridge - Zero Dependency)
    const { exec } = require('child_process');
    ipcMain.on('engine-action', (e, data) => {
        if (data.type === 'mousemove') {
            const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = '${data.x},${data.y}'`;
            exec(`powershell -Command "${cmd}"`);
        }
        if (data.type === 'mousedown') {
            const btn = data.button === 'right' ? '0x0008 | 0x0010' : '0x0002 | 0x0004'; // Down|Up pairs for simple click
            const cmd = `Add-Type -TypeDefinition '[DllImport("user32.dll")] public class Mouse { [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int x, int y, uint data, int extra); }'; [Mouse]::mouse_event(${btn}, 0, 0, 0, 0)`;
            exec(`powershell -Command "${cmd}"`);
        }
    });
});

// 5. IPC BUS
ipcMain.on('gui-ready', () => {
    if (config.token && config.computerId) {
        guiWin.webContents.send('ui-state', 'online');
        engineWin.webContents.send('init-engine', config);
    } else {
        guiWin.webContents.send('ui-state', 'waiting');
    }
});

ipcMain.on('engine-log', (e, msg) => console.log(msg));

ipcMain.on('engine-status', (e, status) => {
    if (guiWin) guiWin.webContents.send('ui-state', status);
});

// API PROXY
ipcMain.handle('api', (e, req) => {
    return new Promise(resolve => {
        if (!config.token) return resolve(null);
        const opts = {
            hostname: 'deskshare-backend-production.up.railway.app',
            path: '/api' + req.path,
            method: req.method,
            headers: { 'Authorization': 'Bearer ' + config.token, 'Content-Type': 'application/json' }
        };
        const r = https.request(opts, (res) => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({}); } });
        });
        r.on('error', () => resolve(null));
        if (req.body) r.write(JSON.stringify(req.body));
        r.end();
    });
});

ipcMain.handle('sources', async () => await desktopCapturer.getSources({ types: ['screen'] }));
