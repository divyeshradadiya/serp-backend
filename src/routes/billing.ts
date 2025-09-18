import express from 'express';
import { BillingController } from '../controllers/billingController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

// Get available pricing plans
router.get('/pricing-plans', BillingController.getPricingPlans);

// Create payment intent for credit purchase
router.post('/create-payment-intent', requireAuth, BillingController.createPaymentIntent);

// Get payment history
router.get('/payment-history', requireAuth, BillingController.getPaymentHistory);

// Stripe webhook endpoint
router.post('/webhook', express.json({ type: 'application/json' }), BillingController.handleWebhook);

export default router;