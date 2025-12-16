// ========================================
// Parsec SDK Integration Module
// For future integration with Parsec Web SDK
// ========================================

/**
 * Parsec Web SDK Integration
 * 
 * This module handles the integration with Parsec's Web Client SDK.
 * Currently using manual connection flow, ready for SDK integration.
 * 
 * Parsec SDK Requirements:
 * - HTML5 <video> and <audio> elements
 * - Session ID and Peer ID from backend
 * - WebRTC support in browser
 */

class ParsecClient {
    constructor(videoElement, audioElement) {
        this.videoElement = videoElement;
        this.audioElement = audioElement;
        this.client = null;
        this.connected = false;
    }

    /**
     * Initialize Parsec Web SDK
     * To integrate real Parsec SDK:
     * 1. Include Parsec SDK script: <script src="https://parsec.app/sdk/web/parsec-sdk.js"></script>
     * 2. Replace this mock implementation with actual SDK calls
     */
    async initialize() {
        console.log('Initializing Parsec client...');

        // TODO: Replace with actual Parsec SDK initialization
        // Example (when SDK is available):
        // this.client = new ParsecSDK.Client(this.videoElement, this.audioElement);

        return true;
    }

    /**
     * Connect to Parsec host
     * @param {string} sessionId - Session ID from backend
     * @param {string} peerId - Peer ID of the host computer
     * @param {object} config - Optional configuration
     */
    async connect(sessionId, peerId, config = {}) {
        console.log(`Connecting to Parsec host...`, { sessionId, peerId });

        try {
            // TODO: Replace with actual Parsec SDK connect call
            // Example:
            // await this.client.connect(sessionId, peerId, {
            //     encoder_bitrate: config.bitrate || 10000,
            //     server_resolution_x: config.resolutionX || 1920,
            //     server_resolution_y: config.resolutionY || 1080
            // });

            // Mock connection for now
            await this.mockConnection();

            this.connected = true;
            console.log('✅ Connected to Parsec host');

            return true;

        } catch (error) {
            console.error('❌ Failed to connect to Parsec:', error);
            throw new Error('Parsec connection failed: ' + error.message);
        }
    }

    /**
     * Disconnect from Parsec host
     */
    async disconnect() {
        if (!this.connected) return;

        console.log('Disconnecting from Parsec...');

        // TODO: Replace with actual SDK disconnect
        // this.client.disconnect();

        this.connected = false;
    }

    /**
     * Send mouse input
     */
    sendMouseInput(x, y, button, pressed) {
        if (!this.connected) return;

        // TODO: Implement with SDK
        // this.client.sendMousePosition(x, y);
        // this.client.sendMouseButton(button, pressed);
    }

    /**
     * Send keyboard input
     */
    sendKeyboardInput(key, pressed) {
        if (!this.connected) return;

        // TODO: Implement with SDK
        // this.client.sendKeyboardInput(key, pressed);
    }

    /**
     * Send gamepad input
     */
    sendGamepadInput(gamepadState) {
        if (!this.connected) return;

        // TODO: Implement with SDK
        // this.client.sendGamepadState(gamepadState);
    }

    /**
     * Mock connection (for development/testing)
     */
    async mockConnection() {
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log('Mock Parsec connection established');
                resolve();
            }, 2000);
        });
    }

    /**
     * Get connection statistics
     */
    getStats() {
        // TODO: Implement with SDK
        // return this.client.getStats();

        return {
            connected: this.connected,
            latency: 0,
            bitrate: 0,
            fps: 0
        };
    }
}

/**
 * Parsec Session Manager
 * Handles session lifecycle and backend integration
 */
class ParsecSessionManager {
    constructor(bookingId) {
        this.bookingId = bookingId;
        this.parsecClient = null;
        this.sessionActive = false;
    }

    /**
     * Start Parsec session
     */
    async startSession() {
        try {
            // Get Parsec credentials from backend
            const sessionData = await this.getSessionCredentials();

            // Initialize Parsec client
            const videoEl = document.getElementById('parsecVideo');
            const audioEl = document.getElementById('parsecAudio');

            this.parsecClient = new ParsecClient(videoEl, audioEl);
            await this.parsecClient.initialize();

            // Connect to host
            await this.parsecClient.connect(
                sessionData.sessionId,
                sessionData.peerID,
                {
                    bitrate: 15000, // Kbps
                    resolutionX: 1920,
                    resolutionY: 1080
                }
            );

            this.sessionActive = true;

            // Hide instructions, show video
            document.getElementById('connectionInstructions').style.display = 'none';
            document.getElementById('parsecVideo').style.display = 'block';

            return true;

        } catch (error) {
            console.error('Failed to start Parsec session:', error);
            throw error;
        }
    }

    /**
     * End Parsec session
     */
    async endSession() {
        if (this.parsecClient) {
            await this.parsecClient.disconnect();
        }
        this.sessionActive = false;
    }

    /**
     * Get session credentials from backend
     */
    async getSessionCredentials() {
        // This would call your backend API
        const response = await fetch(`${API_BASE_URL}/bookings/${this.bookingId}/parsec-session`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();
        return data.session;
    }
}

// Export for use in remote-access.html
window.ParsecClient = ParsecClient;
window.ParsecSessionManager = ParsecSessionManager;
