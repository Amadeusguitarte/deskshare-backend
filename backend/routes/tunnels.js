// ========================================
// Tunnel Routes
// Agent Registration for Dynamic Tunnels
// ========================================

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();

// ========================================
// POST /api/tunnels/rustdesk
// Agent registers RustDesk ID and password
// ========================================
router.post('/rustdesk', auth, async (req, res, next) => {
    try {
        const { computerId, rustdeskId, rustdeskPassword } = req.body;
        const userId = req.user.userId || req.user.id;

        if (!computerId || !rustdeskId) {
            return res.status(400).json({ error: 'computerId and rustdeskId required' });
        }

        // Verify ownership
        const computer = await prisma.computer.findUnique({
            where: { id: parseInt(computerId) }
        });

        if (!computer || computer.userId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Update RustDesk info
        const updated = await prisma.computer.update({
            where: { id: parseInt(computerId) },
            data: {
                rustdeskId: rustdeskId,
                rustdeskPassword: rustdeskPassword || null,
                tunnelStatus: 'online',
                tunnelUpdatedAt: new Date(),
                accessMethod: 'rustdesk' // Set method to rustdesk
            }
        });

        console.log(`[RustDesk] Computer ${computerId} registered: ID=${rustdeskId}`);

        res.json({
            success: true,
            message: 'RustDesk registered successfully',
            computer: {
                id: updated.id,
                name: updated.name,
                rustdeskId: updated.rustdeskId,
                tunnelStatus: updated.tunnelStatus
            }
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/tunnels/register
// Agent registers/updates its tunnel URL
// ========================================
router.post('/register', auth, async (req, res, next) => {
    try {
        const { computerId, tunnelUrl } = req.body;
        const userId = req.user.userId || req.user.id;

        // Verify ownership
        const computer = await prisma.computer.findUnique({
            where: { id: parseInt(computerId) }
        });

        if (!computer || computer.userId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Update tunnel info
        const updated = await prisma.computer.update({
            where: { id: parseInt(computerId) },
            data: {
                tunnelUrl: tunnelUrl,
                tunnelStatus: 'online',
                tunnelUpdatedAt: new Date(),
                // Use accessMethod from agent, default to 'rdp'
                accessMethod: req.body.accessMethod || 'rdp',
                // Auto-set rdpHost to tunnel URL for Guacamole
                rdpHost: tunnelUrl,
                // If VNC, set VNC port, otherwise RDP
                vncPort: (req.body.accessMethod === 'vnc') ? 5900 : null,
                rdpPort: (req.body.accessMethod === 'vnc') ? null : 3389,
                // Update password if provided (for VNC auto-config)
                accessPassword: req.body.accessPassword || undefined
            }
        });

        console.log(`[Tunnel] Computer ${computerId} registered tunnel: ${tunnelUrl}`);

        res.json({
            success: true,
            message: 'Tunnel registered successfully',
            computer: {
                id: updated.id,
                name: updated.name,
                tunnelUrl: updated.tunnelUrl,
                tunnelStatus: updated.tunnelStatus
            }
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/tunnels/heartbeat
// Agent sends heartbeat to keep tunnel alive
// ========================================
router.post('/heartbeat', auth, async (req, res, next) => {
    try {
        const { computerId } = req.body;
        const userId = req.user.userId || req.user.id;

        const computer = await prisma.computer.findUnique({
            where: { id: parseInt(computerId) }
        });

        if (!computer || computer.userId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await prisma.computer.update({
            where: { id: parseInt(computerId) },
            data: { tunnelUpdatedAt: new Date() }
        });

        res.json({ success: true });

    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/tunnels/offline
// Agent going offline
// ========================================
router.post('/offline', auth, async (req, res, next) => {
    try {
        const { computerId } = req.body;
        const userId = req.user.userId || req.user.id;

        const computer = await prisma.computer.findUnique({
            where: { id: parseInt(computerId) }
        });

        if (!computer || computer.userId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await prisma.computer.update({
            where: { id: parseInt(computerId) },
            data: {
                tunnelStatus: 'offline',
                tunnelUpdatedAt: new Date()
            }
        });

        console.log(`[Tunnel] Computer ${computerId} went offline`);

        res.json({ success: true, message: 'Tunnel marked offline' });

    } catch (error) {
        next(error);
    }
});

// ========================================
// GET /api/tunnels/:computerId
// Get tunnel status for a computer
// ========================================
router.get('/:computerId', async (req, res, next) => {
    try {
        const computer = await prisma.computer.findUnique({
            where: { id: parseInt(req.params.computerId) },
            select: {
                id: true,
                name: true,
                tunnelUrl: true,
                tunnelStatus: true,
                tunnelUpdatedAt: true
            }
        });

        if (!computer) {
            return res.status(404).json({ error: 'Computer not found' });
        }

        // Check if tunnel is stale (no heartbeat in 2 minutes)
        const isStale = computer.tunnelUpdatedAt &&
            (new Date() - new Date(computer.tunnelUpdatedAt)) > 2 * 60 * 1000;

        res.json({
            ...computer,
            tunnelStatus: isStale ? 'offline' : computer.tunnelStatus
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
