// ========================================
// WebRTC Signaling Server (DB-Backed Persistence)
// ========================================

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma'); // Singleton
const auth = require('../middleware/auth');

// ========================================
// POST /api/webrtc/register
// Launcher registers WebRTC capability
// ========================================
router.post('/register', auth, async (req, res, next) => {
    try {
        const { computerId, mode } = req.body; // mode: 'native' or 'browser'
        const userId = req.user.userId || req.user.id; // Support both auth middleware styles

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
                webrtcMode: mode || 'browser',
                tunnelStatus: 'online',
                tunnelUpdatedAt: new Date()
            }
        });

        res.json({
            status: 'registered',
            webrtcCapable: true,
            mode: updated.webrtcMode
        });
    } catch (e) { next(e); }
});

// ========================================
// POST /api/webrtc/offer (Client -> Agent)
// ========================================
router.post('/offer', auth, async (req, res, next) => {
    try {
        const { targetComputerId, sdp, bookingId } = req.body;
        console.log(`[WebRTC] Received OFFER for Computer ${targetComputerId}`);

        // 1. Create Connection Session in DB (Persist > Memory)
        const session = await prisma.webRTCSession.create({
            data: {
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
