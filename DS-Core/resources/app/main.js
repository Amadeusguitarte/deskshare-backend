const { app, BrowserWindow, ipcMain, desktopCapturer, screen, powerSaveBlocker, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const { spawn } = require('child_process');

// === DS-CORE: MAIN PROCESS ===
let uiWin = null, engineWin = null;
let config = null;

// 1. PROTOCOL & SINGLETON
app.setAsDefaultProtocolClient('deskshare');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

app.on('second-instance', (e, argv) => {
    // Someone clicked the link while we were already running
    handleProtocol(argv);
});

// 2. CONFIG LOAD/SAVE
const APPDATA = path.join(process.env.APPDATA, 'deskshare-core');
if (!fs.existsSync(APPDATA)) fs.mkdirSync(APPDATA, { recursive: true });
const CONFIG_FILE = path.join(APPDATA, 'config.json');

function loadConfig() {
    try { if (fs.existsSync(CONFIG_FILE)) config = JSON.parse(fs.readFileSync(CONFIG_FILE)); } catch (e) { }
}
function saveConfig() {
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch (e) { }
}

// 3. PROTOCOL HANDLER (The "Wake Up" Logic)
function handleProtocol(argv) {
    const prefix = 'deskshare://';
    const urlStr = argv.find(arg => arg.startsWith(prefix));
    if (urlStr) {
        try {
            const url = new URL(urlStr);
            const params = new URLSearchParams(url.search);
            const token = params.get('token') || (url.pathname.includes('login') ? params.get('token') : null);
            const cid = params.get('computerId');

            if (token && cid) {
                config = { token, computerId: cid };
                saveConfig();
                console.log("[CORE] Token Updated via Link.");
                // Boot Engine if ready
                if (engineWin) engineWin.webContents.send('start-engine', { config, res: getRes() });
                if (uiWin) uiWin.focus();
            }
        } catch (e) { console.error("Protocol Parse Error", e); }
    }
}

function getRes() {
    const p = screen.getPrimaryDisplay();
    return { w: p.size.width, h: p.size.height };
}

// 4. WINDOWS
app.whenReady().then(() => {
    loadConfig();

    // Check args on fresh start
    handleProtocol(process.argv);

    createUI();
    createEngine();
});

function createUI() {
    uiWin = new BrowserWindow({
        width: 360, height: 480, frame: false, transparent: true, resizable: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        title: "DS-CORE", icon: path.join(__dirname, 'icon.ico')
    });
    uiWin.loadFile(path.join(__dirname, 'ui.html'));

    // Allow dragging
    ipcMain.on('app-quit', () => app.quit());
}

function createEngine() {
    engineWin = new BrowserWindow({
        width: 100, height: 100, show: true, // Visible for Permissions, but small/hidden effectively
        webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
        title: "DS-Engine"
    });
    engineWin.loadFile(path.join(__dirname, 'engine.html'));
    // Minimize engine to keep taskbar icon but hide window content if desired, 
    // but better to keep it effectively invisible or behind UI. 
    // For now, let's just minimize it.
    engineWin.minimize();
}

// 5. IPC ROUTING
ipcMain.on('engine-ready', (e) => {
    if (config) e.reply('start-engine', { config, res: getRes() });
});

ipcMain.on('update-ui', (e, data) => {
    if (uiWin) uiWin.webContents.send('ui-state', data);
});

ipcMain.on('log', (e, msg) => console.log(msg));

// API PROXY
ipcMain.handle('api-request', async (e, d) => {
    return new Promise(resolve => {
        if (!config) return resolve(null);
        const url = new URL("https://deskshare-backend-production.up.railway.app/api" + d.endpoint);
        const body = d.body ? JSON.stringify(d.body) : null;
        const req = https.request({
            hostname: url.hostname, path: url.pathname + url.search, method: d.method,
            headers: { 'Authorization': 'Bearer ' + config.token, 'Content-Type': 'application/json' }
        }, (res) => {
            let data = ''; res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({}); } });
        });
        req.on('error', () => resolve(null));
        if (body) req.write(body);
        req.end();
    });
});

ipcMain.handle('get-sources', async () => await desktopCapturer.getSources({ types: ['screen'] }));

// INPUT (Placeholder: Requires native implementation or copy of controller)
ipcMain.on('input-event', (e, d) => {
    // To be implemented: Zero-Base Input
});
