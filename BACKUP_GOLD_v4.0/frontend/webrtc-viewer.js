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
        const response = await fetch(`${BACKEND_URL}/webrtc/session/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ bookingId: this.booking.id })
        });
        const data = await response.json();
        this.sessionId = data.sessionId;
    }

    async initPeerConnection() {
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }]
        });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) this.sendIceCandidate(event.candidate);
        };

        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC Viewer] Video Track Detectado ✅');
            this.renderStream(event.streams[0]);
        };

        this.peerConnection.onconnectionstatechange = () => {
            this.updateState(this.peerConnection.connectionState.toUpperCase());
        };

        this.dataChannel = this.peerConnection.createDataChannel('input');
        this.dataChannel.onopen = () => {
            console.log('[WebRTC] Control Activo');
            this.setupInputCapture();
            this.startPingLoop();
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
        setInterval(async () => {
            if (!this.peerConnection || this.peerConnection.connectionState !== 'connected') return;

            try {
                const stats = await this.peerConnection.getStats();
                stats.forEach(report => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
                        if (report.currentRoundTripTime !== undefined) {
                            const rtt = Math.round(report.currentRoundTripTime * 1000);

                            // Update UI with the REAL network truth
                            if (this.latencyTarget) this.latencyTarget.innerText = rtt + ' ms';
                            const dot = document.getElementById('latency-dot');
                            if (dot) {
                                dot.style.background = rtt < 70 ? '#0f0' : (rtt < 150 ? '#ff0' : '#f00');
                            }
                        }
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
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                }
                if (data.iceCandidates) {
                    for (const cand of data.iceCandidates) {
                        if (this.peerConnection.remoteDescription) {
                            try { await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) { }
                        }
                    }
                }
            } catch (e) { }
        }, 1000);
    }

    renderStream(stream) {
        if (this.videoElement) return;
        const video = document.createElement('video');
        this.videoElement = video;
        video.srcObject = stream;
        video.autoplay = true; video.muted = true; video.setAttribute('playsinline', '');
        video.style.display = 'none';
        document.body.appendChild(video);

        video.onloadedmetadata = () => {
            this.canvas.width = video.videoWidth; this.canvas.height = video.videoHeight;
        };

        const render = () => {
            if (video.readyState >= 2) {
                if (this.canvas.width !== video.videoWidth || this.canvas.height !== video.videoHeight) {
                    this.canvas.width = video.videoWidth; this.canvas.height = video.videoHeight;
                }
                this.ctx.drawImage(video, 0, 0);
            }
            if (this.peerConnection) requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
        video.play().catch(() => { });
    }

    setupInputCapture() {
        const handle = (e, type) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * this.hostRes.w;
            const y = ((e.clientY - rect.top) / rect.height) * this.hostRes.h;
            this.sendInput({ type, x, y, button: e.button === 0 ? 'left' : 'right' });
        };
        this.canvas.addEventListener('mousemove', (e) => handle(e, 'mousemove'));
        this.canvas.addEventListener('mousedown', (e) => handle(e, 'mousedown'));
        this.canvas.addEventListener('mouseup', (e) => handle(e, 'mouseup'));
    }

    sendInput(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(data));
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) { this.canvas.requestFullscreen().catch(() => { }); }
        else { document.exitFullscreen(); }
    }

    disconnect() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        if (this.peerConnection) { this.peerConnection.close(); this.peerConnection = null; }
        if (this.videoElement) { this.videoElement.srcObject = null; this.videoElement.remove(); this.videoElement = null; }
    }
}

window.WebRTCViewer = WebRTCViewer;
