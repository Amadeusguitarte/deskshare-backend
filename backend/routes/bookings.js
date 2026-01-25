// ========================================
// Booking Routes
// Handle remote access sessions and bookings
// ========================================

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();

// ========================================
// POST /api/bookings
// Create a new booking/session
// ========================================
router.post('/', auth, async (req, res, next) => {
    try {
        const { computerId, priceAgreed, estimatedHours } = req.body;

        // Verify computer exists
        const computer = await prisma.computer.findUnique({
            where: { id: computerId },
            include: { user: true }
        });

        if (!computer) {
            return res.status(404).json({ error: 'Computer not found' });
        }

        // Can't rent your own computer
        if (computer.userId === req.user.userId) {
            return res.status(400).json({ error: 'Cannot rent your own computer' });
        }

        // Create booking
        const booking = await prisma.booking.create({
            data: {
                computerId,
                renterId: req.user.userId,
                priceAgreed: parseFloat(priceAgreed),
                status: 'pending'
            },
            include: {
                computer: {
                    include: {
                        user: { select: { id: true, name: true, email: true } }
                    }
                },
                renter: { select: { id: true, name: true, email: true } }
            }
        });

        res.status(201).json({
            message: 'Booking created successfully',
            booking
        });
    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/bookings/:id/start
// Start a remote session
// ========================================
router.post('/:id/start', auth, async (req, res, next) => {
    try {
        const bookingId = parseInt(req.params.id);

        // Get booking
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                computer: true,
                renter: true
            }
        });

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        // Verify ownership (Renter OR Host/Owner) -> Use loose equality for safety (int vs string)
        const isRenter = booking.renterId == req.user.userId;
        const isHost = booking.computer.userId == req.user.userId;

        if (!isRenter && !isHost) {
            const reason = `Auth Fail: Renter ${booking.renterId} vs Req ${req.user.userId} | Host ${booking.computer.userId} vs Req ${req.user.userId}`;
            console.log(reason);
            return res.status(403).json({ error: 'Not authorized', details: reason, code: 'AUTH_MISMATCH' });
        }

        // === ACCESS CONTROL CHECK (Added) ===
        // If it's a paid/controlled session, Host must grant access first
        // We only enforce this if the computer has a Parsec ID (Remote Access) AND user is NOT the host
        if (!isHost && booking.computer.parsecPeerId && !booking.isAccessGranted) {
            return res.status(403).json({
                error: 'Access Not Granted Yet',
                code: 'WAITING_FOR_HOST',
                message: 'El anfitrión aún no ha entregado el acceso. Por favor, pídeselo por el chat.'
            });
        }

        // Generate access token (simple JWT for this session)
        const jwt = require('jsonwebtoken');
        const accessToken = jwt.sign(
            {
                bookingId: booking.id,
                computerId: booking.computerId,
                renterId: booking.renterId
            },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        // === GUACAMOLE INTEGRATION ===
        const { encryptConnection } = require('../utils/guacamole-crypto');
        const tunnelManager = require('../utils/TunnelManager'); // Import Manager
        let guacamoleToken = null;

        // Dynamic Tunnel Logic (DeskShare Launcher)
        let rdpHost = booking.computer.rdpHost;
        let rdpPort = booking.computer.rdpPort || 3389;

        // If computer has an active Cloudflare Tunnel, bridge it!
        if (booking.computer.tunnelStatus === 'online' && booking.computer.tunnelUrl) {
            try {
                console.log(`[Session] Bridging tunnel for ${booking.computer.name}...`);
                const localPort = await tunnelManager.bridgeTunnel(booking.computer.tunnelUrl, booking.id);

                // Override connection params to point to local bridge
                rdpHost = 'localhost';
                rdpPort = localPort;
                console.log(`[Session] Tunnel bridged to localhost:${localPort}`);
            } catch (err) {
                console.error('[Session] Failed to bridge tunnel:', err);
                // Fallback to original execution (might fail if behind NAT)
            }
        }

        // Only generate if we have host/port
        if (rdpHost) {
            const connectionParams = {
                type: booking.computer.accessMethod || 'rdp',
                settings: {
                    hostname: rdpHost,
                    port: rdpPort,
                    password: booking.computer.accessPassword || '', // TODO: Decrypt if stored encrypted
                    'ignore-cert': 'true',
                    security: 'any',
                    'resize-method': 'display-update'
                }
            };
            guacamoleToken = encryptConnection(connectionParams);
        }

        // Update booking
        const updated = await prisma.booking.update({
            where: { id: bookingId },
            data: {
                status: 'active',
                startTime: new Date(),
                accessToken
            },
            include: {
                computer: {
                    select: {
                        id: true,
                        name: true,
                        rdpHost: true,
                        rdpPort: true,
                        accessMethod: true,
                        remoteId: true,
                        parsecPeerId: true, // ADDED: Parsec Integration
                        tunnelUrl: true,    // ADDED: Dynamic Tunnel
                        tunnelStatus: true  // ADDED: Dynamic Tunnel
                    }
                }
            }
        });

        res.json({
            message: 'Session started successfully',
            booking: updated,
            accessToken,
            guacamoleToken // Send to frontend
        });
    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/bookings/:id/grant
// Host manually grants access (The "Give Key" Button)
// ========================================
router.post('/:id/grant', auth, async (req, res, next) => {
    try {
        const bookingId = parseInt(req.params.id);

        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { computer: true }
        });

        if (!booking) return res.status(404).json({ error: 'Booking not found' });

        // Verify Host matches
        if (booking.computer.userId !== req.user.userId) {
            return res.status(403).json({ error: 'Only the Host can grant access' });
        }

        // Update DB
        const updated = await prisma.booking.update({
            where: { id: bookingId },
            data: { isAccessGranted: true }
        });

        // OPTIONAL: Auto-Send Chat Message
        // We inject a message confirming access so the Renter sees it immediately
        await prisma.message.create({
            data: {
                senderId: req.user.userId,
                receiverId: booking.renterId,
                computerId: booking.computerId,
                message: '🔑 ACCESO CONCEDIDO: Ya puedes conectarte desde el botón en tu perfil.',
                isRead: false
            }
        });

        res.json({ success: true, message: 'Access granted successfully' });

    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/bookings/manual-share (NEW)
// Ad-Hoc Access Grant (No Payment Flow)
// ========================================
router.post('/manual-share', auth, async (req, res, next) => {
    try {
        const { computerId, renterId } = req.body;

        if (!renterId || isNaN(parseInt(renterId))) {
            return res.status(400).json({ error: 'Invalid renter ID' });
        }

        // 1. Verify Ownership
        const computer = await prisma.computer.findUnique({
            where: { id: parseInt(computerId) }
        });
        const requestUserId = req.user.userId || req.user.id;

        if (!computer || computer.userId !== requestUserId) {
            console.log(`Auth Fail: Computer Owner ${computer?.userId} vs Request User ${requestUserId}`);
            return res.status(403).json({ error: 'Not authorized' });
        }
        // Allow if Parsec OR RDP is configured
        if (!computer.parsecPeerId && !computer.rdpHost) {
            return res.status(400).json({ error: 'This computer does not have Parsec or RDP configured.' });
        }

        // 2. Create "Free Trial" / Manual Booking
        const booking = await prisma.booking.create({
            data: {
                computerId: parseInt(computerId),
                renterId: parseInt(renterId),
                priceAgreed: 0,
                status: 'active',
                startTime: new Date(),
                isAccessGranted: true, // Auto-grant since it's manual
                paymentStatus: 'manual_grant'
            }
        });

        // 3. Inject Chat Message with Access Info
        // Use a special JSON format that frontend will parse and render as a proper action card
        const accessData = {
            type: 'ACCESS_GRANT',
            computerName: computer.name,
            computerId: computer.id,
            bookingId: booking.id,
            connectionType: computer.rdpHost ? 'guacamole' : 'parsec',
            // For Parsec: direct protocol link
            // For Guacamole: booking ID (frontend will build the remote-access.html URL)
            parsecPeerId: computer.parsecPeerId || null
        };

        // Store as JSON string with special prefix so frontend knows to render it specially
        const msgContent = `[ACCESS_GRANT]${JSON.stringify(accessData)}`;

        const newMessage = await prisma.message.create({
            data: {
                senderId: requestUserId,
                receiverId: parseInt(renterId),
                computerId: parseInt(computerId),
                message: msgContent,
                isRead: false
            }
        });

        console.log(`Manual Share Success: Booking ${booking.id} created for Renter ${renterId} by Host ${requestUserId}`);

        console.log(`Manual Share Success: Booking ${booking.id} created for Renter ${renterId} by Host ${requestUserId}`);

        // 4. Emit Socket Event for Real-time Delivery
        const io = req.app.get('io');
        if (io) {
            // Emit to recipient's room
            io.to(`user-${renterId}`).emit('private-message', newMessage);

            // Also emit to sender so their chat refreshes
            io.to(`user-${requestUserId}`).emit('private-message', newMessage);
        }

        res.json({ success: true, booking, message: newMessage });

    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/bookings/:id/end
// End a remote session
// ========================================
router.post('/:id/end', auth, async (req, res, next) => {
    try {
        const bookingId = parseInt(req.params.id);

        const booking = await prisma.booking.findUnique({
            where: { id: bookingId }
        });

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        if (booking.renterId !== req.user.userId && booking.computer.userId !== req.user.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Calculate duration and total price
        const endTime = new Date();
        const durationMs = endTime - booking.startTime;
        const durationHours = durationMs / (1000 * 60 * 60);
        const totalPrice = durationHours * parseFloat(booking.priceAgreed);

        // Stop any active tunnel bridge for this booking
        const tunnelManager = require('../utils/TunnelManager');
        tunnelManager.stopBridge(bookingId);

        // Update booking
        const updated = await prisma.booking.update({
            where: { id: bookingId },
            data: {
                status: 'completed',
                endTime,
                actualDurationHours: durationHours,
                totalPrice
            }
        });

        res.json({
            message: 'Session ended successfully',
            booking: updated,
            summary: {
                duration: `${Math.floor(durationHours)} hours ${Math.floor((durationHours % 1) * 60)} minutes`,
                totalPrice: totalPrice.toFixed(2)
            }
        });
    } catch (error) {
        next(error);
    }
});

// ========================================
// GET /api/bookings/my-bookings
// Get user's bookings
// ========================================
router.get('/my-bookings', auth, async (req, res, next) => {
    try {
        const bookings = await prisma.booking.findMany({
            where: {
                OR: [
                    { renterId: req.user.userId },
                    { computer: { userId: req.user.userId } }
                ]
            },
            include: {
                computer: {
                    include: {
                        images: { where: { isPrimary: true } }
                    }
                },
                renter: {
                    select: { id: true, name: true, avatarUrl: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ bookings });
    } catch (error) {
        next(error);
    }
});

// ========================================
// GET /api/bookings/:id
// Get single booking details
// ========================================
router.get('/:id', auth, async (req, res, next) => {
    try {
        const booking = await prisma.booking.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                computer: {
                    include: {
                        user: { select: { id: true, name: true, email: true, avatarUrl: true } }
                    }
                },
                renter: { select: { id: true, name: true, email: true, avatarUrl: true } }
            }
        });

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        // Verify access
        if (booking.renterId !== req.user.userId && booking.computer.userId !== req.user.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        res.json({ booking });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
