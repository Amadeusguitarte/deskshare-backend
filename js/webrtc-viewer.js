// ========================================
// WebRTC Viewer Module
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
    }

    async connect() {
        console.log('[WebRTC Viewer] Starting connection...');

        try {
            // 1. Create WebRTC session
            await this.createSession();

            // 2. Initialize peer connection
            await this.initPeerConnection();

            // 3. Create offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // 4. Send offer to host via backend
            await this.sendOffer(offer);

            // 5. Start polling for answer and ICE candidates
            this.startPolling();

            console.log('[WebRTC Viewer] Connection process started');
        } catch (e) {
            console.error('[WebRTC Viewer] Connection failed:', e);
            throw e;
        }
    }

    async createSession() {
        // Hardcoded Backend for Production (Railway)
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';

        const response = await fetch(`${BACKEND_URL}/webrtc/session/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}` // Fix: use correct token key
            },
            body: JSON.stringify({
                bookingId: this.booking.id
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create WebRTC session');
        }

        const data = await response.json();
        this.sessionId = data.sessionId;
        console.log('[WebRTC Viewer] Session created:', this.sessionId);
    }

    initPeerConnection() {
        const config = {
            iceServers: [
                {
                    urls: [
                        'stun:stun.l.google.com:19302',
                        'stun:stun1.l.google.com:19302'
                    ]
                }
            ]
        };

        this.peerConnection = new RTCPeerConnection(config);

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('[WebRTC Viewer] New ICE candidate');
                this.sendIceCandidate(event.candidate);
            }
        };

        // Handle incoming stream
        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC Viewer] Received remote stream');
            const stream = event.streams[0];
            this.renderStream(stream);
        };

        // Connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('[WebRTC Viewer] Connection state:', this.peerConnection.connectionState);

            if (this.peerConnection.connectionState === 'connected') {
                console.log('[WebRTC Viewer] P2P connection established!');
                this.onConnected();
            } else if (this.peerConnection.connectionState === 'failed') {
                console.error('[WebRTC Viewer] Connection failed');
                this.onDisconnected();
            }
        };

        // Create data channel for sending input
        this.dataChannel = this.peerConnection.createDataChannel('input');
        this.dataChannel.onopen = () => {
            console.log('[WebRTC Viewer] Data channel opened');
            this.setupInputCapture();
        };

        return this.peerConnection;
    }

    async sendOffer(offer) {
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';
        const response = await fetch(`${BACKEND_URL}/webrtc/offer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                sessionId: this.sessionId,
                sdp: offer
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send offer');
        }

        console.log('[WebRTC Viewer] Offer sent to host');
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
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    candidate,
                    isHost: false
                })
            });
        } catch (e) {
            console.error('[WebRTC Viewer] Failed to send ICE candidate:', e);
        }
    }

    startPolling() {
        const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app/api';
        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/webrtc/poll/${this.sessionId}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    }
                });

                if (!response.ok) {
                    console.warn('[WebRTC Viewer] Poll failed, session may be closed');
                    this.disconnect();
                    return;
                }

                const data = await response.json();

                // Check for host's answer
                if (data.answer && !this.peerConnection.remoteDescription) {
                    console.log('[WebRTC Viewer] Received answer from host');
                    await this.peerConnection.setRemoteDescription(
                        new RTCSessionDescription(data.answer)
                    );
                }

                // Add ICE candidates from host
                if (data.iceCandidates && data.iceCandidates.length > 0) {
                    for (const candidate of data.iceCandidates) {
                        if (!this.peerConnection.remoteDescription) continue;
                        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                }

            } catch (e) {
                console.error('[WebRTC Viewer] Poll error:', e);
            }
        }, 1000); // Poll every second
    }

    renderStream(stream) {
        // Create video element to receive stream
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.style.display = 'none';

        document.body.appendChild(video);

        // Render video frames to canvas
        const renderFrame = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                this.canvas.width = video.videoWidth;
                this.canvas.height = video.videoHeight;
                this.ctx.drawImage(video, 0, 0);
            }
            requestAnimationFrame(renderFrame);
        };

        video.onplay = () => {
            renderFrame();
        };
    }

    setupInputCapture() {
        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
            const y = ((e.clientY - rect.top) / rect.height) * this.canvas.height;

            this.sendInput({ type: 'mousemove', x, y });
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.sendInput({ type: 'mousedown', button: e.button === 0 ? 'left' : 'right' });
        });

        this.canvas.addEventListener('mouseup', (e) => {
            this.sendInput({ type: 'mouseup', button: e.button === 0 ? 'left' : 'right' });
        });

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (this.isCanvasFocused()) {
                e.preventDefault();
                this.sendInput({ type: 'keydown', key: e.key });
            }
        });

        document.addEventListener('keyup', (e) => {
            if (this.isCanvasFocused()) {
                e.preventDefault();
                this.sendInput({ type: 'keyup', key: e.key });
            }
        });
    }

    sendInput(input) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(input));
        }
    }

    isCanvasFocused() {
        return document.activeElement === this.canvas ||
            this.canvas.contains(document.activeElement);
    }

    onConnected() {
        console.log('[WebRTC Viewer] Successfully connected!');
        // Update UI to show connected state
        const statusEl = document.getElementById('connection-status');
        if (statusEl) statusEl.textContent = 'Conectado vía WebRTC P2P';
    }

    onDisconnected() {
        console.log('[WebRTC Viewer] Disconnected');
        this.disconnect();
        // Fallback to Guacamole
        alert('Conexión WebRTC falló. Cambiando a modo Nativo...');
        switchMode('native');
    }

    disconnect() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        console.log('[WebRTC Viewer] Disconnected and cleaned up');
    }
}

// Export for use in remote-access.html
window.WebRTCViewer = WebRTCViewer;
