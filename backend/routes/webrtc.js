// ========================================
// WebRTC Signaling Server
// Real-time SDP/ICE exchange via WebSocket
// ========================================

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma'); // Singleton
const auth = require('../middleware/auth');

// const prisma = new PrismaClient(); // REMOVED

// In-memory session store (could move to Redis for scale)
const activeSessions = new Map();

// DEBUG: Dump active sessions
router.get('/debug/sessions', async (req, res) => {
    res.json(Array.from(activeSessions.entries()));
});

// ========================================
// POST /api/webrtc/register
// Launcher registers WebRTC capability
// ========================================
router.post('/register', auth, async (req, res, next) => {
    try {
        const { computerId, mode } = req.body; // mode: 'native' or 'browser'
        const userId = req.user.userId || req.user.id;

        if (!computerId) {
            return res.status(400).json({ error: 'computerId required' });
        }

        // Verify ownership
        const computer = await prisma.computer.findUnique({
            where: { id: parseInt(computerId) }
        });

        if (!computer || computer.userId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Update capability and mode
        const updated = await prisma.computer.update({
            where: { id: parseInt(computerId) },
            data: {
                webrtcCapable: true,
                webrtcMode: mode || 'browser', // Default to browser if not specified
                tunnelStatus: 'online',
                tunnelUpdatedAt: new Date()
            }
        });

        console.log(`[WebRTC] Computer ${computerId} registered as WebRTC-capable (${mode})`);

        res.json({
            success: true,
            message: 'WebRTC capability registered',
            computer: {
                id: updated.id,
                name: updated.name,
                webrtcCapable: updated.webrtcCapable,
                webrtcMode: updated.webrtcMode
            }
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// GET /api/webrtc/host/pending
// Host checks if there is a pending session
// ========================================
router.get('/host/pending', auth, async (req, res, next) => {
    try {
        const { computerId } = req.query;
        const userId = req.user.userId || req.user.id;

        // Find computer to verify ownership
        const computer = await prisma.computer.findUnique({
            where: { id: parseInt(computerId) }
        });

        if (!computer) {
            return res.status(404).json({ error: 'Computer not found' });
        }

        /* ALPHA BYPASS: Allow signaling regardless of owner token for now
        if (computer.userId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        } */

        // Check active sessions map
        // v44: FIFO Priority - Return the NEWEST session
        // Maps preserve insertion order, so we convert to array and reverse to find the latest
        let bestSessionId = null;
        let latestTime = 0;

        for (const [sid, session] of activeSessions.entries()) {
            if (session.computerId === parseInt(computerId) && !session.answer) {
                // Check if this is newer than what we found
                if (session.createdAt > latestTime) {
                    latestTime = session.createdAt;
                    bestSessionId = sid;
                }
            }
        }

        if (bestSessionId) {
            return res.json({ sessionId: bestSessionId });
        } else {
            return res.status(404).json({ message: 'No pending session' });
        }

        if (foundSession) {
            return res.json({ sessionId: foundSession });
        } else {
            return res.status(404).json({ message: 'No pending session' });
        }

    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/webrtc/session/create
// Create WebRTC session for a booking
// ========================================
router.post('/session/create', auth, async (req, res, next) => {
    try {
        const { bookingId } = req.body;
        const userId = req.user.userId || req.user.id;

        // Verify booking ownership (renter)
        const booking = await prisma.booking.findUnique({
            where: { id: parseInt(bookingId) },
            include: { computer: true }
                computerId: parseInt(targetComputerId),
            bookingId: bookingId ? parseInt(bookingId) : null,
            offer: JSON.stringify(sdp),
            status: 'negotiating',
            candidates: [] // Init empty array
        }
        });

// 2. Update Computer (Optional, for UI status)
await prisma.computer.update({
    where: { id: parseInt(targetComputerId) },
    data: { webrtcSessionId: session.id }
});

res.json({ status: 'offered', sessionId: session.id });
    } catch (e) { next(e); }
});


// ========================================
// GET /api/webrtc/poll/:computerId (Agent Polling)
// ========================================
router.get('/poll/:computerId', auth, async (req, res, next) => {
    try {
        const computerId = parseInt(req.params.computerId);

        // Find NEWEST active session
        const session = await prisma.webRTCSession.findFirst({
            where: {
                computerId: computerId,
                status: { not: 'closed' }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!session) {
            return res.status(404).json({ status: 'idle' });
        }

        // Heartbeat update
        await prisma.webRTCSession.update({
            where: { id: session.id },
            data: { lastHeartbeat: new Date() }
        });

        res.json({
            sessionId: session.id,
            offer: session.offer ? JSON.parse(session.offer) : null,
            candidates: session.candidates // Already JSON
        });
    } catch (e) { next(e); }
});

// ========================================
// POST /api/webrtc/answer (Agent -> Client)
// ========================================
router.post('/answer', auth, async (req, res, next) => {
    try {
        const { sessionId, sdp } = req.body;
        console.log(`[WebRTC] Received ANSWER for Session ${sessionId}`);

        await prisma.webRTCSession.update({
            where: { id: sessionId },
            data: {
                answer: JSON.stringify(sdp),
                status: 'connected'
            }
        });

        res.json({ status: 'answered' });
    } catch (e) { next(e); }
});

// ========================================
// GET /api/webrtc/poll/answer/:sessionId (Client Polling)
// ========================================
router.get('/poll/answer/:sessionId', async (req, res, next) => {
    try {
        const sessionId = req.params.sessionId;

        const session = await prisma.webRTCSession.findUnique({
            where: { id: sessionId }
        });

        if (!session) return res.status(404).json({ error: 'Session not found' });

        res.json({
            answer: session.answer ? JSON.parse(session.answer) : null,
            candidates: session.candidates
        });

    } catch (e) { next(e); }
});

// ========================================
// POST /api/webrtc/ice (Bidirectional)
// ========================================
router.post('/ice', async (req, res, next) => {
    try {
        const { sessionId, candidate, sender } = req.body; // sender: 'agent' or 'client'

        // Read-Modify-Write pattern for appending candidates
        const session = await prisma.webRTCSession.findUnique({ where: { id: sessionId } });
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const candidates = session.candidates || [];
        candidates.push({ ...candidate, sender });

        await prisma.webRTCSession.update({
            where: { id: sessionId },
            data: { candidates }
        });

        res.json({ status: 'candidate_added' });
    } catch (e) { next(e); }
});

module.exports = router;
