// ========================================
// WebRTC Signaling Server
// Real-time SDP/ICE exchange via WebSocket
// ========================================

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();

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
        let foundSession = null;
        for (const [sid, session] of activeSessions.entries()) {
            if (session.computerId === parseInt(computerId) && !session.answer) {
                // Found a session for this computer that hasn't been answered yet
                foundSession = sid;
                break;
            }
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
        });

        if (!booking || booking.renterId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (booking.status !== 'active') {
            return res.status(400).json({ error: 'Booking not active' });
        }

        if (!booking.computer.webrtcCapable) {
            return res.status(400).json({ error: 'Host does not support WebRTC' });
        }

        // Generate session ID
        const sessionId = `webrtc-${bookingId}-${Date.now()}`;

        // Store session
        activeSessions.set(sessionId, {
            bookingId: booking.id,
            computerId: booking.computer.id,
            renterId: userId,
            hostId: booking.computer.userId,
            createdAt: Date.now(),
            offer: null,
            answer: null,
            hostIceCandidates: [],
            viewerIceCandidates: []
        });

        // Update booking
        await prisma.booking.update({
            where: { id: booking.id },
            data: { webrtcSessionId: sessionId }
        });

        console.log(`[WebRTC] Session created: ${sessionId}`);

        res.json({
            success: true,
            sessionId,
            message: 'WebRTC session created'
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/webrtc/offer
// Viewer sends SDP offer
// ========================================
router.post('/offer', auth, async (req, res, next) => {
    try {
        const { sessionId, sdp } = req.body;

        if (!sessionId || !sdp) {
            return res.status(400).json({ error: 'sessionId and sdp required' });
        }

        const session = activeSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Verify requester is viewer
        const userId = req.user.userId || req.user.id;
        if (session.renterId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Store offer
        session.offer = sdp;
        session.offerTimestamp = Date.now();

        console.log(`[WebRTC] Offer received for session ${sessionId}`);

        res.json({
            success: true,
            message: 'Offer stored, waiting for answer from host'
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/webrtc/answer
// Host sends SDP answer
// ========================================
router.post('/answer', auth, async (req, res, next) => {
    try {
        const { sessionId, sdp } = req.body;

        if (!sessionId || !sdp) {
            return res.status(400).json({ error: 'sessionId and sdp required' });
        }

        const session = activeSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Verify requester is host
        const userId = req.user.userId || req.user.id;
        if (session.hostId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Store answer
        session.answer = sdp;
        session.answerTimestamp = Date.now();

        console.log(`[WebRTC] Answer received for session ${sessionId}`);

        res.json({
            success: true,
            message: 'Answer stored'
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/webrtc/ice
// Add ICE candidate (host or viewer)
// ========================================
router.post('/ice', auth, async (req, res, next) => {
    try {
        const { sessionId, candidate, isHost } = req.body;

        if (!sessionId || !candidate) {
            return res.status(400).json({ error: 'sessionId and candidate required' });
        }

        const session = activeSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Add to appropriate array
        if (isHost) {
            session.hostIceCandidates.push(candidate);
        } else {
            session.viewerIceCandidates.push(candidate);
        }

        console.log(`[WebRTC] ICE candidate added (${isHost ? 'host' : 'viewer'}) for session ${sessionId}`);

        res.json({
            success: true,
            message: 'ICE candidate stored'
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// GET /api/webrtc/poll/:sessionId
// Poll for signaling data (offer/answer/ice)
// ========================================
router.get('/poll/:sessionId', auth, async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        const { lastPoll } = req.query; // Timestamp of last poll

        const session = activeSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const userId = req.user.userId || req.user.id;
        const isHost = session.hostId === userId;
        const isViewer = session.renterId === userId;

        if (!isHost && !isViewer) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Return relevant data based on role
        const response = {
            sessionId,
            timestamp: Date.now()
        };

        if (isHost) {
            // Host gets viewer's offer and ICE candidates
            if (session.offer) response.offer = session.offer;
            response.iceCandidates = session.viewerIceCandidates;

            // Include renter name for the Launcher UI
            try {
                const renter = await prisma.user.findUnique({
                    where: { id: session.renterId },
                    select: { name: true }
                });
                response.userName = renter ? renter.name : 'Invitado';
            } catch (e) {
                response.userName = 'Invitado';
            }
        } else {
            // Viewer gets host's answer and ICE candidates
            if (session.answer) response.answer = session.answer;
            response.iceCandidates = session.hostIceCandidates;
        }

        res.json(response);

    } catch (error) {
        next(error);
    }
});

// ========================================
// DELETE /api/webrtc/session/:sessionId
// Close session
// ========================================
router.delete('/session/:sessionId', auth, async (req, res, next) => {
    try {
        const { sessionId } = req.params;

        const session = activeSessions.get(sessionId);
        if (session) {
            activeSessions.delete(sessionId);
            console.log(`[WebRTC] Session closed: ${sessionId}`);
        }

        res.json({
            success: true,
            message: 'Session closed'
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
