const { app, BrowserWindow, ipcMain, desktopCapturer, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const os = require('os');

// v29: GOLD-IMMORTAL (CLEAN DIRECTORY RESTORATION)
// Path: D:\Downloads\DeskShare\DeskShare-GOLD-IMMORTAL
const LOG_FILE = path.join(os.tmpdir(), 'deskshare_immortal.log');
function log(msg) { try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) { } }

log('=== v29 GOLD-IMMORTAL START ===');

// 1. PROTOCOL REGISTRATION (Crucial for web sync)
if (process.defaultApp) {
    if (process.argv.length >= 2) { app.setAsDefaultProtocolClient('deskshare', process.execPath, [path.resolve(process.argv[1])]); }
} else { app.setAsDefaultProtocolClient('deskshare'); }

// 2. SINGLETON LOCK
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { log('Multiple instances blocked.'); app.quit(); process.exit(0); }

app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
    const url = commandLine.find(arg => arg.startsWith('deskshare:'));
    if (url) handleDeepLink(url);
});

function handleDeepLink(url) {
    if (!url || typeof url !== 'string') return;
    try {
        let cleanUrl = url.replace(/^deskshare:(\/\/)?/, '');
        if (cleanUrl.startsWith('/')) cleanUrl = cleanUrl.substring(1);
        const params = new URL('http://localhost/' + cleanUrl);
        const token = params.searchParams.get('token');
        const computerId = params.searchParams.get('computerId');
        if (token && computerId) {
            config = { token, computerId };
            saveConfig();
            log(`Synced via Link: ID ${computerId}`);
            if (mainWindow) mainWindow.webContents.send('init-config', { config, res });
            if (engineWindow) engineWindow.webContents.send('init-engine', { config, res });
        }
    } catch (e) { log(`Link Error: ${e.message}`); }
}

let mainWindow = null, engineWindow = null, inputProcess = null;
let config = null, res = { w: 1920, h: 1080 };

function saveConfig() {
    try {
        const APPDATA = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const dir = path.join(APPDATA, 'deskshare-launcher');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));
    } catch (e) { log(`Save Fail: ${e.message}`); }
}

function nodeRequest(method, pathStr, body) {
    return new Promise((resolve) => {
        try {
            if (!config) return resolve(null);
            const url = new URL("https://deskshare-backend-production.up.railway.app/api" + pathStr);
            const bodyData = body ? JSON.stringify(body) : null;
            const opts = {
                hostname: url.hostname, port: 443, path: url.pathname + url.search, method: method,
                headers: {
                    'Authorization': 'Bearer ' + config.token, 'Content-Type': 'application/json',
                    'User-Agent': 'DeskShare-GOLD-IMMORTAL'
                }
            };
            if (bodyData) opts.headers['Content-Length'] = Buffer.byteLength(bodyData);
            const req = https.request(opts, (rs) => {
                let d = '';
                rs.on('data', (c) => d += c);
                rs.on('end', () => {
                    if (rs.statusCode >= 200 && rs.statusCode < 300) { try { resolve(JSON.parse(d)); } catch (e) { resolve({}); } }
                    else resolve(null);
                });
            });
            req.on('error', () => resolve(null));
            if (bodyData) req.write(bodyData);
            req.end();
        } catch (e) { resolve(null); }
    });
}

ipcMain.handle('api-request', async (e, d) => await nodeRequest(d.method, d.endpoint, d.body));
ipcMain.handle('get-sources', async () => await desktopCapturer.getSources({ types: ['screen'] }));

ipcMain.on('renderer-ready', (e) => { if (config) e.reply('init-config', { config, res }); });
ipcMain.on('engine-ready', (e) => { if (config) e.reply('init-engine', { config, res }); });
ipcMain.on('engine-state', (e, s) => { if (mainWindow) mainWindow.webContents.send('update-engine-ui', s); });

// PROVEN INPUT MAPPING (Restored from GOLD v5.0)
ipcMain.on('remote-input', (e, data) => {
    if (!inputProcess || !inputProcess.stdin.writable) return;
    const scale = screen.getPrimaryDisplay().scaleFactor || 1;
    let cmd = null;
    if (data.type === 'mousemove') {
        cmd = `MOVE ${Math.round(data.x * scale)} ${Math.round(data.y * scale)}`;
    } else if (data.type === 'mousedown') {
        const x = Math.round(data.x * scale), y = Math.round(data.y * scale);
        if (x !== -1) inputProcess.stdin.write(`MOVE ${x} ${y}\n`);
        cmd = `CLICK ${data.button.toUpperCase()} DOWN`;
    } else if (data.type === 'mouseup') {
        cmd = `CLICK ${data.button.toUpperCase()} UP`;
    } else if (data.type === 'wheel') {
        cmd = `SCROLL ${Math.round(data.deltaY * -1)}`;
    } else if (data.type === 'keydown' || data.type === 'keyup') {
        if (data.vkCode) cmd = `KEY ${data.vkCode} ${data.type === 'keydown' ? 'DOWN' : 'UP'}`;
    }
    if (cmd) try { inputProcess.stdin.write(cmd + "\n"); } catch (v) { }
});

function startController() {
    try {
        const sc = path.join(__dirname, 'input_controller.ps1');
        inputProcess = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', sc]);
    } catch (e) { }
}

function loadData() {
    try {
        const APPDATA = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const cp = path.join(APPDATA, 'deskshare-launcher', 'config.json');
        if (fs.existsSync(cp)) config = JSON.parse(fs.readFileSync(cp, 'utf8'));
        const p = screen.getPrimaryDisplay();
        res = { w: p.size.width, h: p.size.height };
    } catch (e) { }
}

app.whenReady().then(() => {
    loadData();
    startController();
    powerSaveBlocker.start('prevent-app-suspension');
    createMainWindow();
    createEngineWindow();
    const l = process.argv.find(a => a.startsWith('deskshare:'));
    if (l) handleDeepLink(l);
});

function createMainWindow() {
    mainWindow = new BrowserWindow({ width: 500, height: 750, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false }, autoHideMenuBar: true, backgroundColor: '#050507', title: "💎 DeskShare GOLD IMMORTAL 💎" });
    const ui = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
    mainWindow.loadURL(`data:text/html;base64,${Buffer.from(ui).toString('base64')}`);
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { app.quit(); });
}

function createEngineWindow() {
    engineWindow = new BrowserWindow({ width: 100, height: 100, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
    engineWindow.loadFile(path.join(__dirname, 'engine.html'));
}

app.on('will-quit', () => { if (inputProcess) spawn('taskkill', ['/F', '/T', '/PID', inputProcess.pid]); });
