const { app, BrowserWindow, ipcMain, desktopCapturer, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

// v30: REBORN (ULTRA-MINIMALIST RESET)
// Focusing on visibility and connection above all else.
function logToFile(msg) {
    try {
        const lp = path.join(os.tmpdir(), 'deskshare_reborn.log');
        fs.appendFileSync(lp, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) { }
}

let mainWindow = null, inputProcess = null;
let config = null, res = { w: 1920, h: 1080 };

// 1. PROTOCOL
app.setAsDefaultProtocolClient('deskshare');

// 2. SINGLETON
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.on('second-instance', (e, cmd) => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        const url = cmd.find(a => a.startsWith('deskshare:'));
        if (url) mainWindow.webContents.send('sync-link', url);
    }
});

function loadConfig() {
    try {
        const APPDATA = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const cp = path.join(APPDATA, 'deskshare-launcher', 'config.json');
        if (fs.existsSync(cp)) {
            config = JSON.parse(fs.readFileSync(cp, 'utf8'));
            logToFile(`Config loaded: ID ${config.computerId}`);
        } else {
            logToFile(`Config NOT FOUND at ${cp}`);
        }
        const p = screen.getPrimaryDisplay();
        res = { w: p.size.width, h: p.size.height };
    } catch (e) { logToFile(`LoadConfig Error: ${e.message}`); }
}

function startController() {
    try {
        const sc = path.join(__dirname, 'input_controller.ps1');
        inputProcess = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', sc]);
    } catch (e) { }
}

app.whenReady().then(() => {
    loadConfig();
    startController();
    powerSaveBlocker.start('prevent-app-suspension');

    mainWindow = new BrowserWindow({
        width: 600, height: 850,
        backgroundColor: '#050507',
        title: "DeskShare REBORN v30.0",
        webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
    });

    mainWindow.loadFile(path.join(__dirname, 'ui.html'));
});

ipcMain.on('ui-ready', (e) => {
    if (config) e.reply('init', { config, res });
});

ipcMain.handle('get-sources', async () => {
    return await desktopCapturer.getSources({ types: ['screen'] });
});

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

app.on('will-quit', () => { if (inputProcess) spawn('taskkill', ['/F', '/T', '/PID', inputProcess.pid]); });
