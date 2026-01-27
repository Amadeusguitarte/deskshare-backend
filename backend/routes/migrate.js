// Temporary migration endpoint - DELETE AFTER USE
const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma'); // Singleton
const auth = require('../middleware/auth');

// const prisma = new PrismaClient();

router.get('/run-migrations', async (req, res) => {
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

        // Create Messages Table
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER NOT NULL,
                receiver_id INTEGER NOT NULL,
                computer_id INTEGER,
                message TEXT NOT NULL,
                is_read BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                
                CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
                CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
                CONSTRAINT messages_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES computers(id) ON DELETE SET NULL ON UPDATE CASCADE
            );
        `);

        // Add client_name to webrtc_sessions
        await prisma.$executeRawUnsafe(`
            ALTER TABLE webrtc_sessions 
            ADD COLUMN IF NOT EXISTS client_name TEXT
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
