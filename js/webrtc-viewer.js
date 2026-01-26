// ========================================
// WebRTC Viewer Module (v3.0-HighPerf)
// Client-side WebRTC receiver with 60FPS support
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
        this.hostRes = { w: 1920, h: 1080 }; // Default, updated on init

        // Hide local cursor on the viewer
        this.canvas.style.cursor = 'none';
    }

    updateState(msg) {
        if (this.stateTarget) this.stateTarget.innerText = msg;
    }

    async connect() {
        this.updateState('Iniciando...');
        try {
            await this.createSession();
            await this.initPeerConnection();

            // Request video at 60FPS
            this.peerConnection.addTransceiver('video', { direction: 'recvonly' });

            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            await this.sendOffer(offer);
            this.startPolling();
            this.updateState('Negociando...');
        } catch (e) {
            this.updateState('Error: ' + e.message);
            throw e;
        }
    }

    async createSession() {
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';
        const response = await fetch(`${BACKEND_URL}/webrtc/session/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ bookingId: this.booking.id })
        });
        if (!response.ok) throw new Error('Falló al crear sesión WebRTC');
        const data = await response.json();
        this.sessionId = data.sessionId;
    }

    async initPeerConnection() {
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(config);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) this.sendIceCandidate(event.candidate);
        };

        this.peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                this.renderStream(event.streams[0]);
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            this.updateState(state.toUpperCase());
            if (state === 'connected') this.onConnected();
        };

        this.dataChannel = this.peerConnection.createDataChannel('input');
        this.dataChannel.onopen = () => {
            console.log('[WebRTC] Data channel OPEN');
            this.setupInputCapture();
            this.startLatencyMonitor();
        };

        this.dataChannel.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'init-host') {
                this.hostRes = data.res;
                console.log('[WebRTC] Host Resolution Synced:', this.hostRes);
            } else if (data.type === 'pong') {
                const latency = Date.now() - data.ts;
                if (this.latencyTarget) this.latencyTarget.innerText = latency + ' ms';
                this.updateLatencyDot(latency);
            }
        };
    }

    updateLatencyDot(ms) {
        const dot = document.getElementById('latency-dot');
        if (!dot) return;
        if (ms < 50) dot.style.background = '#00ff00';
        else if (ms < 150) dot.style.background = '#ffff00';
        else dot.style.background = '#ff4444';
    }

    startLatencyMonitor() {
        setInterval(() => {
            if (this.dataChannel.readyState === 'open') {
                this.dataChannel.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
            }
        }, 1000);
    }

    async sendOffer(offer) {
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';
        await fetch(`${BACKEND_URL}/webrtc/offer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ sessionId: this.sessionId, sdp: offer })
        });
    }

    async sendIceCandidate(candidate) {
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';
        try {
            await fetch(`${BACKEND_URL}/webrtc/ice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ sessionId: this.sessionId, candidate, isHost: false })
            });
        } catch (e) { }
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
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                }
                if (data.iceCandidates) {
                    for (const candidate of data.iceCandidates) {
                        try {
                            if (this.peerConnection.remoteDescription) {
                                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                            }
                        } catch (e) { }
                    }
                }
            } catch (e) { }
        }, 800);
    }

    renderStream(stream) {
        if (this.videoElement) return;
        const video = document.createElement('video');
        this.videoElement = video;
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.setAttribute('playsinline', '');
        video.style.display = 'none';
        document.body.appendChild(video);

        console.log('[WebRTC Viewer] Started 60FPS Render Loop');
        const renderFrame = () => {
            if (video.readyState >= 2) {
                if (this.canvas.width !== video.videoWidth || this.canvas.height !== video.videoHeight) {
                    this.canvas.width = video.videoWidth;
                    this.canvas.height = video.videoHeight;
                }
                this.ctx.drawImage(video, 0, 0);
            }
            if (this.peerConnection) requestAnimationFrame(renderFrame);
        };
        requestAnimationFrame(renderFrame);
    }

    setupInputCapture() {
        const sendPos = (e, type) => {
            const rect = this.canvas.getBoundingClientRect();
            // Map canvas relative pixels to host physical pixels
            const x = ((e.clientX - rect.left) / rect.width) * this.hostRes.w;
            const y = ((e.clientY - rect.top) / rect.height) * this.hostRes.h;

            if (type === 'mousemove') {
                this.sendInput({ type: 'mousemove', x, y });
            } else {
                this.sendInput({ type, x, y, button: e.button === 0 ? 'left' : 'right' });
            }
        };

        this.canvas.addEventListener('mousemove', (e) => sendPos(e, 'mousemove'));
        this.canvas.addEventListener('mousedown', (e) => sendPos(e, 'mousedown'));
        this.canvas.addEventListener('mouseup', (e) => sendPos(e, 'mouseup'));
    }

    sendInput(input) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(input));
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.canvas.requestFullscreen().catch(err => {
                alert(`Error al entrar en pantalla completa: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    onConnected() {
        this.updateState('CONECTADO ✅');
        if (this.stateTarget) this.stateTarget.style.color = '#0f0';
    }

    disconnect() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        if (this.peerConnection) { this.peerConnection.close(); this.peerConnection = null; }
        if (this.videoElement) { this.videoElement.srcObject = null; this.videoElement.remove(); this.videoElement = null; }
    }
}

window.WebRTCViewer = WebRTCViewer;
