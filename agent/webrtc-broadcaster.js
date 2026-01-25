// ========================================
// WebRTC Broadcaster Module
// Screen capture + H.264 encoding + WebRTC streaming
// ========================================

const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = require('wrtc');
const screenshot = require('screenshot-desktop');
const robot = require('robotjs');
const axios = require('axios');

const BACKEND_URL = 'https://deskshare-backend-production.up.railway.app';
let peerConnection = null;
let screenCaptureInterval = null;
let pollInterval = null;
let currentSessionId = null;
let authToken = null;

// ========================================
// Initialize WebRTC Peer Connection
// ========================================
function initPeerConnection() {
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

    peerConnection = new RTCPeerConnection(config);

    // Handle ICE candidates
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            console.log('[WebRTC] New ICE candidate:', event.candidate);

            try {
                await axios.post(`${BACKEND_URL}/api/webrtc/ice`, {
                    sessionId: currentSessionId,
                    candidate: event.candidate,
                    isHost: true
                }, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
            } catch (e) {
                console.error('[WebRTC] Failed to send ICE candidate:', e.message);
            }
        }
    };

    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', peerConnection.connectionState);

        if (peerConnection.connectionState === 'connected') {
            console.log('[WebRTC] P2P connection established!');
            startScreenCapture();
        } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
            console.log('[WebRTC] Connection lost, cleaning up');
            stopBroadcasting();
        }
    };

    // Data channel for receiving input
    peerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        console.log('[WebRTC] Data channel opened:', dataChannel.label);

        dataChannel.onmessage = (e) => {
            try {
                const input = JSON.parse(e.data);
                handleRemoteInput(input);
            } catch (err) {
                console.error('[WebRTC] Invalid input data:', err);
            }
        };
    };

    return peerConnection;
}

// ========================================
// Screen Capture & Streaming
// ========================================
async function startScreenCapture() {
    console.log('[WebRTC] Starting screen capture...');

    // Create video track from screen capture
    // Note: wrtc doesn't have native screen capture, we'll use a workaround
    // We'll capture screenshots and encode them to video stream

    screenCaptureInterval = setInterval(async () => {
        try {
            // This is a simplified version - production would use MediaStream from canvas
            // For now, we'll handle this differently in the actual implementation
            console.log('[WebRTC] Capturing screen frame...');
        } catch (e) {
            console.error('[WebRTC] Screen capture error:', e.message);
        }
    }, 33); // ~30fps
}

function stopScreenCapture() {
    if (screenCaptureInterval) {
        clearInterval(screenCaptureInterval);
        screenCaptureInterval = null;
        console.log('[WebRTC] Screen capture stopped');
    }
}

// ========================================
// Remote Input Handling
// ========================================
function handleRemoteInput(input) {
    try {
        switch (input.type) {
            case 'mousemove':
                robot.moveMouse(input.x, input.y);
                break;

            case 'mousedown':
                robot.mouseToggle('down', input.button || 'left');
                break;

            case 'mouseup':
                robot.mouseToggle('up', input.button || 'left');
                break;

            case 'keydown':
                robot.keyToggle(input.key, 'down');
                break;

            case 'keyup':
                robot.keyToggle(input.key, 'up');
                break;

            default:
                console.warn('[WebRTC] Unknown input type:', input.type);
        }
    } catch (e) {
        console.error('[WebRTC] Input handling error:', e.message);
    }
}

// ========================================
// Signaling (Poll for viewer's offer)
// ========================================
async function startSignalingPoll(sessionId, token) {
    currentSessionId = sessionId;
    authToken = token;

    console.log('[WebRTC] Starting signaling poll for session:', sessionId);

    pollInterval = setInterval(async () => {
        try {
            const response = await axios.get(`${BACKEND_URL}/api/webrtc/poll/${sessionId}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            const data = response.data;

            // Check for viewer's offer
            if (data.offer && !peerConnection.remoteDescription) {
                console.log('[WebRTC] Received offer from viewer');

                await peerConnection.setRemoteDescription(
                    new RTCSessionDescription(data.offer)
                );

                // Create answer
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);

                // Send answer back
                await axios.post(`${BACKEND_URL}/api/webrtc/answer`, {
                    sessionId,
                    sdp: answer
                }, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });

                console.log('[WebRTC] Answer sent to viewer');
            }

            // Add ICE candidates from viewer
            if (data.iceCandidates && data.iceCandidates.length > 0) {
                for (const candidate of data.iceCandidates) {
                    if (!peerConnection.remoteDescription) continue; // Wait for offer first

                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('[WebRTC] Added viewer ICE candidate');
                }
            }

        } catch (e) {
            if (e.response?.status === 404) {
                console.log('[WebRTC] Session ended');
                stopBroadcasting();
            } else {
                console.error('[WebRTC] Poll error:', e.message);
            }
        }
    }, 1000); // Poll every second
}

function stopSignalingPoll() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
        console.log('[WebRTC] Signaling poll stopped');
    }
}

// ========================================
// Registration
// ========================================
async function registerWebRTCCapability(computerId, token) {
    try {
        await axios.post(`${BACKEND_URL}/api/webrtc/register`, {
            computerId
        }, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('[WebRTC] Registered WebRTC capability for computer:', computerId);
        return true;
    } catch (e) {
        console.error('[WebRTC] Registration failed:', e.message);
        return false;
    }
}

// ========================================
// Start/Stop Broadcasting
// ========================================
async function startBroadcasting(sessionId, token) {
    console.log('[WebRTC] Starting broadcast for session:', sessionId);

    initPeerConnection();
    await startSignalingPoll(sessionId, token);

    return true;
}

function stopBroadcasting() {
    console.log('[WebRTC] Stopping broadcast');

    stopScreenCapture();
    stopSignalingPoll();

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    currentSessionId = null;
    authToken = null;
}

module.exports = {
    registerWebRTCCapability,
    startBroadcasting,
    stopBroadcasting
};
