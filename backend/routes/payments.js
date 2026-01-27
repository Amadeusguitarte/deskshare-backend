// ========================================
// Payment Routes
// Stripe integration for payments
// ========================================

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma'); // Singleton
const auth = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ========================================
// POST /api/payments/create-intent
// Create a payment intent for booking
// ========================================
router.post('/create-intent', auth, async (req, res, next) => {
    try {
        const { bookingId, amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            metadata: {
                bookingId,
                userId: req.user.userId
            }
        });

        // Update booking with payment intent ID
        if (bookingId) {
            await prisma.booking.update({
                where: { id: parseInt(bookingId) },
                data: {
                    stripePaymentIntentId: paymentIntent.id,
                    paymentStatus: 'pending'
                }
            });
        }

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
    } catch (error) {
        next(error);
    }
});

// ========================================
// POST /api/payments/webhook
// Stripe webhook handler
// ========================================
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;

            // Update booking payment status
            if (paymentIntent.metadata.bookingId) {
                await prisma.booking.update({
                    where: { id: parseInt(paymentIntent.metadata.bookingId) },
                    data: {
                        paymentStatus: 'paid'
                    }
                });
            }

            console.log('Payment succeeded:', paymentIntent.id);
            break;

        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;

            if (failedPayment.metadata.bookingId) {
                await prisma.booking.update({
                    where: { id: parseInt(failedPayment.metadata.bookingId) },
                    data: {
                        paymentStatus: 'failed',
                        status: 'cancelled'
                    }
                });
            }

            console.log('Payment failed:', failedPayment.id);
            break;

        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
});

// ========================================
// GET /api/payments/history
// Get payment history for user
// ========================================
router.get('/history', auth, async (req, res, next) => {
    try {
        const bookings = await prisma.booking.findMany({
            where: {
                OR: [
                    { renterId: req.user.userId },
                    { computer: { userId: req.user.userId } }
                ],
                paymentStatus: { not: null }
            },
            include: {
                computer: {
                    select: { id: true, name: true }
                },
                renter: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ payments: bookings });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
