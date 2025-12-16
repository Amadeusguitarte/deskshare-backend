// ========================================
// User Routes
// User profile and management
// ========================================

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();

// ========================================
// GET /api/users/:id
// Get user profile
// ========================================
router.get('/:id', async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(req.params.id) },
            select: {
                id: true,
                name: true,
                avatarUrl: true,
                rating: true,
                reviewsCount: true,
                createdAt: true,
                computers: {
                    where: { status: 'active' },
                    include: {
                        images: { where: { isPrimary: true } }
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        next(error);
    }
});

// ========================================
// PUT /api/users/profile
// Update own profile (protected)
// ========================================
router.put('/profile', auth, async (req, res, next) => {
    try {
        const { name, avatarUrl } = req.body;

        const updated = await prisma.user.update({
            where: { id: req.user.userId },
            data: {
                name,
                avatarUrl
            },
            select: {
                id: true,
                email: true,
                name: true,
                avatarUrl: true,
                rating: true,
                reviewsCount: true
            }
        });

        res.json({
            message: 'Profile updated successfully',
            user: updated
        });
    } catch (error) {
        next(error);
    }
});

// ========================================
// GET /api/users/:id/stats
// Get user statistics
// ========================================
router.get('/:id/stats', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);

        const [
            computersCount,
            bookingsAsHost,
            bookingsAsRenter,
            totalEarnings
        ] = await Promise.all([
            prisma.computer.count({ where: { userId, status: 'active' } }),
            prisma.booking.count({
                where: {
                    computer: { userId },
                    status: 'completed'
                }
            }),
            prisma.booking.count({
                where: {
                    renterId: userId,
                    status: 'completed'
                }
            }),
            prisma.booking.aggregate({
                where: {
                    computer: { userId },
                    status: 'completed'
                },
                _sum: { totalPrice: true }
            })
        ]);

        res.json({
            stats: {
                computersCount,
                bookingsAsHost,
                bookingsAsRenter,
                totalEarnings: totalEarnings._sum.totalPrice || 0
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
