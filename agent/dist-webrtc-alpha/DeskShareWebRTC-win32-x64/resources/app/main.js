const { app, BrowserWindow, ipcMain, desktopCapturer, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const os = require('os');

// v25.1: RECONSTRUCTION SYNC
const LOG_FILE = path.join(os.tmpdir(), 'deskshare_debug.log');
function log(msg) { try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) { } }

log('=== v25.1 START ===');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let mainWindow = null, engineWindow = null, inputProcess = null;
let config = null, res = { w: 1920, h: 1080 };

function nodeRequest(method, pathStr, body) {
    return new Promise((resolve) => {
        try {
            if (!config) return resolve(null);
            const url = new URL("https://deskshare-backend-production.up.railway.app/api" + pathStr);
            const bodyData = body ? JSON.stringify(body) : null;
            const opts = {
                hostname: url.hostname, port: 443, path: url.pathname + url.search, method: method,
                headers: {
                    'Authorization': 'Bearer ' + config.token,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                    'Origin': 'https://deskshare-backend-production.up.railway.app'
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
ipcMain.on('engine-ready', (e) => { if (config) e.sender.send('init-engine', { config, res }); });
ipcMain.on('engine-state', (e, s) => { if (mainWindow) mainWindow.webContents.send('update-engine-ui', s); });

ipcMain.on('remote-input', (e, data) => {
    if (!inputProcess || !inputProcess.stdin.writable) return;
    let finalX = data.x, finalY = data.y;
    if (data.px !== undefined) { finalX = Math.round(data.px * res.w); finalY = Math.round(data.py * res.h); }
    let cmd = null;
    if (data.type === 'mousemove') cmd = `MOVE ${finalX} ${finalY}`;
    else if (data.type === 'mousedown') { try { inputProcess.stdin.write(`MOVE ${finalX} ${finalY}\n`); } catch (v) { } cmd = `CLICK ${data.button.toUpperCase()} DOWN`; }
    else if (data.type === 'mouseup') cmd = `CLICK ${data.button.toUpperCase()} UP`;
    else if (data.type === 'wheel') cmd = `SCROLL ${Math.round(data.deltaY * -1)}`;
    else if (data.type === 'keydown' || data.type === 'keyup') { if (data.vkCode) cmd = `KEY ${data.vkCode} ${data.type === 'keydown' ? 'DOWN' : 'UP'}`; }
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
});

function createMainWindow() {
    mainWindow = new BrowserWindow({ width: 500, height: 750, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false }, autoHideMenuBar: true, backgroundColor: '#050507', title: "DeskShare v25.1" });
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
