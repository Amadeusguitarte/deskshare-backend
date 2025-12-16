// ========================================
// Computer Routes
// CRUD operations for computers
// ========================================

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

const prisma = new PrismaClient();

// ========================================
// GET /api/computers
// Get all computers with filters
// ========================================
router.get('/', async (req, res, next) => {
    try {
        const {
            category,
            minPrice,
            maxPrice,
            minRam,
            gpu,
            search,
            sortBy = 'createdAt',
            order = 'desc',
            page = 1,
            limit = 12
        } = req.query;

        // Build where clause
        const where = {
            status: 'active'
        };

        if (category && category !== 'all') {
            where.category = category;
        }

        if (minPrice || maxPrice) {
            where.pricePerHour = {};
            if (minPrice) where.pricePerHour.gte = parseFloat(minPrice);
            if (maxPrice) where.pricePerHour.lte = parseFloat(maxPrice);
        }

        if (minRam) {
            where.ram = { gte: parseInt(minRam) };
        }

        if (gpu && gpu !== 'all') {
            where.gpu = { contains: gpu, mode: 'insensitive' };
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get computers
        const [computers, total] = await Promise.all([
            prisma.computer.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            avatarUrl: true,
                            rating: true,
                            reviewsCount: true
                        }
                    },
                    images: {
                        orderBy: { isPrimary: 'desc' }
                    },
                    _count: {
                        select: { bookings: true }
                    }
                },
                orderBy: { [sortBy]: order },
                skip,
                take: parseInt(limit)
            }),
            prisma.computer.count({ where })
        ]);

        res.json({
            computers,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        next(error);
    }
});

// ========================================
// GET /api/computers/:id
// Get single computer by ID
// ========================================
router.get('/:id', async (req, res, next) => {
    try {
        const computer = await prisma.computer.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                        rating: true,
                        reviewsCount: true,
                        createdAt: true
                    }
                },
                images: {
                    orderBy: { isPrimary: 'desc' }
                },
                bookings: {
                    where: { status: { in: ['completed'] } },
                    include: {
                        reviews: true,
                        renter: {
                            select: {
                                id: true,
                                name: true,
                                avatarUrl: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                }
            }
        });

        if (!computer) {
            return res.status(404).json({ error: 'Computer not found' });
        }

        // Don't expose sensitive data
        delete computer.accessPassword;
        delete computer.rdpHost;
        delete computer.rdpPort;

        res.json({ computer });
    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/computers
// Create new computer listing (protected)
// ========================================
router.post(
    '/',
    auth,
    upload.array('images', 5),
    [
        body('name').trim().notEmpty(),
        body('pricePerHour').isFloat({ min: 0 }),
        body('category').optional(),
        body('description').optional(),
        body('cpu').optional(),
        body('gpu').optional(),
        body('ram').optional().isInt(),
        body('storage').optional(),
        body('os').optional(),
        body('internetSpeed').optional(),
        body('accessMethod').optional().isIn(['rdp', 'vnc', 'chrome-remote']),
        body('rdpHost').optional(),
        body('rdpPort').optional().isInt(),
        body('remoteId').optional()
    ],
    async (req, res, next) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const computerData = {
                userId: req.user.userId,
                name: req.body.name,
                description: req.body.description,
                category: req.body.category,
                pricePerHour: parseFloat(req.body.pricePerHour),
                cpu: req.body.cpu,
                gpu: req.body.gpu,
                ram: req.body.ram ? parseInt(req.body.ram) : null,
                storage: req.body.storage,
                os: req.body.os,
                internetSpeed: req.body.internetSpeed,
                accessMethod: req.body.accessMethod || 'rdp',
                rdpHost: req.body.rdpHost,
                rdpPort: req.body.rdpPort ? parseInt(req.body.rdpPort) : 3389,
                remoteId: req.body.remoteId
            };

            // Encrypt access password if provided
            if (req.body.accessPassword) {
                const bcrypt = require('bcryptjs');
                const salt = await bcrypt.genSalt(12);
                computerData.accessPassword = await bcrypt.hash(req.body.accessPassword, salt);
            }

            // Create computer with images
            const computer = await prisma.computer.create({
                data: {
                    ...computerData,
                    images: {
                        create: req.files?.map((file, index) => ({
                            imageUrl: file.path,
                            isPrimary: index === 0
                        })) || []
                    }
                },
                include: {
                    images: true
                }
            });

            res.status(201).json({
                message: 'Computer created successfully',
                computer
            });
        } catch (error) {
            next(error);
        }
    }
);

// ========================================
// PUT /api/computers/:id
// Update computer (protected, owner only)
// ========================================
router.put('/:id', auth, async (req, res, next) => {
    try {
        const computerId = parseInt(req.params.id);

        // Check ownership
        const computer = await prisma.computer.findUnique({
            where: { id: computerId }
        });

        if (!computer) {
            return res.status(404).json({ error: 'Computer not found' });
        }

        if (computer.userId !== req.user.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Update
        const updated = await prisma.computer.update({
            where: { id: computerId },
            data: {
                name: req.body.name,
                description: req.body.description,
                category: req.body.category,
                pricePerHour: req.body.pricePerHour ? parseFloat(req.body.pricePerHour) : undefined,
                cpu: req.body.cpu,
                gpu: req.body.gpu,
                ram: req.body.ram ? parseInt(req.body.ram) : undefined,
                storage: req.body.storage,
                os: req.body.os,
                internetSpeed: req.body.internetSpeed,
                status: req.body.status
            }
        });

        res.json({
            message: 'Computer updated successfully',
            computer: updated
        });
    } catch (error) {
        next(error);
    }
});

// ========================================
// DELETE /api/computers/:id
// Delete computer (protected, owner only)
// ========================================
router.delete('/:id', auth, async (req, res, next) => {
    try {
        const computerId = parseInt(req.params.id);

        // Check ownership
        const computer = await prisma.computer.findUnique({
            where: { id: computerId }
        });

        if (!computer) {
            return res.status(404).json({ error: 'Computer not found' });
        }

        if (computer.userId !== req.user.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Delete
        await prisma.computer.delete({
            where: { id: computerId }
        });

        res.json({ message: 'Computer deleted successfully' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
