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

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // console.log('[WebRTC] Local Candidate:', event.candidate.candidate);
                this.sendIceCandidate(event.candidate);
            }
        };

        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC Viewer] Track Detectado:', event.track.kind, '✅');

            // v49: FORCE UI UNLOCK (Fix for "Negociando" Forever)
            const statusPanel = document.getElementById('connection-status');
            if (statusPanel) statusPanel.style.display = 'none';
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

        this.peerConnection.onconnectionstatechange = () => {
            this.updateState(this.peerConnection.connectionState.toUpperCase());
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
        fetch(`${BACKEND_URL}/webrtc/ice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
            body: JSON.stringify({ sessionId: this.sessionId, candidate, isHost: false })
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

        // v11.0: Start MUTED to ensure autoplay (No Image Fix)
        video.muted = true;
        const container = document.getElementById('webrtc-view');
        if (container) {
            container.appendChild(video);
            // v17.5: Ensure UI panel stays on top
            const statusPanel = document.getElementById('connection-status');
            if (statusPanel) statusPanel.style.zIndex = '100';

            // v17.9: Full-Screen UI Auto-Hide
            document.addEventListener('fullscreenchange', () => {
                if (statusPanel) {
                    statusPanel.style.display = document.fullscreenElement ? 'none' : 'flex';
                }
                // Force video to cover/contain better in fullscreen
                if (document.fullscreenElement) {
                    video.style.objectFit = 'contain';
                }
            });
        } else {
            document.body.appendChild(video);
        }

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
    }

    setupInputCapture() {
        // 1. Mouse Movement & Clicks
        let lastMove = 0;
        const handleMouse = (e, type) => {
            if (type === 'mousemove') {
                const now = performance.now();
                if (now - lastMove < 8) return; // v17.1: Higher frequency for mouse (125Hz)
                lastMove = now;
            }

            // v17.2: PRECISION COORDINATE MAPPING (Handles letterboxing/contain)
            const target = this.videoElement || this.canvas;
            const rect = target.getBoundingClientRect();

            const videoWidth = this.hostRes.w || 1920;
            const videoHeight = this.hostRes.h || 1080;
            const videoAspect = videoWidth / videoHeight;
            const containerAspect = rect.width / rect.height;

            let actualWidth, actualHeight, offsetX, offsetY;

            if (containerAspect > videoAspect) {
                // Pillarbox (black bars on sides)
                actualHeight = rect.height;
                actualWidth = actualHeight * videoAspect;
                offsetX = (rect.width - actualWidth) / 2;
                offsetY = 0;
            } else {
                // Letterbox (black bars on top/bottom)
                actualWidth = rect.width;
                actualHeight = actualWidth / videoAspect;
                offsetX = 0;
                offsetY = (rect.height - actualHeight) / 2;
            }

            const mouseX = e.clientX - rect.left - offsetX;
            const mouseY = e.clientY - rect.top - offsetY;

            // v17.9: PERCENTAGE-BASED MAPPING (Ultra-Precise)
            if (actualWidth > 0 && actualHeight > 0) {
                const px = Math.max(0, Math.min(1, mouseX / actualWidth));
                const py = Math.max(0, Math.min(1, mouseY / actualHeight));
                this.sendInput({ type, px, py, button: e.button === 0 ? 'left' : 'right' });
            }
        };
        // Use video for tracking instead of canvas
        const target = this.videoElement || this.canvas;
        target.addEventListener('mousemove', (e) => handleMouse(e, 'mousemove'));
        target.addEventListener('mousedown', (e) => handleMouse(e, 'mousedown'));
        target.addEventListener('mouseup', (e) => handleMouse(e, 'mouseup'));
        target.addEventListener('click', () => {
            if (this.videoElement && this.videoElement.muted) {
                this.unmute();
            }
        });
        target.addEventListener('contextmenu', (e) => e.preventDefault());

        // 2. Mouse Wheel (Universal Scroll)
        target.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.sendInput({ type: 'wheel', deltaY: e.deltaY });
        }, { passive: false });

        // 3. Universal Keyboard Interceptor
        const handleKey = (e) => {
            // Prevent system shortcuts while focused (F5, Ctrl+R, etc)
            if (e.ctrlKey || e.metaKey || e.code === 'F5') {
                // Keep some keys for escape
            } else {
                e.preventDefault();
            }

            const vkCode = this.getWin32VK(e.code);
            if (vkCode) {
                this.sendInput({ type: e.type, vkCode });
            }
        };
        window.addEventListener('keydown', handleKey);
        window.addEventListener('keyup', handleKey);

        // 4. HID/Gamepad Scanner (Freedom Mode)
        this.startGamepadLoop();
    }

    getWin32VK(code) {
        const mapping = {
            'KeyA': 0x41, 'KeyB': 0x42, 'KeyC': 0x43, 'KeyD': 0x44, 'KeyE': 0x45, 'KeyF': 0x46, 'KeyG': 0x47, 'KeyH': 0x48, 'KeyI': 0x49, 'KeyJ': 0x4A, 'KeyK': 0x4B, 'KeyL': 0x4C, 'KeyM': 0x4D, 'KeyN': 0x4E, 'KeyO': 0x4F, 'KeyP': 0x50, 'KeyQ': 0x51, 'KeyR': 0x52, 'KeyS': 0x53, 'KeyT': 0x54, 'KeyU': 0x55, 'KeyV': 0x56, 'KeyW': 0x57, 'KeyX': 0x58, 'KeyY': 0x59, 'KeyZ': 0x5A,
            'Digit0': 0x30, 'Digit1': 0x31, 'Digit2': 0x32, 'Digit3': 0x33, 'Digit4': 0x34, 'Digit5': 0x35, 'Digit6': 0x36, 'Digit7': 0x37, 'Digit8': 0x38, 'Digit9': 0x39,
            'Enter': 0x0D, 'Escape': 0x1B, 'Space': 0x20, 'Tab': 0x09, 'Backspace': 0x08, 'Delete': 0x2E,
            'ArrowLeft': 0x25, 'ArrowUp': 0x26, 'ArrowRight': 0x27, 'ArrowDown': 0x28,
            'ControlLeft': 0x11, 'ControlRight': 0x11, 'ShiftLeft': 0x10, 'ShiftRight': 0x10, 'AltLeft': 0x12, 'AltRight': 0x12,
            'Period': 0xBE, 'Comma': 0xBC, 'Slash': 0xBF, 'Semicolon': 0xBA, 'Quote': 0xDE
        };
        return mapping[code] || null;
    }

    startGamepadLoop() {
        setInterval(() => {
            const gamepads = navigator.getGamepads();
            for (const gp of gamepads) {
                if (!gp) continue;
                // Simple mapping: Left stick moves mouse, Button 0 is Click
                const deadzone = 0.2;
                if (Math.abs(gp.axes[0]) > deadzone || Math.abs(gp.axes[1]) > deadzone) {
                    // This is handled by a local cursor or mapped to deltas
                    // For now, let's notify the agent of raw gamepad data
                    this.sendInput({ type: 'gamepad', axes: gp.axes, buttons: gp.buttons.map(b => b.pressed) });
                }
            }
        }, 50);
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

    // EXPOSE UNMUTE FOR UI
    unmute() {
        if (this.videoElement) {
            this.videoElement.muted = false;
            this.videoElement.play().catch(() => { });
            console.log('[WebRTC Viewer] Audio Unmuted via Interaction');
        }
    }
}

window.WebRTCViewer = WebRTCViewer;
