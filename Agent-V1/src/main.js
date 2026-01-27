const { app, BrowserWindow, ipcMain, desktopCapturer, shell, screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// v80: PRODUCTION SYNC (Percentage Mapping + Axios Gold)
app.disableHardwareAcceleration();

let win, inputProcess;
let config = null;

const CONFIG_PATH = path.join(app.getPath('userData'), 'deskshare_v1_config.json');
const BACKEND_API = 'https://deskshare-backend-production.up.railway.app/api';

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            if (config.computerId) config.computerId = parseInt(config.computerId);
        }
    } catch (e) { }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config));
}

function startInputController() {
    const psPath = path.join(__dirname, 'input_controller.ps1');
    inputProcess = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', psPath]);
}

function sendToController(cmd) {
    if (inputProcess && inputProcess.stdin.writable) {
        inputProcess.stdin.write(cmd + "\n");
    }
}

// PROTOCOL
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', (e, argv) => {
    handleLink(argv);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

function handleLink(argv) {
    const link = argv.find(arg => arg.startsWith('deskshare://'));
    if (link) {
        try {
            const url = new URL(link);
            const t = url.searchParams.get('token');
            const c = url.searchParams.get('computerId');
            const n = url.searchParams.get('userName');
            if (t && c) {
                config = { token: t, computerId: parseInt(c), userName: n || 'Host' };
                saveConfig();
                if (win && !win.isDestroyed()) win.webContents.send('init-config', config);
            }
        } catch (e) { }
    }
}

function createWindow() {
    const iconPath = path.join(__dirname, '../icon.png');
    win = new BrowserWindow({
        width: 320, height: 440,
        frame: false, transparent: true, resizable: false,
        hasShadow: false, alwaysOnTop: true,
        backgroundColor: '#00000000',
        icon: fs.existsSync(iconPath) ? iconPath : null,
        webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
    });
    win.loadFile(path.join(__dirname, 'agent.html'));
}

app.whenReady().then(() => {
    loadConfig();
    startInputController();
    createWindow();
    handleLink(process.argv);

    ipcMain.on('app-quit', () => app.quit());
    ipcMain.on('app-minimize', () => { if (win) win.minimize(); });

    ipcMain.on('renderer-ready', (e) => {
        if (config && config.token) e.reply('init-config', config);
    });

    // PRECISION MOUSE BRIDGE (Matches Production v17.9)
    ipcMain.on('engine-action', (e, data) => {
        try {
            const primary = screen.getPrimaryDisplay();
            const scale = primary.scaleFactor || 1;

            if (data.type === 'mousemove' && data.px !== undefined) {
                const x = Math.round(data.px * primary.size.width * scale);
                const y = Math.round(data.py * primary.size.height * scale);
                sendToController(`MOVE ${x} ${y}`);
            }
            if (data.type === 'mousedown') sendToController(`CLICK ${data.button.toUpperCase()} DOWN`);
            if (data.type === 'mouseup') sendToController(`CLICK ${data.button.toUpperCase()} UP`);
            if (data.type === 'keydown') sendToController(`KEY ${data.vkCode} DOWN`);
            if (data.type === 'keyup') sendToController(`KEY ${data.vkCode} UP`);
            if (data.type === 'wheel') sendToController(`SCROLL ${Math.round(data.deltaY * -1)}`);
        } catch (err) { }
    });
});

// AXIOS PROXY (Production Standard)
ipcMain.handle('api', async (e, req) => {
    try {
        if (!config || !config.token) return null;
        const response = await axios({
            method: req.method,
            url: BACKEND_API + req.path,
            data: req.body,
            headers: { 'Authorization': 'Bearer ' + config.token }
        });
        return response.data;
    } catch (err) {
        return { error: true, status: err.response ? err.response.status : 500 };
    }
});

ipcMain.handle('get-sources', async () => await desktopCapturer.getSources({ types: ['screen'] }));

app.on('window-all-closed', () => {
    if (inputProcess) inputProcess.kill();
    app.quit();
});
