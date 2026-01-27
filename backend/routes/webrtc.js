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
// POST /api/webrtc/session/create (Viewer Init - Legacy Compatibility)
// ========================================
router.post('/session/create', auth, async (req, res, next) => {
    try {
        const { computerId, bookingId } = req.body;

        // Handle Direct ID or Booking ID
        let targetId = computerId;
        if (bookingId) {
            const booking = await prisma.booking.findUnique({ where: { id: parseInt(bookingId) }, select: { computerId: true } });
            if (booking) targetId = booking.computerId;
        }

        if (!targetId) return res.status(400).json({ error: 'Target ID required' });

        // Create Session (Wait for offer later)
        const session = await prisma.webRTCSession.create({
            data: {
                computerId: parseInt(targetId),
                bookingId: bookingId ? parseInt(bookingId) : null,
                status: 'pending', // Waiting for offer
                candidates: []
            }
        });

        // Link to computer for polling
        await prisma.computer.update({
            where: { id: parseInt(targetId) },
            data: { webrtcSessionId: session.id }
        });

        res.json({ sessionId: session.id, status: 'created' });
    } catch (e) { next(e); }
});

// ========================================
// POST /api/webrtc/offer (Client -> Agent)
// ========================================
router.post('/offer', auth, async (req, res, next) => {
    try {
        const { targetComputerId, sdp, bookingId, sessionId } = req.body;
        console.log(`[WebRTC] Received OFFER for Computer ${targetComputerId}`);

        let session;

        // Strategy 1: Update existing session (from /session/create)
        if (sessionId) {
            session = await prisma.webRTCSession.update({
                where: { id: sessionId },
                data: {
                    offer: JSON.stringify(sdp),
                    status: 'negotiating'
                }
            });
        }
        // Strategy 2: Create new (if client didn't call create first)
        else {
            session = await prisma.webRTCSession.create({
                data: {
                    computerId: parseInt(targetComputerId),
                    bookingId: bookingId ? parseInt(bookingId) : null,
                    offer: JSON.stringify(sdp),
                    status: 'negotiating',
                    candidates: []
                }
            });
        }

        // 2. Update Computer (Ensure Agent sees THIS session)
        await prisma.computer.update({
            where: { id: parseInt(targetComputerId) },
            data: { webrtcSessionId: session.id }
        });

        res.json({ status: 'offered', sessionId: session.id });
    } catch (e) { next(e); }
});


// ========================================
// GET /api/webrtc/poll/:sessionId (Unified Polling)
// ========================================
router.get('/poll/:sessionId', async (req, res, next) => {
    try {
        const { sessionId } = req.params;

        const session = await prisma.webRTCSession.findUnique({
            where: { id: sessionId }
        });

        if (!session) return res.status(404).json({ status: 'idle', error: 'Session not found' });

        // Heartbeat update
        await prisma.webRTCSession.update({
            where: { id: session.id },
            data: { lastHeartbeat: new Date() }
        });

        res.json({
            sessionId: session.id,
            offer: session.offer ? JSON.parse(session.offer) : null,
            answer: session.answer ? JSON.parse(session.answer) : null,
            candidates: session.candidates || [], // New standard
            iceCandidates: session.candidates || [] // Legacy compatibility
        });

    } catch (e) { next(e); }
});

// ========================================
// GET /api/webrtc/host/pending (Agent Init)
// ========================================
router.get('/host/pending', auth, async (req, res, next) => {
    try {
        const computerId = parseInt(req.query.computerId);
        if (!computerId) return res.status(400).json({ error: 'computerId required' });

        // Find newest active session (not closed, heartbeat within 30s)
        const session = await prisma.webRTCSession.findFirst({
            where: {
                computerId: computerId,
                status: { not: 'closed' },
                lastHeartbeat: { gte: new Date(Date.now() - 30000) }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!session) return res.status(404).json({ status: 'idle' });

        res.json({ sessionId: session.id });
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
// POST /api/webrtc/ice (Bidirectional)
// ========================================
router.post('/ice', async (req, res, next) => {
    try {
        const { sessionId, candidate, isHost } = req.body;

        // Read-Modify-Write pattern for appending candidates
        const session = await prisma.webRTCSession.findUnique({ where: { id: sessionId } });
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const candidates = session.candidates || [];
        // Store isHost flag with the candidate so clients can filter
        candidates.push({ ...candidate, isHost });

        await prisma.webRTCSession.update({
            where: { id: sessionId },
            data: { candidates }
        });

        res.json({ status: 'candidate_added' });
    } catch (e) { next(e); }
});

module.exports = router;
