const { app, BrowserWindow, ipcMain, desktopCapturer, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const os = require('os');

// v22: CORE INFRASTRUCTURE RESCUE (ICE CANDIDATES RESTORED)
const LOG_FILE = path.join(os.tmpdir(), 'deskshare_debug.log');
function log(msg) { try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) { } }

log('=== v22 INFRASTRUCTURE RESCUE START ===');

// SINGLETON PROTECTION
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); process.exit(0); }

let mainWindow = null;
let engineWindow = null;
let inputProcess = null;
let config = null;
let res = { w: 1920, h: 1080 };
let activeSid = null;

// NETWORK BRIDGE (CORS-Proof & Stable)
function nodeRequest(method, pathStr, body) {
    return new Promise((resolve) => {
        try {
            if (!config) return resolve(null);
            const url = new URL("https://deskshare-backend-production.up.railway.app/api" + pathStr);
            const bodyData = body ? JSON.stringify(body) : null;
            const opts = {
                hostname: url.hostname, port: 443, path: url.pathname + url.search, method: method,
                headers: { 'Authorization': 'Bearer ' + config.token, 'Content-Type': 'application/json' }
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

function safeSend(win, channel, data) { try { if (win && !win.isDestroyed()) win.webContents.send(channel, data); } catch (e) { } }

ipcMain.handle('api-request', async (e, d) => await nodeRequest(d.method, d.endpoint, d.body));

ipcMain.on('renderer-ready', (e) => { if (config) e.reply('init-config', { config, res }); });
ipcMain.on('engine-ready', (e) => { if (config) safeSend(engineWindow, 'init-engine', { config, res }); });
ipcMain.on('session-update', (e, sid) => { activeSid = sid; log(`Active Session: ${sid}`); });
ipcMain.on('engine-state', (e, s) => { log(`WebRTC State: ${s}`); safeSend(mainWindow, 'update-engine-ui', s); });

// INPUT SYSTEM (v18+)
ipcMain.on('remote-input', (event, data) => {
    if (!inputProcess || !inputProcess.stdin.writable) return;
    let finalX = data.x, finalY = data.y;
    if (data.px !== undefined) { finalX = Math.round(data.px * res.w); finalY = Math.round(data.py * res.h); }
    let cmd = null;
    if (data.type === 'mousemove') cmd = `MOVE ${finalX} ${finalY}`;
    else if (data.type === 'mousedown') { writeToInput(`MOVE ${finalX} ${finalY}`); cmd = `CLICK ${data.button.toUpperCase()} DOWN`; }
    else if (data.type === 'mouseup') cmd = `CLICK ${data.button.toUpperCase()} UP`;
    else if (data.type === 'wheel') cmd = `SCROLL ${Math.round(data.deltaY * -1)}`;
    else if (data.type === 'keydown' || data.type === 'keyup') { if (data.vkCode) cmd = `KEY ${data.vkCode} ${data.type === 'keydown' ? 'DOWN' : 'UP'}`; }
    if (cmd) writeToInput(cmd);
});

function writeToInput(cmd) { try { inputProcess.stdin.write(cmd + "\n"); } catch (e) { } }

function startController() {
    try {
        const sc = path.join(__dirname, 'input_controller.ps1');
        inputProcess = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', sc]);
    } catch (e) { log(`Controller Fail: ${e.message}`); }
}

function loadData() {
    try {
        const APPDATA = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const cp = path.join(APPDATA, 'deskshare-launcher', 'config.json');
        if (fs.existsSync(cp)) config = JSON.parse(fs.readFileSync(cp, 'utf8'));
        log(`Config Load: ${config ? 'SUCCESS' : 'FAIL'}`);
        const p = screen.getPrimaryDisplay();
        res = { w: p.size.width, h: p.size.height };
    } catch (e) { log(`Data Error: ${e.message}`); }
}

app.whenReady().then(() => {
    loadData();
    startController();
    powerSaveBlocker.start('prevent-app-suspension');
    createMainWindow();
    createEngineWindow();
});

function createMainWindow() {
    mainWindow = new BrowserWindow({ width: 500, height: 750, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false }, autoHideMenuBar: true, backgroundColor: '#050507', title: "DeskShare v22" });
    const ui = `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;700&display=swap" rel="stylesheet"><style>:root{--bg:#050507;--card:#121216;--success:#10b981;--accent:#3b82f6;--text:#fff}body{background:var(--bg);color:var(--text);font-family:'Outfit',sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;margin:0}.container{text-align:center;width:100%;max-width:400px;display:flex;flex-direction:column;align-items:center;gap:20px}.app-title{font-size:2.2rem;font-weight:700;background:linear-gradient(to right,#fff,#a5b4fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-transform:uppercase;letter-spacing:2px}.icon-box{width:150px;height:150px;background:var(--card);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #333;position:relative}.pulse{position:absolute;width:100%;height:100%;border-radius:50%;border:2px solid transparent}.status-badge{padding:12px 24px;background:#1a1a1a;border-radius:50px;font-size:1.1rem;font-weight:700;color:#555;border:1px solid #333;text-transform:uppercase;display:flex;align-items:center;gap:10px}.dot{width:10px;height:10px;background:#333;border-radius:50%}body.ready .icon-box{border-color:var(--success);box-shadow:0 0 50px rgba(16,185,129,0.2)}body.ready .status-badge{color:var(--success);border-color:var(--success)}body.ready .dot{background:var(--success)}body.ready .pulse{border-color:var(--success);animation:p 2s infinite}body.connected{background:radial-gradient(circle at center,#0a0a1a 0%,#050507 100%)}body.connected .status-badge{color:var(--accent);border-color:var(--accent)}body.connected .icon-box{border-color:var(--accent)}body.connected .dot{background:var(--accent)}@keyframes p{0%{transform:scale(1);opacity:1}100%{transform:scale(1.4);opacity:0}}#timer{font-size:1.5rem;font-weight:bold;color:var(--accent);display:none}</style></head><body class="ready"><div class="container"><div class="app-title">DeskShare v22</div><div class="icon-box"><div class="pulse"></div><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></div><div class="status-badge"><div class="dot"></div><span id="st">EN LÍNEA</span></div><div id="timer">00:00:00</div></div><script>const {ipcRenderer}=require('electron');let st=null,ti=null;function ut(){const d=Math.floor((new Date()-st)/1000),h=String(Math.floor(d/3600)).padStart(2,'0'),m=String(Math.floor((d%3600)/60)).padStart(2,'0'),s=String(d%60).padStart(2,'0');document.getElementById('timer').innerText=h+':'+m+':'+s}ipcRenderer.send('renderer-ready');ipcRenderer.on('update-engine-ui',(e,s)=>{if(s==='connected'){document.body.className='connected';document.getElementById('st').innerText='CONECTADO';if(!st){st=new Date();document.getElementById('timer').style.display='block';ti=setInterval(ut,1000)}}else{document.body.className='ready';document.getElementById('st').innerText='EN LÍNEA';document.getElementById('timer').style.display='none';if(ti)clearInterval(ti);st=null}});</script></body></html>`;
    mainWindow.loadURL(`data:text/html;base64,${Buffer.from(ui).toString('base64')}`);
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { app.quit(); });
}

function createEngineWindow() {
    engineWindow = new BrowserWindow({ width: 100, height: 100, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
    const engineHtml = `<!DOCTYPE html><html><body><script>
    const {ipcRenderer}=require('electron');
    let config=null, sid=null, pc=null;

    ipcRenderer.send('engine-ready');
    ipcRenderer.on('init-engine',(e,d)=>{ config=d.config; setInterval(poll, 1500); });
    
    async function api(method, endpoint, body=null) { return await ipcRenderer.invoke('api-request', { method, endpoint, body }); }

    async function poll(){
        if(!config) return;
        try {
            const res = await api('GET', "/webrtc/host/pending?computerId=" + config.computerId);
            if (res && res.sessionId) {
                // v22: FULL INFRASTRUCTURE SYNC (SDP + ICE)
                sid = res.sessionId;
                ipcRenderer.send('session-update', sid);
                const p = await api('GET', "/webrtc/poll/" + sid);
                if (p && p.offer) {
                    if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed' || pc.signalingState === 'stable') { handle(p.offer); }
                }
                // RESTORED: ICE CANDIDATE SYNC
                if (p && p.iceCandidates && pc && pc.remoteDescription) {
                    for (const c of p.iceCandidates) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e){} }
                }
            }
        } catch(e){}
    }
    async function handle(sdp){
        if(pc && pc.connectionState === 'connected') return;
        if(pc) pc.close();
        pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
        
        // RESTORED: PUSH CANDIDATES
        pc.onicecandidate = (e) => { if(e.candidate) api('POST', '/webrtc/ice', { sessionId: sid, candidate: e.candidate, isHost: true }); };

        pc.ondatachannel=(ev)=>{ev.channel.onmessage=(e)=>ipcRenderer.send('remote-input',JSON.parse(e.data))};
        pc.onconnectionstatechange=()=>ipcRenderer.send('engine-state',pc.connectionState);
        const s = await ipcRenderer.invoke('get-sources');
        const stream = await navigator.mediaDevices.getUserMedia({video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:s[0].id,minFrameRate:60,maxWidth:${res.w},maxHeight:${res.h}}}});
        stream.getTracks().forEach(t=>pc.addTrack(t,stream));
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        api('POST', "/webrtc/answer", {sessionId:sid, sdp:ans});
    }
    ipcRenderer.handle('get-sources',async()=>require('electron').desktopCapturer.getSources({types:['screen']}));
    </script></body></html>`;
    engineWindow.loadURL(`data:text/html;base64,${Buffer.from(engineHtml).toString('base64')}`);
}

app.on('will-quit', () => { if (inputProcess) spawn('taskkill', ['/F', '/T', '/PID', inputProcess.pid]); });
