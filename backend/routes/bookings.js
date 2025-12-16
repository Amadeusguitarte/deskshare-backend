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
                        remoteId: true
                    }
                }
            }
        });

        res.json({
            message: 'Session started successfully',
            booking: updated,
            accessToken
        });
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
