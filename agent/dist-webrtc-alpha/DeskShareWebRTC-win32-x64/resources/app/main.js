const { app, BrowserWindow, ipcMain, desktopCapturer, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');

// v18: NUCLEAR REWRITE (Singleton + Zombie Killer + Safe IPC)
console.log('[v18] Starting DeskShare Agent...');

// 1. SINGLETON LOCK (Prevent Zombies)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('[v18] Another instance is running. Quitting.');
    app.quit();
    process.exit(0);
}

let mainWindow = null;
let engineWindow = null;
let inputProcess = null;
let inputProcessPid = null;
let activeSessionId = null;
let globalConfig = null;
let globalRes = { w: 1920, h: 1080 };
let blockerId = null;

// GLOBAL ERROR HANDLER
process.on('uncaughtException', (err) => {
    console.error('[v18] CRITICAL ERROR:', err);
    // Do not crash, just log.
});

// ========================================
// 2. DATA LAYER (Global Cache)
// ========================================
function loadData() {
    try {
        const APPDATA = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const configPath = path.join(APPDATA, 'deskshare-launcher', 'config.json');
        if (fs.existsSync(configPath)) {
            globalConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log('[v18] Config loaded.');
        } else {
            console.warn('[v18] Config NOT found at:', configPath);
        }

        const primary = screen.getPrimaryDisplay();
        globalRes = { w: primary.size.width, h: primary.size.height };
        console.log('[v18] Resolution:', globalRes);
    } catch (e) {
        console.error('[v18] Data load failed:', e);
    }
}

// ========================================
// 3. SAFE IPC (One-Way / Reply Only)
// ========================================
function safeSend(win, channel, data) {
    try {
        if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
            win.webContents.send(channel, data);
        }
    } catch (e) { }
}

ipcMain.on('renderer-ready', (event) => {
    if (globalConfig && event && event.sender && !event.sender.isDestroyed()) {
        try {
            event.reply('init-config', { config: globalConfig, res: globalRes });
        } catch (e) { }

        safeSend(engineWindow, 'init-engine', { config: globalConfig, res: globalRes });
    }
});

ipcMain.on('session-update', (e, sid) => { activeSessionId = sid; });
ipcMain.on('engine-state', (e, s) => safeSend(mainWindow, 'update-engine-ui', s));

ipcMain.on('remote-input', (event, data) => {
    try {
        if (!inputProcess || !inputProcess.stdin.writable) return;

        // v18: DIRECT MAPPING (Integers from Viewer) or PERCENTAGE fallback
        let finalX = data.x;
        let finalY = data.y;

        // v17.9 Logic: Percentage
        if (data.px !== undefined) {
            finalX = Math.round(data.px * globalRes.w);
            finalY = Math.round(data.py * globalRes.h);
        }

        if (data.type === 'mousemove') {
            writeToInput(`MOVE ${finalX} ${finalY}`);
        } else if (data.type === 'mousedown') {
            writeToInput(`MOVE ${finalX} ${finalY}`);
            writeToInput(`CLICK ${data.button.toUpperCase()} DOWN`);
        } else if (data.type === 'mouseup') {
            writeToInput(`CLICK ${data.button.toUpperCase()} UP`);
        } else if (data.type === 'wheel') {
            writeToInput(`SCROLL ${Math.round(data.deltaY * -1)}`);
        } else if (data.type === 'keydown' || data.type === 'keyup') {
            if (data.vkCode) writeToInput(`KEY ${data.vkCode} ${data.type === 'keydown' ? 'DOWN' : 'UP'}`);
        }
    } catch (e) { }
});

// ========================================
// 4. PROCESS MANAGEMENT
// ========================================
function writeToInput(cmd) {
    if (inputProcess && inputProcess.stdin.writable) {
        inputProcess.stdin.write(cmd + "\n");
    }
}

function startController() {
    try {
        const script = path.join(__dirname, 'input_controller.ps1');
        console.log('[v18] Controller:', script);

        inputProcess = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', script]);
        inputProcessPid = inputProcess.pid;

        inputProcess.stdout.on('data', (d) => console.log('[PS1]', d.toString()));
        inputProcess.stderr.on('data', (d) => console.error('[PS1 ERR]', d.toString()));

        // Priority Boost
        if (inputProcessPid) {
            spawn('powershell.exe', ['-Command', `(Get-Process -Id ${inputProcessPid}).PriorityClass = 'High'`]);
        }
    } catch (e) { console.error('[v18] Controller start failed:', e); }
}

async function terminateSession() {
    if (activeSessionId && globalConfig && globalConfig.token) {
        const url = `https://deskshare-backend-production.up.railway.app/api/webrtc/session/${activeSessionId}/terminate`;
        try { await axios.post(url, {}, { headers: { 'Authorization': 'Bearer ' + globalConfig.token }, timeout: 1500 }); } catch (e) { }
    }
}

