const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/auth/google', async (req, res, next) => {
    try {
        const { idToken } = req.body;

        // Verify Google token
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const { email, name, picture } = payload;

        // Check if user exists
        let user = await prisma.user.findUnique({
            where: { email }
        });

        // Create user if doesn't exist
        if (!user) {
            // Create placeholder password for Google users
            const randomPassword = await bcrypt.hash('GOOGLE_OAUTH_' + Date.now(), 10);

            user = await prisma.user.create({
                data: {
                    email,
                    name,
                    avatarUrl: picture,
                    passwordHash: randomPassword
                }
            });
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
                avatar: user.avatarUrl  // Frontend expects 'avatar'
            }
        });

    } catch (error) {
        console.error('Google auth error:', error);
        res.status(401).json({ error: 'Google authentication failed: ' + error.message });
    }
});

module.exports = router;
