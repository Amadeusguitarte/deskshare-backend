const { app, BrowserWindow, ipcMain, desktopCapturer, screen, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const axios = require('axios');

// v16.0: CRITICAL RESILIENCE & FLUIDITY (Fast-Path)
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-frame-rate-limit');

// Windows
let mainWindow;
let engineWindow;
let config = {};
let inputProcess = null;

function startInputController() {
    const psPath = path.join(__dirname, 'input_controller.ps1');
    inputProcess = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', psPath]);

    // v16.0: Increase process priority for zero-lag input
    if (process.platform === 'win32' && inputProcess.pid) {
        spawn('powershell.exe', ['-Command', `(Get-Process -Id ${inputProcess.pid}).PriorityClass = 'High'`]);
    }
    console.log('PowerShell Input Controller started (High Priority)');
}

function sendToController(cmd) {
    if (inputProcess && inputProcess.stdin.writable) {
        inputProcess.stdin.write(cmd + "\n");
    }
}

app.whenReady().then(() => {
    startInputController();
    blockerId = powerSaveBlocker.start('prevent-app-suspension');
    createMainWindow();
    createEngineWindow();
});

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 500, height: 750,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        autoHideMenuBar: true, backgroundColor: '#050507',
        title: "DeskShare Alpha"
    });

    // v17.0: Prevent window suspension when minimized by overriding minimize
    mainWindow.on('minimize', (e) => {
        // We don't prevent it, but since Engine is in a separate window, 
        // minimize logic here won't affect the WebRTC stream.
    });

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #050507; --card: #121216; --success: #10b981; --success-glow: rgba(16, 185, 129, 0.4); --accent: #3b82f6; --text: #ffffff; --text-dim: #71717a;
            }
            body { background: var(--bg); color: var(--text); font-family: 'Outfit', sans-serif; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; margin:0; }
            .container { text-align: center; width: 100%; max-width: 400px; padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 20px; }
            .app-title { font-size: 2rem; font-weight: 700; background: linear-gradient(to right, #fff, #a5b4fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-transform: uppercase; letter-spacing: 2px; }
            
            .icon-box { 
                width: 150px; height: 150px; background: var(--card); border-radius: 50%; display: flex; align-items: center; justify-content: center; 
                border: 2px solid #333; transition: all 0.5s ease; position: relative; 
            }
            .icon-box svg { width: 60px; height: 60px; color: #333; transition: all 0.5s ease; }
            .pulse { position: absolute; width:100%; height:100%; border-radius:50%; border:2px solid transparent; }
            
            .status-badge { 
                padding: 12px 24px; background: #1a1a1a; border-radius: 50px; font-size: 1.1rem; font-weight: 700; 
                color: #555; border: 1px solid #333; transition: all 0.4s ease; text-transform: uppercase; display: flex; align-items: center; gap: 10px; 
            }
            .dot { width: 10px; height: 10px; background: #333; border-radius: 50%; }

            /* ONLINE READY STATE */
            body.ready .icon-box { border-color: var(--success); box-shadow: 0 0 50px var(--success-glow); }
            body.ready .icon-box svg { color: var(--success); filter: drop-shadow(0 0 10px var(--success)); }
            body.ready .status-badge { color: var(--success); border-color: var(--success); background: rgba(16, 185, 129, 0.1); }
            body.ready .dot { background: var(--success); box-shadow: 0 0 10px var(--success); }
            body.ready .pulse { border-color: var(--success); animation: pulse 2s infinite; }

            /* CONNECTED STATE */
            body.connected .status-badge { color: var(--accent); border-color: var(--accent); background: rgba(59, 130, 246, 0.1); animation: blink 1s infinite alternate; }
            body.connected .icon-box { border-color: var(--accent); box-shadow: 0 0 50px rgba(59, 130, 246, 0.4); }
            body.connected .icon-box svg { color: var(--accent); }
            body.connected .dot { background: var(--accent); }
            body.connected .pulse { border-color: var(--accent); }

            @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }
            @keyframes blink { 0% { opacity: 0.8; } 100% { opacity: 1; } }

            .info { font-size: 0.8rem; color: var(--text-dim); margin-top: 15px; font-family: monospace; }
            #timer { font-size: 1.5rem; font-weight: bold; color: var(--accent); margin-top: 5px; display:none; }
        </style>
    </head>
    <body class="ready">
        <div class="container">
            <div class="app-title">DeskShare</div>
            <div class="icon-box">
                <div class="pulse"></div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
            </div>
            <div class="status-badge">
                <div class="dot"></div>
                <span id="stText">EN LÍNEA</span>
            </div>
            <div id="timer">00:00:00</div>
            <div id="userLabel" style="font-size: 0.9rem; color: #aaa; margin-top: 5px;"></div>
            <div id="logs" class="info">Iniciando sistema...</div>
        </div>

        <script>
            const { ipcRenderer } = require('electron');
            const axios = require('axios');
            const stText = document.getElementById('stText');
            const logs = document.getElementById('logs');
            const timer = document.getElementById('timer');
            const userLabel = document.getElementById('userLabel');
            const body = document.body;

            let config = null;
            let activeSessionId = null;
            let peerConnection = null;
            let hostRes = { w: 1920, h: 1080 };
            let startTime = null;
            let timerInt = null;
            let currentUserName = "";

            function log(msg) { logs.innerText = msg; }

            function updateTimer() {
                const now = new Date();
                const diff = Math.floor((now - startTime) / 1000);
                const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
                const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
                const secs = String(diff % 60).padStart(2, '0');
                timer.innerText = hrs + ":" + mins + ":" + secs;
            }

            ipcRenderer.send('renderer-ready');
            ipcRenderer.on('init-config', (e, data) => {
                config = data.config; hostRes = data.res;
                log("Agente Engine X v17.0 Iniciado");
            });

            ipcRenderer.on('update-engine-ui', (e, state) => {
                if (state === 'connected') {
                    body.classList.remove('ready');
                    body.classList.add('connected');
                    stText.innerText = "CONECTADO";
                    if (!startTime) {
                        startTime = new Date();
                        timer.style.display = 'block';
                        timerInt = setInterval(updateTimer, 1000);
                    }
                } else if (state === 'ready') {
                    body.classList.remove('connected');
                    body.classList.add('ready');
                    stText.innerText = "EN LÍNEA";
                    timer.style.display = 'none';
                    if (timerInt) clearInterval(timerInt);
                    startTime = null;
                } else if (state === 'negotiating') {
                    stText.innerText = "NEGOCIANDO...";
                }
            });

            function startPolling() {
                body.classList.add('online');
                stText.innerText = "EN LÍNEA";
                setInterval(async () => {
                    await checkForPending();
                    if (activeSessionId) await pollActiveSession();
                }, 1000); // v14.0: 1s faster reaction
            }

            async function checkForPending() {
                try {
                    const url = "https://deskshare-backend-production.up.railway.app/api/webrtc/host/pending?computerId=" + config.computerId;
                    const res = await axios.get(url, { headers: { 'Authorization': 'Bearer ' + config.token } });
                    if (res.data.sessionId) {
                        if (res.data.sessionId !== activeSessionId) {
                            log("Nueva petición: " + res.data.sessionId);
                            reset();
                            activeSessionId = res.data.sessionId;
                            const pollRes = await axios.get("https://deskshare-backend-production.up.railway.app/api/webrtc/poll/" + activeSessionId, {
                                headers: { 'Authorization': 'Bearer ' + config.token }
                            });
                            if (pollRes.data.offer) { 
                                currentUserName = pollRes.data.userName || "Invitado";
                                await handleOffer(pollRes.data.offer); 
                            }
                        }
                    }
                } catch(e) {}
            }

            async function pollActiveSession() {
                try {
                    const res = await axios.get("https://deskshare-backend-production.up.railway.app/api/webrtc/poll/" + activeSessionId, {
                        headers: { 'Authorization': 'Bearer ' + config.token }
                    });
                    
                    // Update username if it becomes available or changes
                    if (res.data.userName && res.data.userName !== "Invitado") {
                        if (currentUserName !== res.data.userName) {
                            currentUserName = res.data.userName;
                            userLabel.innerText = currentUserName.toUpperCase();
                            log("Usuario identificado: " + currentUserName);
                        }
                    }

                    if (res.data.iceCandidates) {
                        for (const cand of res.data.iceCandidates) {
                            if (peerConnection && peerConnection.remoteDescription) {
                                try { await peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch(e) {}
                            }
                        }
                    }
                } catch (e) {
                    if (e.response && e.response.status === 404) reset();
                }
            }

            async function handleOffer(sdp) {
                try {
                    stText.innerText = "NEGOCIANDO...";
                    peerConnection = new RTCPeerConnection({
                        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }]
                    });

                    peerConnection.ondatachannel = (event) => {
                        const channel = event.channel;
                        channel.onmessage = (e) => {
                            const data = JSON.parse(e.data);
                            if (data.type === 'ping') {
                                channel.send(JSON.stringify({ type: 'pong', ts: data.ts }));
                            } else {
                                ipcRenderer.send('remote-input', data);
                            }
                        };
                        channel.onopen = () => {
                            if (channel.label === 'input') {
                                channel.send(JSON.stringify({ type: 'init-host', res: hostRes }));
                            }
                        };
                    };

                    peerConnection.onicecandidate = (event) => {
                        if (event.candidate) {
                            axios.post("https://deskshare-backend-production.up.railway.app/api/webrtc/ice", {
                                sessionId: activeSessionId, candidate: event.candidate, isHost: true
                            }, { headers: { 'Authorization': 'Bearer ' + config.token }});
                        }
                    };

                    peerConnection.onconnectionstatechange = () => {
                        const state = peerConnection.connectionState;
                        if (state === 'connected') {
                            body.classList.remove('ready');
                            body.classList.add('connected');
                            stText.innerText = "CONECTADO";
                            userLabel.innerText = currentUserName.toUpperCase();
                            startTime = new Date();
                            timer.style.display = 'block';
                            timerInt = setInterval(updateTimer, 1000);
                            log("Sesión activa con " + currentUserName);

                                // STABILITY TUNING v15.0: Adaptive Ramp (3 -> 8Mbps) + Frame Rate Priority
                                const senders = peerConnection.getSenders();
                                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                                if (videoSender) {
                                    const params = videoSender.getParameters();
                                    if (!params.encodings) params.encodings = [{ priority: 'high' }];
                                    
                                    // Start conservative (3Mbps)
                                    params.encodings[0].maxBitrate = 3000000; 
                                    params.encodings[0].networkPriority = 'high';
                                    
                                    videoSender.setDegradationPreference('maintain-framerate');
                                    videoSender.setParameters(params);

                                    // v16.0: Fast Ramp (2s)
                                    setTimeout(() => {
                                        if (peerConnection && peerConnection.connectionState === 'connected') {
                                            const p = videoSender.getParameters();
                                            p.encodings[0].maxBitrate = 8000000; 
                                            videoSender.setParameters(p);
                                            log("Fluidez Total: 8Mbps / 60FPS");
                                        }
                                    }, 2000);
                                }
                        } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
                            reset();
                        }
                    };

                    const sources = await ipcRenderer.invoke('get-sources');
                    const sourceId = sources[0].id; 

                    let stream;
                    const constraints = {
                        video: { 
                            mandatory: { 
                                chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, 
                                minFrameRate: 60, maxFrameRate: 60, maxWidth: 1920, maxHeight: 1080
                            } 
                        }
                    };

                    try {
                        // Intentar A+V (Primary)
                        stream = await navigator.mediaDevices.getUserMedia({
                            audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } },
                            ...constraints
                        });
                        log("Audio (Desktop Loopback) OK");
                    } catch (e) {
                        try {
                            // Fallback 1: Desktop Genérico
                            stream = await navigator.mediaDevices.getUserMedia({
                                audio: { mandatory: { chromeMediaSource: 'desktop' } },
                                ...constraints
                            });
                            log("Audio (Generic Loopback) OK");
                        } catch (e2) {
                            try {
                                // Fallback 2: Audio System Direct
                                const vStream = await navigator.mediaDevices.getUserMedia(constraints);
                                const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                                stream = new MediaStream([...vStream.getTracks(), ...aStream.getTracks()]);
                                log("Audio (System Device) OK");
                            } catch (e3) {
                                stream = await navigator.mediaDevices.getUserMedia(constraints);
                                log("⚠️ VIDEO OK (Audio falló)");
                            }
                        }
                    }
                    
                    stream.getTracks().forEach(track => {
                        if (track.kind === 'video') track.contentHint = 'motion';
                        peerConnection.addTrack(track, stream);
                    });

                    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);

                    await axios.post("https://deskshare-backend-production.up.railway.app/api/webrtc/answer", {
                        sessionId: activeSessionId, sdp: answer
                    }, { headers: { 'Authorization': 'Bearer ' + config.token }});
                } catch (err) { reset(); }
            }

            function reset() {
                activeSessionId = null;
                if (peerConnection) {
                    peerConnection.onconnectionstatechange = null;
                    peerConnection.close();
                }
                peerConnection = null;
                clearInterval(timerInt);
                timer.style.display = 'none';
                userLabel.innerText = "";
                stText.innerText = "EN LÍNEA";
                body.classList.remove('connected');
                body.classList.add('ready');
                log("Esperando nueva conexión...");
            }
        </script>
    </body>
    </html>
    `;
    const uiPath = path.join(__dirname, 'webrtc_alpha_ui.html');
    fs.writeFileSync(uiPath, htmlContent);
    mainWindow.loadFile(uiPath);
}

function createEngineWindow() {
    // v17.0: PHANTOM ENGINE WINDOW
    // This window is hidden (show: false) and tiny, but active.
    // It captures and streams without being throttled by OS when main is minimized.
    engineWindow = new BrowserWindow({
        width: 100, height: 100, show: false,
        webPreferences: {
            nodeIntegration: true, contextIsolation: false,
            backgroundThrottling: false, offscreen: false
        }
    });

    const engineHtml = `
    <!DOCTYPE html>
    <html>
    <body>
        <script>
            const { ipcRenderer } = require('electron');
            const axios = require('axios');

            let config = null;
            let activeSessionId = null;
            let peerConnection = null;
            let hostRes = { w: 1920, h: 1080 };

            ipcRenderer.on('init-engine', (e, data) => {
                config = data.config; hostRes = data.res;
                startPolling();
            });

            function startPolling() {
                setInterval(async () => {
                    await checkForPending();
                    if (activeSessionId) await pollActiveSession();
                }, 1000);
            }

            async function checkForPending() {
                try {
                    const url = "https://deskshare-backend-production.up.railway.app/api/webrtc/host/pending?computerId=" + config.computerId;
                    const res = await axios.get(url, { headers: { 'Authorization': 'Bearer ' + config.token } });
                    if (res.data.sessionId && res.data.sessionId !== activeSessionId) {
                        reset();
                        activeSessionId = res.data.sessionId;
                        const pollRes = await axios.get("https://deskshare-backend-production.up.railway.app/api/webrtc/poll/" + activeSessionId, {
                            headers: { 'Authorization': 'Bearer ' + config.token }
                        });
                        if (pollRes.data.offer) await handleOffer(pollRes.data.offer);
                    }
                } catch(e) {}
            }

            async function pollActiveSession() {
                try {
                    const res = await axios.get("https://deskshare-backend-production.up.railway.app/api/webrtc/poll/" + activeSessionId, {
                        headers: { 'Authorization': 'Bearer ' + config.token }
                    });
                    if (res.data.iceCandidates) {
                        for (const cand of res.data.iceCandidates) {
                            if (peerConnection?.remoteDescription) {
                                try { await peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch(e) {}
                            }
                        }
                    }
                } catch (e) { if (e.response?.status === 404) reset(); }
            }

            async function handleOffer(sdp) {
                try {
                    peerConnection = new RTCPeerConnection({
                        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }]
                    });

                    peerConnection.ondatachannel = (event) => {
                        const channel = event.channel;
                        channel.onmessage = (e) => {
                            const data = JSON.parse(e.data);
                            ipcRenderer.send('remote-input', data);
                        };
                        if (channel.label === 'input') {
                            channel.onopen = () => channel.send(JSON.stringify({ type: 'init-host', res: hostRes }));
                        }
                    };

                    peerConnection.onicecandidate = (event) => {
                        if (event.candidate) {
                            axios.post("https://deskshare-backend-production.up.railway.app/api/webrtc/ice", {
                                sessionId: activeSessionId, candidate: event.candidate, isHost: true
                            }, { headers: { 'Authorization': 'Bearer ' + config.token }});
                        }
                    };

                    peerConnection.onconnectionstatechange = () => {
                        const state = peerConnection.connectionState;
                        ipcRenderer.send('engine-state', state);
                        if (state === 'connected') {
                            const videoSender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
                            if (videoSender) {
                                // v17.1: Immediate Agresive Bitrate
                                const params = videoSender.getParameters();
                                if (params.encodings && params.encodings[0]) {
                                    params.encodings[0].maxBitrate = 9000000; // Un poco más para 1080p nítido
                                    params.encodings[0].priority = 'high';
                                    videoSender.setParameters(params);
                                    log("Calidad Engine X: 9Mbps");
                                }
                            }
                        } else if (['failed','closed','disconnected'].includes(state)) reset();
                    };

                    const sources = await ipcRenderer.invoke('get-sources');
                    const sourceId = sources[0].id;
                    let stream;

                    // v17.1: Balanced Constraints for Quality
                    const constraints = {
                        video: { 
                            mandatory: { 
                                chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId,
                                minFrameRate: 30, maxFrameRate: 60, // Flexibilidad para evitar pixelación
                                maxWidth: 1920, maxHeight: 1080
                            }
                        }
                    };

                    try {
                        // v17.1: Cascaded Audio Probing
                        // Intento A: Audio Loopback Desktop (Method 1)
                        stream = await navigator.mediaDevices.getUserMedia({
                            audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } },
                            ...constraints
                        });
                        log("Audio Mode: PURE_LOOPBACK");
                    } catch(e) {
                        try {
                            // Intento B: Audio Loopback Desktop (Method 2)
                            stream = await navigator.mediaDevices.getUserMedia({
                                audio: { mandatory: { chromeMediaSource: 'desktop' } },
                                ...constraints
                            });
                            log("Audio Mode: GENERIC_LOOPBACK");
                        } catch(e2) {
                            try {
                                // Intento C: System Audio Direct (The "Insolvency" Fix)
                                const vStream = await navigator.mediaDevices.getUserMedia(constraints);
                                const aStream = await navigator.mediaDevices.getUserMedia({ 
                                    audio: {
                                        echoCancellation: false, noiseSuppression: false, autoGainControl: false
                                    } 
                                });
                                stream = new MediaStream([...vStream.getTracks(), ...aStream.getTracks()]);
                                log("Audio Mode: SYSTEM_NATIVE");
                            } catch(e3) {
                                stream = await navigator.mediaDevices.getUserMedia(constraints);
                                log("Audio Mode: FAILED (Video Only)");
                            }
                        }
                    }

                    stream.getTracks().forEach(track => {
                        if (track.kind === 'video') track.contentHint = 'motion';
                        peerConnection.addTrack(track, stream);
                    });

                    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);

                    await axios.post("https://deskshare-backend-production.up.railway.app/api/webrtc/answer", {
                        sessionId: activeSessionId, sdp: answer
                    }, { headers: { 'Authorization': 'Bearer ' + config.token }});
                } catch (err) { reset(); }
            }

            function reset() {
                activeSessionId = null;
                if (peerConnection) peerConnection.close();
                peerConnection = null;
                ipcRenderer.send('engine-state', 'ready');
            }
        </script>
    </body>
    </html>
    `;
    const enginePath = path.join(__dirname, 'engine.html');
    fs.writeFileSync(enginePath, engineHtml);
    engineWindow.loadFile(enginePath);
}

ipcMain.on('renderer-ready', (event) => {
    try {
        const APPDATA = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const configPath = path.join(APPDATA, 'deskshare-launcher', 'config.json');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenW, height: screenH } = primaryDisplay.size;
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const data = { config, res: { w: screenW, h: screenH } };
            event.reply('init-config', data);
            if (engineWindow) engineWindow.webContents.send('init-engine', data);
        }
    } catch (e) { }
});

ipcMain.on('engine-state', (event, state) => {
    if (mainWindow) mainWindow.webContents.send('update-engine-ui', state);
});

ipcMain.handle('get-sources', async () => {
    return await desktopCapturer.getSources({ types: ['screen'] });
});

ipcMain.on('remote-input', (event, data) => {
    try {
        const scaleFactor = screen.getPrimaryDisplay().scaleFactor;

        if (data.type === 'mousemove') {
            const x = Math.round(data.x * scaleFactor);
            const y = Math.round(data.y * scaleFactor);
            sendToController(`MOVE ${x} ${y}`);
        }
        else if (data.type === 'mousedown') {
            const x = Math.round(data.x * scaleFactor);
            const y = Math.round(data.y * scaleFactor);
            if (data.x !== -1) sendToController(`MOVE ${x} ${y}`);
            sendToController(`CLICK ${data.button.toUpperCase()} DOWN`);
        }
        else if (data.type === 'mouseup') {
            sendToController(`CLICK ${data.button.toUpperCase()} UP`);
        }
        else if (data.type === 'wheel') {
            // Normalize scroll delta. Windows usually expects multiples of 120.
            const delta = Math.round(data.deltaY * -1); // Browser delta is inverted to Win32 Wheel
            sendToController(`SCROLL ${delta}`);
        }
        else if (data.type === 'keydown' || data.type === 'keyup') {
            const state = data.type === 'keydown' ? 'DOWN' : 'UP';
            if (data.vkCode) {
                sendToController(`KEY ${data.vkCode} ${state}`);
            }
        }
    } catch (e) { }
});

app.on('will-quit', async () => {
    // v14.0: SUPER CLEAN EXIT
    if (blockerId) powerSaveBlocker.stop(blockerId);

    if (activeSessionId && config.token) {
        try {
            // Signal disconnect to all P2P peers if possible (via backend)
            await axios.post(`https://deskshare-backend-production.up.railway.app/api/webrtc/session/${activeSessionId}/terminate`,
                {}, { headers: { 'Authorization': 'Bearer ' + config.token } });
        } catch (e) { }
    }
    if (inputProcess) inputProcess.kill();
});
app.on('window-all-closed', () => { app.quit(); });
function sendHeartbeat() {
    if (!config.computerId) return;
    axios.post("https://deskshare-backend-production.up.railway.app/api/tunnels/heartbeat", { computerId: config.computerId }, { headers: { 'Authorization': 'Bearer ' + config.token } }).catch(() => { });
}
setInterval(sendHeartbeat, 60000);
