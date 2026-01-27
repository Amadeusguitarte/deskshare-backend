const { app, BrowserWindow, ipcMain, desktopCapturer, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');

// v17.9: HIGH-FIDELITY RESTORATION (The Definite Fix)
let mainWindow = null;
let engineWindow = null;
let config = {};
let inputProcess = null;
let activeSessionId = null;
let blockerId = null;

// Global Resolution (Fixes line 32 crash by moving access out of IPC)
let hostWidth = 1920;
let hostHeight = 1080;

// ========================================
// 1. HARDENED IPC LAYER
// ========================================
function safeSend(win, channel, data) {
    try {
        if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
            win.webContents.send(channel, data);
        }
    } catch (e) { }
}

ipcMain.on('renderer-ready', (event) => {
    try {
        const APPDATA = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const configPath = path.join(APPDATA, 'deskshare-launcher', 'config.json');
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const data = { config, res: { w: hostWidth, h: hostHeight } };

            if (event && event.sender && !event.sender.isDestroyed()) {
                event.reply('init-config', data);
            }
            safeSend(engineWindow, 'init-engine', data);
        }
    } catch (e) { }
});

ipcMain.on('session-update', (event, sid) => { activeSessionId = sid; });

ipcMain.on('engine-state', (event, state) => {
    safeSend(mainWindow, 'update-engine-ui', state);
});

ipcMain.on('remote-input', (event, data) => {
    try {
        if (!inputProcess || !inputProcess.stdin.writable) return;

        // v17.9: ABSOLUTE PERCENTAGE MAPPING (Precision Fix)
        if (data.px !== undefined && data.py !== undefined) {
            const finalX = Math.round(data.px * hostWidth);
            const finalY = Math.round(data.py * hostHeight);

            if (data.type === 'mousemove') {
                sendToController(`MOVE ${finalX} ${finalY}`);
            } else if (data.type === 'mousedown') {
                sendToController(`MOVE ${finalX} ${finalY}`);
                sendToController(`CLICK ${data.button.toUpperCase()} DOWN`);
            }
        } else if (data.type === 'mouseup') {
            sendToController(`CLICK ${data.button.toUpperCase()} UP`);
        } else if (data.type === 'wheel') {
            sendToController(`SCROLL ${Math.round(data.deltaY * -1)}`);
        } else if (data.type === 'keydown' || data.type === 'keyup') {
            if (data.vkCode) sendToController(`KEY ${data.vkCode} ${data.type === 'keydown' ? 'DOWN' : 'UP'}`);
        }
    } catch (e) { }
});

// ========================================
// 2. CORE LOGIC
// ========================================
function startInputController() {
    try {
        const psPath = path.join(__dirname, 'input_controller.ps1');
        inputProcess = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', psPath]);
        if (process.platform === 'win32' && inputProcess.pid) {
            spawn('powershell.exe', ['-Command', `(Get-Process -Id ${inputProcess.pid}).PriorityClass = 'High'`]);
        }
    } catch (e) { }
}

function sendToController(cmd) {
    if (inputProcess && inputProcess.stdin.writable) {
        inputProcess.stdin.write(cmd + "\n");
    }
}

async function terminateSession() {
    if (activeSessionId && config.token) {
        const url = `https://deskshare-backend-production.up.railway.app/api/webrtc/session/${activeSessionId}/terminate`;
        try { await axios.post(url, {}, { headers: { 'Authorization': 'Bearer ' + config.token }, timeout: 2000 }); } catch (e) { }
        activeSessionId = null;
    }
}

