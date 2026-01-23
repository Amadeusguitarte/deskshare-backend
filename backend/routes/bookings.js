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

        // Verify ownership
        if (booking.renterId !== req.user.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // === ACCESS CONTROL CHECK (Added) ===
        // If it's a paid/controlled session, Host must grant access first
        // We only enforce this if the computer has a Parsec ID (Remote Access)
        if (booking.computer.parsecPeerId && !booking.isAccessGranted) {
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
        let guacamoleToken = null;

        // Only generate if we have host/port (Basic check)
        if (booking.computer.rdpHost) {
            const connectionParams = {
                type: booking.computer.accessMethod || 'rdp',
                settings: {
                    hostname: booking.computer.rdpHost,
                    port: booking.computer.rdpPort || 3389,
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
                        parsecPeerId: true // ADDED: Parsec Integration
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

        // 4. Emit Socket Event for Real-time Delivery
        const io = req.app.get('io');
        if (io) {
            // Emit to recipient's room
            io.to(`user-${renterId}`).emit('new-direct-message', {
                message: newMessage,
                sender: { id: requestUserId }
            });
            // Also emit to sender so their chat refreshes
            io.to(`user-${requestUserId}`).emit('new-direct-message', {
                message: newMessage,
                sender: { id: requestUserId }
            });
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
