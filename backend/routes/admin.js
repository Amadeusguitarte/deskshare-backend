const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireAdmin } = require('../middleware/adminAuth');

const prisma = new PrismaClient();

// ========================================
// GET /api/admin/computers
// Get all computers (approved and pending)
// ========================================
router.get('/computers', requireAdmin, async (req, res, next) => {
    try {
        const computers = await prisma.computer.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatarUrl: true
                    }
                },
                images: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json({ computers });
    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/admin/computers/:id/approve
// Approve a computer listing
// ========================================
router.post('/computers/:id/approve', requireAdmin, async (req, res, next) => {
    try {
        const computerId = parseInt(req.params.id);

        const computer = await prisma.computer.update({
            where: { id: computerId },
            data: {
                isApproved: true,
                approvedAt: new Date(),
                approvedBy: req.admin.username
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        res.json({
            message: 'Computer approved successfully',
            computer
        });
    } catch (error) {
        next(error);
    }
});

// ========================================
// DELETE /api/admin/computers/:id
// Delete a computer listing
// ========================================
router.delete('/computers/:id', requireAdmin, async (req, res, next) => {
    try {
        const computerId = parseInt(req.params.id);

        await prisma.computer.delete({
            where: { id: computerId }
        });

        res.json({
            message: 'Computer deleted successfully',
            id: computerId
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
