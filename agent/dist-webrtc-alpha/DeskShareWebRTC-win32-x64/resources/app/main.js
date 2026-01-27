const { app, BrowserWindow, ipcMain, desktopCapturer, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');

// v17.7: ZERO-FAILURE ENGINE X
let mainWindow = null;
let engineWindow = null;
let config = {};
let inputProcess = null;
let activeSessionId = null;
let blockerId = null;

// ========================================
// 1. CRASH-IMMUNE IPC HANDLERS
// ========================================
function safeSend(win, channel, data) {
    try {
        if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
            win.webContents.send(channel, data);
        }
    } catch (e) { /* Silently catch destruction race conditions */ }
}

ipcMain.on('renderer-ready', (event) => {
    try {
        const APPDATA = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const configPath = path.join(APPDATA, 'deskshare-launcher', 'config.json');
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.size;
            const data = { config, res: { w: width, h: height } };

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

        // v17.7: PERCENTAGE-BASED SCALING (Resolution Independent)
        const primary = screen.getPrimaryDisplay();
        const { width: hostW, height: hostH } = primary.size;

        if (data.type === 'mousemove' || data.type === 'mousedown') {
            const finalX = Math.round(data.px * hostW);
            const finalY = Math.round(data.py * hostH);

            if (data.type === 'mousemove') {
                sendToController(`MOVE ${finalX} ${finalY}`);
            } else {
                if (data.px !== undefined) sendToController(`MOVE ${finalX} ${finalY}`);
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

        // v17.0: Set high priority for zero-lag
        if (process.platform === 'win32' && inputProcess.pid) {
            spawn('powershell.exe', ['-Command', `(Get-Process -Id ${inputProcess.pid}).PriorityClass = 'High'`]);
        }
    } catch (e) { console.error('Controller failed:', e); }
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
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    startInputController();
    blockerId = powerSaveBlocker.start('prevent-app-suspension');
    createMainWindow();
    createEngineWindow();
});

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 500, height: 750, show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        autoHideMenuBar: true, backgroundColor: '#050507', title: "DeskShare v17.7"
    });

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;700&display=swap" rel="stylesheet">
        <style>
            :root { --bg:#050507; --success:#10b981; --accent:#3b82f6; --text:#fff; }
            body { background:var(--bg); color:var(--text); font-family:'Outfit',sans-serif; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; margin:0; }
            .badge { padding:12px 24px; background:#1a1a1a; border-radius:50px; font-weight:700; border:1px solid #333; margin-top:20px; }
            body.connected .badge { color:var(--accent); border-color:var(--accent); }
            body.ready .badge { color:var(--success); border-color:var(--success); }
        </style>
    </head>
    <body class="ready">
        <h1 style="background:linear-gradient(to right,#fff,#a5b4fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">DESKSHARE</h1>
        <div class="badge" id="stText">EN LÍNEA (v17.7)</div>
        <div id="logs" style="font-size:0.8rem;color:#71717a;margin-top:20px;">Sincronizado</div>
        <script>
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('renderer-ready');
            ipcRenderer.on('update-engine-ui', (e,s) => { 
                document.getElementById('stText').innerText = s.toUpperCase();
                document.body.className = s === 'connected' ? 'connected' : 'ready';
            });
        </script>
    </body>
    </html>`;

    const b64 = Buffer.from(htmlContent).toString('base64');
    mainWindow.loadURL(`data:text/html;base64,${b64}`);
    mainWindow.once('ready-to-show', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show(); });
    mainWindow.on('close', () => { terminateSession(); });
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
                if (ev.channel.label==='input') ev.channel.onopen = () => ev.channel.send(JSON.stringify({type:'init-host'}));
            };
            peerConnection.onconnectionstatechange = () => ipcRenderer.send('engine-state', peerConnection.connectionState);
            const sources = await ipcRenderer.invoke('get-sources');
            const stream = await navigator.mediaDevices.getUserMedia({ video: { mandatory: { chromeMediaSource:'desktop', chromeMediaSourceId:sources[0].id, minFrameRate:60 } } });
            stream.getTracks().forEach(t => peerConnection.addTrack(t, stream));
            await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            axios.post("https://deskshare-backend-production.up.railway.app/api/webrtc/answer", {sessionId:activeSessionId, sdp:answer}, {headers:{'Authorization':'Bearer '+config.token}});
        }
    </script></body></html>`;
    const b64 = Buffer.from(engineHtml).toString('base64');
    engineWindow.loadURL(`data:text/html;base64,${b64}`);
}

ipcMain.handle('get-sources', async () => { return await desktopCapturer.getSources({ types: ['screen'] }); });

app.on('will-quit', async () => {
    await terminateSession();
    if (blockerId) powerSaveBlocker.stop(blockerId);
    if (inputProcess) inputProcess.kill();
});

app.on('window-all-closed', () => { app.quit(); });
