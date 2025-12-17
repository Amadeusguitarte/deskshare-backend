// Temporary migration endpoint - DELETE AFTER USE
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.post('/run-migrations', async (req, res) => {
    try {
        // Add missing columns to users table
        await prisma.$executeRawUnsafe(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false
        `);

        // Add missing columns to computers table
        await prisma.$executeRawUnsafe(`
            ALTER TABLE computers 
            ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false
        `);

        await prisma.$executeRawUnsafe(`
            ALTER TABLE computers 
            ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP
        `);

        await prisma.$executeRawUnsafe(`
            ALTER TABLE computers 
            ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255)
        `);

        res.json({
            success: true,
            message: 'Migrations executed successfully'
        });
    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
