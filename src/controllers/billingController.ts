import { Request, Response } from 'express';
import StripeService from '../services/stripe';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  organizationId?: string | null;
}

export class BillingController {
  /**
   * Get available pricing plans
   */
  static async getPricingPlans(req: Request, res: Response): Promise<void> {
    try {
      const plans = StripeService.getPricingPlans();
      res.json({ 
        plans,
        currency: 'usd',
        minimumPurchase: 5,
        maximumPurchase: 2000,
      });
    } catch (error) {
      console.error('Error fetching pricing plans:', error);
      res.status(500).json({ error: 'Failed to fetch pricing plans' });
    }
  }

  /**
   * Create payment intent for credit purchase
   */
  static async createPaymentIntent(req: AuthenticatedRequest, res: Response): Promise<void> {
    const organizationId = req.organizationId;
    
    if (!organizationId) {
      res.status(400).json({ error: 'No organization selected' });
      return;
    }

    try {
      const { amountUsd } = req.body;

      if (!amountUsd || typeof amountUsd !== 'number' || amountUsd < 5) {
        res.status(400).json({ error: 'Amount must be at least $5 USD' });
        return;
      }

      const paymentIntent = await StripeService.createPaymentIntent(
        organizationId,
        amountUsd,
        // { planId: planId || 'custom' }
      );

      res.json(paymentIntent);
    } catch (error) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to create payment intent' 
      });
    }
  }

  /**
   * Get payment history for organization
   */
  static async getPaymentHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    const organizationId = req.organizationId;
    
    if (!organizationId) {
      res.status(400).json({ error: 'No organization selected' });
      return;
    }

    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const history = await StripeService.getPaymentHistory(organizationId, limit);
      
      res.json({ 
        payments: history,
        total: history.length 
      });
    } catch (error) {
      console.error('Error fetching payment history:', error);
      res.status(500).json({ error: 'Failed to fetch payment history' });
    }
  }

  /**
   * Handle Stripe webhook events
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    try {
      // For Stripe webhooks, we need the raw body as a string
      const rawBody = JSON.stringify(req.body);
      const event = StripeService.constructEvent(rawBody, signature);

      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as any;
          console.log(`✅ Payment succeeded: ${paymentIntent.id}`);

          // Extract organization ID from metadata
          const organizationId = paymentIntent.metadata?.organizationId;
          const amountUsd = paymentIntent.amount / 100; // Convert from cents to USD

          if (!organizationId) {
            console.error('❌ No organization ID in payment metadata');
            res.status(400).json({ error: 'Missing organization ID' });
            return;
          }

          // Calculate credits based on the new pricing structure
          const { credits, discountPercent } = StripeService.calculateCredits(amountUsd);

          console.log(`💰 Processing payment: $${amountUsd} → ${credits} credits (${discountPercent}% discount) for org ${organizationId}`);

          await StripeService.handlePaymentSuccess(paymentIntent.id, organizationId, credits, discountPercent);
          break;

        case 'payment_intent.payment_failed':
          const failedPayment = event.data.object as any;
          console.log(`❌ Payment failed: ${failedPayment.id}`);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Webhook processing failed'
      });
    }
  }
}