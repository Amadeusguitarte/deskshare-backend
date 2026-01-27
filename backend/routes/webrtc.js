// ========================================
// WebRTC Signaling Server (Standardized v2.0)
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
        const { computerId, mode } = req.body;
        const userId = req.user.userId || req.user.id;

        if (!computerId) return res.status(400).json({ error: 'computerId required' });

        const computer = await prisma.computer.findUnique({ where: { id: parseInt(computerId) } });
        if (!computer || computer.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

        await prisma.computer.update({
            where: { id: parseInt(computerId) },
            data: {
                webrtcCapable: true,
                webrtcMode: mode || 'browser',
                tunnelStatus: 'online',
                tunnelUpdatedAt: new Date()
            }
        });

        res.json({ status: 'registered' });
    } catch (e) { next(e); }
});

// ========================================
// POST /api/webrtc/session/create (Viewer Init)
// ========================================
router.post('/session/create', auth, async (req, res, next) => {
    try {
        const { computerId, bookingId } = req.body;
        let targetId = computerId;

        if (bookingId) {
            const b = await prisma.booking.findUnique({ where: { id: parseInt(bookingId) }, select: { computerId: true } });
            if (b) targetId = b.computerId;
        }

        if (!targetId) return res.status(400).json({ error: 'Target ID required' });

        const session = await prisma.webRTCSession.create({
            data: {
                computerId: parseInt(targetId),
                bookingId: bookingId ? parseInt(bookingId) : null,
                status: 'pending',
                candidates: []
            }
        });

        // Link to computer for primary polling
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
        const { sessionId, sdp, targetComputerId } = req.body;

        let session;
        if (sessionId) {
            session = await prisma.webRTCSession.update({
                where: { id: sessionId },
                data: { offer: JSON.stringify(sdp), status: 'negotiating' }
            });
        } else {
            // Fallback for direct offers without /create
            session = await prisma.webRTCSession.create({
                data: {
                    computerId: parseInt(targetComputerId),
                    offer: JSON.stringify(sdp),
                    status: 'negotiating',
                    candidates: []
                }
            });
        }

        // Always update the computer's active session ID so Agent can find it
        await prisma.computer.update({
            where: { id: session.computerId },
            data: { webrtcSessionId: session.id }
        });

        res.json({ status: 'offered', sessionId: session.id });
    } catch (e) { next(e); }
});

// ========================================
// GET /api/webrtc/host/pending (Agent Polling Loop)
// ========================================
router.get('/host/pending', auth, async (req, res, next) => {
    try {
        const computerId = parseInt(req.query.computerId);
        if (!computerId) return res.status(400).json({ error: 'computerId required' });

        // Find newest session that hasn't timed out (60s)
        const session = await prisma.webRTCSession.findFirst({
            where: {
                computerId: computerId,
                status: { not: 'closed' },
                lastHeartbeat: { gte: new Date(Date.now() - 60000) }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!session) return res.status(404).json({ status: 'idle' });
        res.json({ sessionId: session.id });
    } catch (e) { next(e); }
});

// ========================================
// GET /api/webrtc/poll/:sessionId (Unified Polling)
// ========================================
router.get('/poll/:sessionId', async (req, res, next) => {
    try {
        const { sessionId } = req.params;

        const session = await prisma.webRTCSession.findUnique({ where: { id: sessionId } });
        if (!session) return res.status(404).json({ status: 'idle' });

        // Update heartbeat
        await prisma.webRTCSession.update({
            where: { id: sessionId },
            data: { lastHeartbeat: new Date() }
        });

        res.json({
            sessionId: session.id,
            offer: session.offer ? JSON.parse(session.offer) : null,
            answer: session.answer ? JSON.parse(session.answer) : null,
            candidates: session.candidates || [], // Unified
            iceCandidates: session.candidates || [] // Legacy alias for Agent
        });
    } catch (e) { next(e); }
});

// ========================================
// POST /api/webrtc/answer (Agent -> Client)
// ========================================
router.post('/answer', auth, async (req, res, next) => {
    try {
        const { sessionId, sdp } = req.body;
        await prisma.webRTCSession.update({
            where: { id: sessionId },
            data: { answer: JSON.stringify(sdp), status: 'connected' }
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
        if (!candidate) return res.json({ status: 'ignored_null' });

        const session = await prisma.webRTCSession.findUnique({ where: { id: sessionId } });
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const candidates = session.candidates || [];

        // v52: Reject malformed or empty candidates
        const candData = typeof candidate === 'string' ? { candidate } : candidate;
        if (!candData || (!candData.candidate && candData.candidate !== "")) {
            return res.json({ status: 'ignored_invalid' });
        }

        candidates.push({ ...candData, isHost });

        await prisma.webRTCSession.update({
            where: { id: sessionId },
            data: { candidates }
        });

        res.json({ status: 'candidate_added' });
    } catch (e) { next(e); }
});

module.exports = router;