// 5. LIFECYCLE
app.whenReady().then(() => {
    loadData();
    startController();
    blockerId = powerSaveBlocker.start('prevent-app-suspension');
    createMainWindow();
    createEngineWindow();
});

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 500, height: 750, show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        autoHideMenuBar: true, backgroundColor: '#050507', title: "DeskShare v18"
    });

    // EMBEDDED UI v17.9 PREMIUM
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;700&display=swap" rel="stylesheet"><style>:root{--bg:#050507;--card:#121216;--success:#10b981;--accent:#3b82f6;--text:#fff}body{background:var(--bg);color:var(--text);font-family:'Outfit',sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;margin:0;transition:all 0.5s ease}.container{text-align:center;width:100%;max-width:400px;display:flex;flex-direction:column;align-items:center;gap:20px}.app-title{font-size:2.2rem;font-weight:700;background:linear-gradient(to right,#fff,#a5b4fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-transform:uppercase;letter-spacing:2px}.icon-box{width:150px;height:150px;background:var(--card);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #333;transition:all 0.5s ease;position:relative}.pulse{position:absolute;width:100%;height:100%;border-radius:50%;border:2px solid transparent}.status-badge{padding:12px 24px;background:#1a1a1a;border-radius:50px;font-size:1.1rem;font-weight:700;color:#555;border:1px solid #333;transition:all 0.4s ease;text-transform:uppercase;display:flex;align-items:center;gap:10px}.dot{width:10px;height:10px;background:#333;border-radius:50%}body.ready .icon-box{border-color:var(--success);box-shadow:0 0 50px rgba(16,185,129,0.2)}body.ready .status-badge{color:var(--success);border-color:var(--success)}body.ready .dot{background:var(--success)}body.ready .pulse{border-color:var(--success);animation:pulse 2s infinite}body.connected{background:radial-gradient(circle at center,#0a0a1a 0%,#050507 100%)}body.connected .status-badge{color:var(--accent);border-color:var(--accent);background:rgba(59,130,246,0.1)}body.connected .icon-box{border-color:var(--accent);box-shadow:0 0 50px rgba(59,130,246,0.4)}body.connected .dot{background:var(--accent)}@keyframes pulse{0%{transform:scale(1);opacity:1}100%{transform:scale(1.4);opacity:0}}#timer{font-size:1.5rem;font-weight:bold;color:var(--accent);margin-top:5px;display:none}</style></head><body class="ready"><div class="container"><div class="app-title">DeskShare v18</div><div class="icon-box"><div class="pulse"></div><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></div><div class="status-badge"><div class="dot"></div><span id="stText">EN LÍNEA</span></div><div id="timer">00:00:00</div></div><script>const {ipcRenderer}=require('electron');let startTime=null,timerInt=null;function updateTimer(){const d=Math.floor((new Date()-startTime)/1000),h=String(Math.floor(d/3600)).padStart(2,'0'),m=String(Math.floor((d%3600)/60)).padStart(2,'0'),s=String(d%60).padStart(2,'0');document.getElementById('timer').innerText=h+':'+m+':'+s}ipcRenderer.send('renderer-ready');ipcRenderer.on('update-engine-ui',(e,s)=>{if(s==='connected'){document.body.className='connected';document.getElementById('stText').innerText='CONECTADO';if(!startTime){startTime=new Date();document.getElementById('timer').style.display='block';timerInt=setInterval(updateTimer,1000)}}else{document.body.className='ready';document.getElementById('stText').innerText='EN LÍNEA';document.getElementById('timer').style.display='none';if(timerInt)clearInterval(timerInt);startTime=null}});</script></body></html>`;

    const b64 = Buffer.from(htmlContent).toString('base64');
    mainWindow.loadURL(`data:text/html;base64,${b64}`);
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => {
        terminateSession();
        app.quit(); // v18: Main window closed = APP EXIT
    });
}

function createEngineWindow() {
    engineWindow = new BrowserWindow({ width: 100, height: 100, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
    // Same Engine Logic
    const engineHtml = `<!DOCTYPE html><html><body><script>const {ipcRenderer}=require('electron');const axios=require('axios');let config=null,sid=null,pc=null;ipcRenderer.on('init-engine',(e,d)=>{config=d.config;setInterval(poll,1000)});async function poll(){try{const res=await axios.get("https://deskshare-backend-production.up.railway.app/api/webrtc/host/pending?computerId="+config.computerId,{headers:{'Authorization':'Bearer '+config.token}});if(res.data.sessionId&&res.data.sessionId!==sid){if(pc)pc.close();sid=res.data.sessionId;ipcRenderer.send('session-update',sid);const p=await axios.get("https://deskshare-backend-production.up.railway.app/api/webrtc/poll/"+sid,{headers:{'Authorization':'Bearer '+config.token}});if(p.data.offer)handle(p.data.offer)}}catch(e){}}async function handle(sdp){pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});pc.ondatachannel=(ev)=>{ev.channel.onmessage=(e)=>ipcRenderer.send('remote-input',JSON.parse(e.data))};pc.onconnectionstatechange=()=>ipcRenderer.send('engine-state',pc.connectionState);const s=await ipcRenderer.invoke('get-sources');const stream=await navigator.mediaDevices.getUserMedia({video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:s[0].id,minFrameRate:60,maxWidth:${globalRes.w},maxHeight:${globalRes.h}}}});stream.getTracks().forEach(t=>pc.addTrack(t,stream));await pc.setRemoteDescription(new RTCSessionDescription(sdp));const ans=await pc.createAnswer();await pc.setLocalDescription(ans);axios.post("https://deskshare-backend-production.up.railway.app/api/webrtc/answer",{sessionId:sid,sdp:ans},{headers:{'Authorization':'Bearer '+config.token}})}ipcRenderer.handle('get-sources',async()=>require('electron').desktopCapturer.getSources({types:['screen']}));</script></body></html>`;
    const b64 = Buffer.from(engineHtml).toString('base64');
    engineWindow.loadURL(`data:text/html;base64,${b64}`);
}

app.on('will-quit', async () => {
    // AGGRESSIVE KILL INPUT
    if (inputProcessPid) {
        console.log('[v18] Nuking Input Controller...');
        spawn('taskkill', ['/F', '/T', '/PID', inputProcessPid]);
    }
});