app.whenReady().then(() => {
    // PRE-FETCH SCREEN RES (STABILITY)
    const primary = screen.getPrimaryDisplay();
    hostWidth = primary.size.width;
    hostHeight = primary.size.height;

    startInputController();
    blockerId = powerSaveBlocker.start('prevent-app-suspension');
    createMainWindow();
    createEngineWindow();
});

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 500, height: 750, show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        autoHideMenuBar: true, backgroundColor: '#050507', title: "DeskShare v17.9"
    });

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;700&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #050507; --card: #121216; --success: #10b981; --accent: #3b82f6; --text: #fff; --text-dim: #71717a; }
            body { background: var(--bg); color: var(--text); font-family: 'Outfit', sans-serif; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; margin:0; transition: all 0.5s ease; }
            .container { text-align: center; width: 100%; max-width: 400px; display: flex; flex-direction: column; align-items: center; gap: 20px; }
            .app-title { font-size: 2.2rem; font-weight: 700; background: linear-gradient(to right, #fff, #a5b4fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-transform: uppercase; letter-spacing: 2px; }
            
            .icon-box { 
                width: 150px; height: 150px; background: var(--card); border-radius: 50%; display: flex; align-items: center; justify-content: center; 
                border: 2px solid #333; transition: all 0.5s ease; position: relative; 
            }
            .pulse { position: absolute; width:100%; height:100%; border-radius:50%; border:2px solid transparent; }
            
            .status-badge { 
                padding: 12px 24px; background: #1a1a1a; border-radius: 50px; font-size: 1.1rem; font-weight: 700; 
                color: #555; border: 1px solid #333; transition: all 0.4s ease; text-transform: uppercase; display: flex; align-items: center; gap: 10px; 
            }
            .dot { width: 10px; height: 10px; background: #333; border-radius: 50%; }
            
            body.ready .icon-box { border-color: var(--success); box-shadow: 0 0 50px rgba(16, 185, 129, 0.2); }
            body.ready .status-badge { color: var(--success); border-color: var(--success); }
            body.ready .dot { background: var(--success); }
            body.ready .pulse { border-color: var(--success); animation: pulse 2s infinite; }
            
            body.connected { background: radial-gradient(circle at center, #0a0a1a 0%, #050507 100%); }
            body.connected .status-badge { color: var(--accent); border-color: var(--accent); background: rgba(59, 130, 246, 0.1); }
            body.connected .icon-box { border-color: var(--accent); box-shadow: 0 0 50px rgba(59, 130, 246, 0.4); }
            body.connected .dot { background: var(--accent); }
            
            @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }
            #timer { font-size: 1.5rem; font-weight: bold; color: var(--accent); margin-top: 5px; display:none; }
            #userLabel { font-size: 0.9rem; color: #aaa; margin-top: 5px; }
        </style>
    </head>
    <body class="ready">
        <div class="container">
            <div class="app-title">DeskShare</div>
            <div class="icon-box">
                <div class="pulse"></div>
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
            </div>
            <div class="status-badge"><div class="dot"></div><span id="stText">EN LÍNEA</span></div>
            <div id="timer">00:00:00</div>
            <div id="userLabel"></div>
        </div>
        <script>
            const { ipcRenderer } = require('electron');
            let startTime = null;
            let timerInt = null;

            function updateTimer() {
                const diff = Math.floor((new Date() - startTime) / 1000);
                const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
                const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
                const secs = String(diff % 60).padStart(2, '0');
                document.getElementById('timer').innerText = hrs + ":" + mins + ":" + secs;
            }

            ipcRenderer.send('renderer-ready');
            ipcRenderer.on('update-engine-ui', (e, state) => {
                if (state === 'connected') {
                    document.body.className = 'connected';
                    document.getElementById('stText').innerText = "CONECTADO";
                    if (!startTime) {
                        startTime = new Date();
                        document.getElementById('timer').style.display = 'block';
                        timerInt = setInterval(updateTimer, 1000);
                    }
                } else {
                    document.body.className = 'ready';
                    document.getElementById('stText').innerText = "EN LÍNEA";
                    document.getElementById('timer').style.display = 'none';
                    if (timerInt) clearInterval(timerInt);
                    startTime = null;
                }
            });
        </script>
    </body>
    </html>`;

    const b64 = Buffer.from(htmlContent).toString('base64');
    mainWindow.loadURL(`data:text/html;base64,${b64}`);
    mainWindow.once('ready-to-show', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show(); });
    mainWindow.on('closed', () => { terminateSession(); mainWindow = null; });
}

function createEngineWindow() {
    engineWindow = new BrowserWindow({ width: 100, height: 100, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
    const engineHtml = `
    <!DOCTYPE html><html><body><script>
        const { ipcRenderer } = require('electron');
        const axios = require('axios');
        let config=null, activeSessionId=null, peerConnection=null;
        ipcRenderer.on('init-engine', (e,data) => { config=data.config; setInterval(poll,1000); });
        async function poll() {
            try {
                const res = await axios.get("https://deskshare-backend-production.up.railway.app/api/webrtc/host/pending?computerId="+config.computerId, {headers:{'Authorization':'Bearer '+config.token}});
                if (res.data.sessionId && res.data.sessionId !== activeSessionId) {
                    if (peerConnection) peerConnection.close();
                    activeSessionId = res.data.sessionId;
                    ipcRenderer.send('session-update', activeSessionId);
                    const pollRes = await axios.get("https://deskshare-backend-production.up.railway.app/api/webrtc/poll/"+activeSessionId, {headers:{'Authorization':'Bearer '+config.token}});
                    if (pollRes.data.offer) handleOffer(pollRes.data.offer);
                }
            } catch(e) {}
        }
        async function handleOffer(sdp) {
            peerConnection = new RTCPeerConnection({ iceServers: [{urls:'stun:stun.l.google.com:19302'}] });
            peerConnection.ondatachannel = (ev) => {
                ev.channel.onmessage = (e) => ipcRenderer.send('remote-input', JSON.parse(e.data));
            };
            peerConnection.onconnectionstatechange = () => ipcRenderer.send('engine-state', peerConnection.connectionState);
            const sources = await ipcRenderer.invoke('get-sources');
            const stream = await navigator.mediaDevices.getUserMedia({ video: { mandatory: { chromeMediaSource:'desktop', chromeMediaSourceId:sources[0].id, minFrameRate:60, maxWidth: hostWidth, maxHeight: hostHeight } } });
            stream.getTracks().forEach(t => peerConnection.addTrack(t, stream));
            await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            axios.post("https://deskshare-backend-production.up.railway.app/api/webrtc/answer", {sessionId:activeSessionId, sdp:answer}, {headers:{'Authorization':'Bearer '+config.token}});
        }
    </script></body></html>`;
    const b64 = Buffer.from(engineHtml).toString('base64');
    engineWindow.loadURL(`data:text/html;base64,${b64}`);
    engineWindow.on('closed', () => { engineWindow = null; });
}

ipcMain.handle('get-sources', async () => { return await desktopCapturer.getSources({ types: ['screen'] }); });

app.on('will-quit', async () => {
    await terminateSession();
    if (blockerId) powerSaveBlocker.stop(blockerId);
    if (inputProcess) inputProcess.kill();
});

app.on('window-all-closed', () => { app.quit(); });
