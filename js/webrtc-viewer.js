// ========================================
// WebRTC Viewer Module (v2.2-Safe)
// Client-side WebRTC receiver with canvas rendering
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
    }

    updateState(msg) {
        if (this.stateTarget) this.stateTarget.innerText = msg;
        console.log('[WebRTC State]', msg);
    }

    async connect() {
        this.updateState('Iniciando...');
        try {
            await this.createSession();
            await this.initPeerConnection();

            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            await this.sendOffer(offer);
            this.startPolling();

            this.updateState('Handshake enviado (Polling)...');
        } catch (e) {
            this.updateState('Error: ' + e.message);
            console.error('[WebRTC Viewer] Connection failed:', e);
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
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(config);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendIceCandidate(event.candidate);
            }
        };

        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC Viewer] Stream recibido ✅');
            this.renderStream(event.streams[0]);
        };

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            this.updateState(state.toUpperCase());
            if (state === 'connected') this.onConnected();
            if (state === 'failed') this.onDisconnected();
        };

        this.dataChannel = this.peerConnection.createDataChannel('input');
        this.dataChannel.onopen = () => { this.setupInputCapture(); };
    }

    async sendOffer(offer) {
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';
        const response = await fetch(`${BACKEND_URL}/webrtc/offer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ sessionId: this.sessionId, sdp: offer })
        });
        if (!response.ok) throw new Error('Error al enviar Offer');
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
                    this.updateState('Answer recibida. Conectando P2P...');
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                }

                if (data.iceCandidates && data.iceCandidates.length > 0) {
                    for (const candidate of data.iceCandidates) {
                        try {
                            if (this.peerConnection.remoteDescription) {
                                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                            }
                        } catch (e) { }
                    }
                }
            } catch (e) { }
        }, 1000);
    }

    renderStream(stream) {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.style.display = 'none';
        document.body.appendChild(video);

        const renderFrame = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                this.canvas.width = video.videoWidth;
                this.canvas.height = video.videoHeight;
                this.ctx.drawImage(video, 0, 0);
            }
            requestAnimationFrame(renderFrame);
        };
        video.onplay = () => renderFrame();
    }

    setupInputCapture() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
            const y = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
            this.sendInput({ type: 'mousemove', x, y });
        });
        this.canvas.addEventListener('mousedown', (e) => this.sendInput({ type: 'mousedown', button: e.button === 0 ? 'left' : 'right' }));
        this.canvas.addEventListener('mouseup', (e) => this.sendInput({ type: 'mouseup', button: e.button === 0 ? 'left' : 'right' }));
    }

    sendInput(input) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(input));
        }
    }

    onConnected() {
        this.updateState('CONECTADO ✅');
        const statusEl = document.getElementById('connection-status');
        if (statusEl) statusEl.style.color = '#0f0';
    }

    onDisconnected() {
        this.updateState('FALLÓ ❌');
        this.disconnect();
    }

    disconnect() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        if (this.peerConnection) this.peerConnection.close();
        console.log('[WebRTC Viewer] Disonnected and cleaned up');
    }
}

window.WebRTCViewer = WebRTCViewer;
