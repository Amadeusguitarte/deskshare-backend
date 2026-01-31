// ========================================
// WebRTC Viewer Module (v4.0-Professional)
// Client-side WebRTC receiver with Native Metrics (getStats)
// ========================================

class WebRTCViewer {
    constructor(canvasId, booking) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.booking = booking;
        this.peerConnection = null;
        this.sessionId = null;
        this.pollInterval = null;
        this.dataChannel = null;
        this.stateTarget = document.getElementById('webrtc-state');
        this.latencyTarget = document.getElementById('latency-value');
        this.videoElement = null;
        this.hostRes = { w: 1920, h: 1080 };
        this.canvas.style.cursor = 'none';
    }

    updateState(msg) {
        if (this.stateTarget) this.stateTarget.innerText = msg;
        console.log('[WebRTC State]', msg);
    }

    async connect() {
        this.updateState('Iniciando...');
        try {
            this.disconnect(); // Clean old session
            await this.createSession();
            await this.initPeerConnection();

            // Add transceiver AFTER connection init
            this.peerConnection.addTransceiver('video', { direction: 'recvonly' });

            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            await this.sendOffer(offer);
            this.startPolling();
            this.updateState('Negociando...');
        } catch (e) {
            this.updateState('Error: ' + e.message);
        }
    }

    async createSession() {
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';

        // v31: Direct ID Mode
        const urlParams = new URLSearchParams(window.location.search);
        const directId = urlParams.get('directId');

        const bodyPayload = directId ? { computerId: parseInt(directId) } : { bookingId: this.booking.id };
        console.log('[WebRTC] Creating Session with payload:', bodyPayload);

        const response = await fetch(`${BACKEND_URL}/webrtc/session/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify(bodyPayload)
        });
        const data = await response.json();
        this.sessionId = data.sessionId;
    }

    async initPeerConnection() {
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ],
            bundlePolicy: 'max-bundle'
        };
        console.log('[WebRTC] Init PeerConnection', config);
        this.peerConnection = new RTCPeerConnection(config);

        // V112: Add transceivers to request audio + video reception
        // Without this, the SDP offer won't include audio m-line
        this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
        this.peerConnection.addTransceiver('audio', { direction: 'recvonly' });
        console.log('[WebRTC] V112: Added video+audio transceivers for reception');

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // console.log('[WebRTC] Local Candidate:', event.candidate.candidate);
                this.sendIceCandidate(event.candidate);
            }
        };

        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC Viewer] Track Detectado:', event.track.kind, '✅');

            // V113: Audio track detection (no visual indicator now)
            if (event.track.kind === 'audio') {
                console.log('[WebRTC Viewer] 🔊 AUDIO TRACK RECEIVED! ID:', event.track.id);
            }

            // v49: Keep UI panel visible for Stats & Controls
            this.updateState('EN VIVO');

            // v48: FORCE VIDEO PLAYBACK (Fix for Black Screen)
            // Ensure we have a video element and it is playing
            if (event.streams && event.streams[0]) {
                this.renderStream(event.streams[0]);

                // Extra safety: Force play on the existing element
                if (this.videoElement) {
                    this.videoElement.srcObject = event.streams[0];
                    this.videoElement.play().catch(e => console.error("Autoplay Blocked:", e));
                }
            }
        };

        // V116: Enhanced connection state handler with robust auto-retry
        let retryCount = 0;
        const MAX_RETRIES = 3;

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            this.updateState(state.toUpperCase());
            console.log('[WebRTC State]', state);

            if (state === 'connected') {
                retryCount = 0;
            }

            if (state === 'failed' || state === 'disconnected') {
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    console.log(`[WebRTC] Retry ${retryCount}/${MAX_RETRIES} in 2s...`);
                    this.updateState(`RECONECTANDO (${retryCount}/${MAX_RETRIES})...`);
                    setTimeout(() => {
                        if (this.peerConnection &&
                            (this.peerConnection.connectionState === 'failed' ||
                                this.peerConnection.connectionState === 'disconnected')) {
                            this.disconnect();
                            this.connect();
                        }
                    }, 2000);
                } else {
                    this.updateState('ERROR - RECARGAR');
                }
            }
        };

        // v16.0: Twin-Channel Strategy
        // 1. Reliable: For clicks, keys, and setup
        this.dataChannel = this.peerConnection.createDataChannel('input', { ordered: true });

        // 2. Unreliable: Fast-Path for mouse movement (Carril Rápido)
        this.motionChannel = this.peerConnection.createDataChannel('motion', {
            ordered: false,
            maxRetransmits: 0
        });

        this.dataChannel.onopen = () => {
            console.log('[WebRTC] Control Activo (Reliable)');
            this.setupInputCapture();
            this.startPingLoop();
        };

        this.motionChannel.onopen = () => {
            console.log('[WebRTC] Control Fluido (Unreliable) Activo');
        };
    }

    startPingLoop() {
        // 1. DataChannel Heartbeat (To keep connection alive)
        setInterval(() => {
            if (this.dataChannel && this.dataChannel.readyState === 'open') {
                this.dataChannel.send(JSON.stringify({ type: 'ping', ts: performance.now() }));
            }
        }, 3000);

        // 2. High-Precision Native Metrics (The real truth)
        let lastBytesReceived = 0;
        let lastStatsTime = performance.now();

        setInterval(async () => {
            if (!this.peerConnection || this.peerConnection.connectionState !== 'connected') return;

            try {
                const stats = await this.peerConnection.getStats();
                stats.forEach(report => {
                    // Latency (RTT)
                    if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
                        if (report.currentRoundTripTime !== undefined) {
                            const rtt = Math.round(report.currentRoundTripTime * 1000);
                            if (this.latencyTarget) this.latencyTarget.innerText = rtt + ' ms';
                            const dot = document.getElementById('latency-dot');
                            if (dot) dot.style.background = rtt < 70 ? '#0f0' : (rtt < 150 ? '#ff0' : '#f00');
                        }
                    }

                    // Bitrate & FPS Calculation (v15.0)
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        const now = performance.now();
                        const bytes = report.bytesReceived;
                        const frames = report.framesDecoded;

                        if (lastBytesReceived > 0) {
                            const dt = (now - lastStatsTime) / 1000;
                            const bitrate = Math.round(((bytes - lastBytesReceived) * 8) / dt / 1000000); // Mbps
                            const fps = Math.round((frames - (this.lastFrames || 0)) / dt);

                            const stateText = document.getElementById('webrtc-state');
                            if (stateText) stateText.innerText = `CONECTADO (${bitrate} Mbps | ${fps} FPS)`;
                            this.lastFrames = frames;
                        }
                        lastBytesReceived = bytes;
                        lastStatsTime = now;
                    }
                });
            } catch (e) {
                console.warn('Stats Error:', e);
            }
        }, 2000);
    }

    async sendOffer(offer) {
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';
        await fetch(`${BACKEND_URL}/webrtc/offer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
            body: JSON.stringify({ sessionId: this.sessionId, sdp: offer })
        });
    }

    async sendIceCandidate(candidate) {
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';
        // v51: Use toJSON() for robust serialization
        const candJson = candidate.toJSON ? candidate.toJSON() : candidate;
        fetch(`${BACKEND_URL}/webrtc/ice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
            body: JSON.stringify({ sessionId: this.sessionId, candidate: candJson, isHost: false })
        }).catch(() => { });
    }

    startPolling() {
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';
        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/webrtc/poll/${this.sessionId}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                });
                if (!response.ok) return;
                const data = await response.json();
                if (data.answer && !this.peerConnection.remoteDescription) {
                    console.log('[WebRTC] Answer Received ✅');
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                }
                if (data.hostName) {
                    const label = document.getElementById('computerName');
                    if (label) label.innerText = `Conectado a ${data.hostName}`;
                }
                if (data.iceCandidates) {
                    for (const cand of data.iceCandidates) {
                        // v45: ARCHITECTURAL FILTER (Only process candidates from Host)
                        if (cand.isHost && this.peerConnection.remoteDescription) {
                            const cStr = JSON.stringify(cand);
                            if (!this.processedCands) this.processedCands = new Set();
                            if (!this.processedCands.has(cStr)) {
                                this.processedCands.add(cStr);
                                console.log('[WebRTC] Adding Host ICE Candidate:', cand.candidate);
                                try { await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) { console.warn('ICE Error:', e); }
                            }
                        }
                    }
                }
            } catch (e) { }
        }, 1000);
    }

    renderStream(stream) {
        if (this.videoElement) return;
        console.log('[WebRTC Viewer] Capturando Audio/Video Tracks:', stream.getTracks().length);

        const video = document.createElement('video');
        this.videoElement = video;
        video.srcObject = stream;
        video.autoplay = true;
        video.controls = false;
        video.setAttribute('playsinline', '');

        // v17.0: GPU-DIRECT RENDERING
        video.style.position = 'absolute';
        video.style.top = '0'; video.style.left = '0';
        video.style.width = '100%'; video.style.height = '100%';
        video.style.objectFit = 'contain'; // v17.2: Reverted to 'contain' for correct aspect ratio
        video.style.backgroundColor = 'black';
        video.style.zIndex = '0';
        this.canvas.style.display = 'none'; // Hide canvas

        // V115: Start MUTED for autoplay compliance, then unmute on first interaction
        video.muted = true;
        video.volume = 1.0;

        // V115: Auto-unmute on first user interaction (click anywhere)
        const autoUnmute = () => {
            if (this.videoElement && this.videoElement.muted) {
                this.videoElement.muted = false;
                this.videoElement.play().catch(() => { });
                console.log('[WebRTC] V115: Auto-unmuted on user interaction');
            }
            document.removeEventListener('click', autoUnmute);
            document.removeEventListener('keydown', autoUnmute);
        };
        document.addEventListener('click', autoUnmute, { once: true });
        document.addEventListener('keydown', autoUnmute, { once: true });

        const container = document.getElementById('webrtc-view');
        container.appendChild(video);

        // V106: Persistent Header Status Logic
        const statusEl = document.getElementById('gaming-status');
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === video) {
                if (statusEl) {
                    statusEl.innerText = '🔥 MODO GAMING ACTIVO (CTRL+CLICK SALIR)';
                    statusEl.style.color = '#0f0'; // Green when active
                }
            } else {
                if (statusEl) {
                    statusEl.innerText = '🎮 PARA JUGAR: CTRL + CLICK';
                    statusEl.style.color = '#fbbf24'; // Yellow waiting
                }
            }
        });


        // v17.9: Full-Screen Optimization
        // v17.9: Full-Screen Optimization
        document.addEventListener('fullscreenchange', () => {
            // Force video to cover/contain better in fullscreen
            if (document.fullscreenElement) {
                video.style.objectFit = 'contain';
            }
        });

        // V96: REVERT TO DIRECT VIDEO BINDING (Exact V88 Replica)
        this.attachInputListeners(video);


        video.onloadedmetadata = () => {
            this.hostRes = { w: video.videoWidth, h: video.videoHeight };
        };

        const render = () => {
            if (video.readyState >= 2) {
                this.lastFrameTime = performance.now(); // Watchdog
            }
            if (this.peerConnection) requestAnimationFrame(render);
        };
        requestAnimationFrame(render);

        // FREEZE WATCHDOG (v13.0)
        this.lastFrameTime = performance.now();
        this.freezeCheck = setInterval(() => {
            if (this.peerConnection?.connectionState === 'connected' &&
                performance.now() - this.lastFrameTime > 3000) {
                console.warn('[WebRTC] Freeze Detectado! Intentando recuperar...');
                video.play().catch(e => console.error('Recovery failed:', e));
                this.lastFrameTime = performance.now(); // Reset to avoid loop
            }
        }, 3000);

        video.play().catch(() => { });

        // v16.0: Low Latency Playout Hint
        if ('playoutDelayHint' in video) {
            video.playoutDelayHint = 0;
        }

        // v50: BLACK SCREEN DEBUGGER
        setInterval(() => {
            if (this.videoElement) {
                console.log(`[Video Status] Res: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight} | State: ${this.videoElement.readyState} | Paused: ${this.videoElement.paused} | Muted: ${this.videoElement.muted}`);
            }
        }, 2000);
    }

    setupInputCapture() {
        // V118: Prevent duplicate listener registration on reconnect
        if (this._inputCaptureInitialized) return;
        this._inputCaptureInitialized = true;

        // V93: MOVED TO attachInputListeners()
        // Kept empty or used for global keyboard hooks only
        // V116: ESC works like normal key (no double-tap exit)
        // Gaming mode exit is now only via Ctrl+Click

        const handleKey = (e) => {
            // V119: Track key state to avoid duplicate DOWN events for held keys
            if (!this._keyState) this._keyState = {};

            const key = e.code;
            const isDown = e.type === 'keydown';

            // Skip duplicate DOWN events (key already held)
            if (isDown && this._keyState[key]) return;
            // Skip UP event if key wasn't tracked as down
            if (!isDown && !this._keyState[key]) return;

            // Update state
            this._keyState[key] = isDown;

            // V117: Debug logging for modifier keys
            if (e.code.includes('Shift') || e.code.includes('Control') || e.code.includes('Alt') || e.code.includes('Meta')) {
                console.log(`[KEY MODIFIER] ${e.type}: ${e.code} (state: ${isDown ? 'held' : 'released'})`);
            }

            // V117: Always prevent default for gaming keys to avoid local actions
            const blockedKeys = ['Escape', 'MetaLeft', 'MetaRight', 'Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
            if (blockedKeys.includes(e.code) || document.pointerLockElement) {
                e.preventDefault();
            }

            // V117: Special handling for Windows key - must block + send
            if (e.code === 'MetaLeft' || e.code === 'MetaRight') {
                const vkCode = e.code === 'MetaLeft' ? 0x5B : 0x5C;
                this.sendInput({ type: e.type, vkCode });
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const vkCode = this.getWin32VK(e.code);
            if (vkCode) {
                this.sendInput({ type: e.type, vkCode });
            }
        };
        console.log('[V118-FIX] Keyboard listeners registered (SINGLE INSTANCE)');
        window.addEventListener('keydown', handleKey);
        window.addEventListener('keyup', handleKey);

        // 4. HID/Gamepad Scanner (Freedom Mode)
        this.startGamepadLoop();
    }

    attachInputListeners(target) {
        console.log('[WebRTC Viewer] Attaching Input Listeners to:', target.tagName);

        let lastMove = 0;
        const handleMouse = (e, type) => {

            // V89: 3D GAMING MODE (Relative Deltas)
            if (type === 'mousemove' && document.pointerLockElement === target) {
                const now = performance.now();
                if (now - lastMove < 8) return;
                lastMove = now;
                this.sendInput({ type, isRelative: true, dx: e.movementX, dy: e.movementY });
                return;
            }

            if (type === 'mousemove') {
                const now = performance.now();
                if (now - lastMove < 8) return; // v17.1: Higher frequency for mouse (125Hz)
                lastMove = now;
            }

            const rect = target.getBoundingClientRect();
            // v17.2: PRECISION COORDINATE MAPPING (Standard Desktop Mode)
            // Fix: Use videoWidth from element if available
            const videoWidth = this.videoElement ? this.videoElement.videoWidth : (this.hostRes.w || 1920);
            const videoHeight = this.videoElement ? this.videoElement.videoHeight : (this.hostRes.h || 1080);
            const videoAspect = videoWidth / videoHeight;
            const containerAspect = rect.width / rect.height;

            let actualWidth, actualHeight, offsetX, offsetY;

            if (containerAspect > videoAspect) {
                actualHeight = rect.height;
                actualWidth = actualHeight * videoAspect;
                offsetX = (rect.width - actualWidth) / 2;
                offsetY = 0;
            } else {
                actualWidth = rect.width;
                actualHeight = actualWidth / videoAspect;
                offsetX = 0;
                offsetY = (rect.height - actualHeight) / 2;
            }

            const mouseX = e.clientX - rect.left - offsetX;
            const mouseY = e.clientY - rect.top - offsetY;

            if (actualWidth > 0 && actualHeight > 0) {
                const px = Math.max(0, Math.min(1, mouseX / actualWidth));
                const py = Math.max(0, Math.min(1, mouseY / actualHeight));
                this.sendInput({ type, px, py, button: e.button === 0 ? 'left' : 'right' });
            }
        };

        target.addEventListener('mousemove', (e) => handleMouse(e, 'mousemove'));
        target.addEventListener('mousedown', (e) => handleMouse(e, 'mousedown'));
        target.addEventListener('mouseup', (e) => handleMouse(e, 'mouseup'));
        target.addEventListener('click', (e) => {
            if (this.videoElement && this.videoElement.muted) {
                this.unmute();
            }
            // V116: CTRL + CLICK TOGGLE for Gaming Mode (enter AND exit)
            if (e.ctrlKey) {
                if (document.pointerLockElement) {
                    // Currently in gaming mode - EXIT
                    document.exitPointerLock();
                    console.log('[WebRTC] V116: Gaming mode EXITED via Ctrl+Click');
                } else {
                    // Not in gaming mode - ENTER
                    target.requestPointerLock().catch(() => { });
                    if (navigator.keyboard && navigator.keyboard.lock) {
                        // V117: Lock more system keys for gaming
                        navigator.keyboard.lock(['Escape', 'Tab', 'MetaLeft', 'MetaRight', 'F11']).catch(() => { });
                    }
                    console.log('[WebRTC] V116: Gaming mode ENTERED via Ctrl+Click');
                }
            }
        });
        target.addEventListener('contextmenu', (e) => e.preventDefault());

        // 2. Mouse Wheel (Universal Scroll)
        target.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.sendInput({ type: 'wheel', deltaY: e.deltaY });
        }, { passive: false });
    }

    getWin32VK(code) {
        const mapping = {
            'KeyA': 0x41, 'KeyB': 0x42, 'KeyC': 0x43, 'KeyD': 0x44, 'KeyE': 0x45, 'KeyF': 0x46, 'KeyG': 0x47, 'KeyH': 0x48, 'KeyI': 0x49, 'KeyJ': 0x4A, 'KeyK': 0x4B, 'KeyL': 0x4C, 'KeyM': 0x4D, 'KeyN': 0x4E, 'KeyO': 0x4F, 'KeyP': 0x50, 'KeyQ': 0x51, 'KeyR': 0x52, 'KeyS': 0x53, 'KeyT': 0x54, 'KeyU': 0x55, 'KeyV': 0x56, 'KeyW': 0x57, 'KeyX': 0x58, 'KeyY': 0x59, 'KeyZ': 0x5A,
            'Digit0': 0x30, 'Digit1': 0x31, 'Digit2': 0x32, 'Digit3': 0x33, 'Digit4': 0x34, 'Digit5': 0x35, 'Digit6': 0x36, 'Digit7': 0x37, 'Digit8': 0x38, 'Digit9': 0x39,
            'Enter': 0x0D, 'Escape': 0x1B, 'Space': 0x20, 'Tab': 0x09, 'Backspace': 0x08, 'Delete': 0x2E,
            'ArrowLeft': 0x25, 'ArrowUp': 0x26, 'ArrowRight': 0x27, 'ArrowDown': 0x28,
            'ControlLeft': 0x11, 'ControlRight': 0x11, 'ShiftLeft': 0x10, 'ShiftRight': 0x10, 'AltLeft': 0x12, 'AltRight': 0x12,
            // V117: Windows key (Meta) and more keys
            'MetaLeft': 0x5B, 'MetaRight': 0x5C, // Windows keys
            'CapsLock': 0x14, 'NumLock': 0x90, 'ScrollLock': 0x91,
            'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73, 'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77, 'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B,
            'Insert': 0x2D, 'Home': 0x24, 'End': 0x23, 'PageUp': 0x21, 'PageDown': 0x22,
            'Numpad0': 0x60, 'Numpad1': 0x61, 'Numpad2': 0x62, 'Numpad3': 0x63, 'Numpad4': 0x64, 'Numpad5': 0x65, 'Numpad6': 0x66, 'Numpad7': 0x67, 'Numpad8': 0x68, 'Numpad9': 0x69,
            'NumpadMultiply': 0x6A, 'NumpadAdd': 0x6B, 'NumpadSubtract': 0x6D, 'NumpadDecimal': 0x6E, 'NumpadDivide': 0x6F, 'NumpadEnter': 0x0D,
            'Minus': 0xBD, 'Equal': 0xBB, 'BracketLeft': 0xDB, 'BracketRight': 0xDD, 'Backslash': 0xDC, 'Backquote': 0xC0,
            'Period': 0xBE, 'Comma': 0xBC, 'Slash': 0xBF, 'Semicolon': 0xBA, 'Quote': 0xDE
        };
        return mapping[code] || null;
    }

    startGamepadLoop() {
        setInterval(() => {
            const gamepads = navigator.getGamepads();
            for (const gp of gamepads) {
                if (!gp || !gp.connected) continue;

                if (!window._gpDetected) {
                    console.log("🎮 Gamepad detected:", gp.id);
                    window._gpDetected = true;
                }

                // V118: Send full gamepad state for high-fidelity Xbox simulation
                // Capture all axes and button values (including pressure)
                const state = {
                    type: 'gamepad',
                    index: gp.index,
                    axes: gp.axes,
                    buttons: gp.buttons.map(b => ({
                        pressed: b.pressed,
                        value: b.value
                    }))
                };

                this.sendInput(state);
            }
        }, 16); // ~60fps polling for responsive gaming
    }

    sendInput(data) {
        // v16.0: Route motion to unreliable channel for zero lag
        const channel = (data.type === 'mousemove') ? this.motionChannel : this.dataChannel;

        if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify(data));
        } else if (this.dataChannel && this.dataChannel.readyState === 'open') {
            // Fallback to reliable
            this.dataChannel.send(JSON.stringify(data));
        }
    }

    toggleFullscreen() {
        const container = document.getElementById('webrtc-view') || this.canvas;
        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen();
        }
    }

    disconnect() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        if (this.freezeCheck) clearInterval(this.freezeCheck);
        if (this.peerConnection) {
            this.peerConnection.onconnectionstatechange = null;
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement.pause();
            this.videoElement.remove();
            this.videoElement = null;
        }
    }

    // V109: IMPROVED UNMUTE WITH LOGGING
    unmute() {
        if (this.videoElement) {
            console.log('[WebRTC Viewer] Attempting unmute... Current muted:', this.videoElement.muted);
            this.videoElement.muted = false;
            this.videoElement.volume = 1.0; // V109: Force full volume
            this.videoElement.play().catch((e) => {
                console.error('[WebRTC Viewer] Play failed:', e);
            });
            console.log('[WebRTC Viewer] Audio Unmuted! New muted state:', this.videoElement.muted, 'Volume:', this.videoElement.volume);
        } else {
            console.warn('[WebRTC Viewer] unmute() called but no video element!');
        }
    }

    // V109: Toggle audio for button
    toggleAudio() {
        if (this.videoElement) {
            this.videoElement.muted = !this.videoElement.muted;
            if (!this.videoElement.muted) {
                this.videoElement.volume = 1.0;
                this.videoElement.play().catch(() => { });
            }
            return !this.videoElement.muted; // Returns true if now playing audio
        }
        return false;
    }
}

window.WebRTCViewer = WebRTCViewer;
