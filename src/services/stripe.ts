import Stripe from 'stripe';
import { db } from '../db/index';
import { 
  stripePaymentIntents, 
  creditPurchases, 
  workspaceCredits
} from '../db/schema';
import { eq, and } from 'drizzle-orm';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

export interface CreditPlan {
  id: string;
  name: string;
  credits: number;
  priceUsd: number; // in cents
  discountPercent: number;
  description?: string;
}

// Credit pricing tiers with direct credit amounts
export const CREDIT_PLANS: CreditPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 6250, // $5 at $0.80 per 1k = 6,250 credits
    priceUsd: 500, // $5.00 in cents
    discountPercent: 0,
    description: '$5 - $29 • $0.80 / 1k req'
  },
  {
    id: 'standard',
    name: 'Standard',
    credits: 46154, // $30 at $0.65 per 1k = 46,154 credits
    priceUsd: 3000, // $30.00 in cents
    discountPercent: 33,
    description: '$30 - $99 • $0.65 / 1k req'
  },
  {
    id: 'scale',
    name: 'Scale',
    credits: 222222, // $100 at $0.45 per 1k = 222,222 credits
    priceUsd: 10000, // $100.00 in cents
    discountPercent: 78,
    description: '$100 - $499 • $0.45 / 1k req'
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    credits: 1666667, // $500 at $0.30 per 1k = 1,666,667 credits
    priceUsd: 50000, // $500.00 in cents
    discountPercent: 220,
    description: '$500 - $2k • $0.30 / 1k req'
  }
];

export class StripeService {
  /**
   * Calculate credits based on amount with direct pricing tiers
   */
  static calculateCredits(amountUsd: number): { credits: number; discountPercent: number } {
    // Direct pricing based on dollar amount tiers
    if (amountUsd >= 500 && amountUsd <= 2000) {
      // Ultimate tier: $0.30 per 1k requests
      const credits = Math.floor((amountUsd / 0.30) * 1000);
      return { credits, discountPercent: 220 };
    } else if (amountUsd >= 100 && amountUsd <= 499) {
      // Scale tier: $0.45 per 1k requests
      const credits = Math.floor((amountUsd / 0.45) * 1000);
      return { credits, discountPercent: 78 };
    } else if (amountUsd >= 30 && amountUsd <= 99) {
      // Standard tier: $0.65 per 1k requests
      const credits = Math.floor((amountUsd / 0.65) * 1000);
      return { credits, discountPercent: 33 };
    } else if (amountUsd >= 5 && amountUsd <= 29) {
      // Starter tier: $0.80 per 1k requests
      const credits = Math.floor((amountUsd / 0.80) * 1000);
      return { credits, discountPercent: 0 };
    } else {
      throw new Error('Purchase amount must be between $5 and $2000 USD');
    }
  }

  /**
   * Create a Stripe Payment Intent for credit purchase
   */
  static async createPaymentIntent(
    organizationId: string,
    amountUsd: number,
    metadata?: Record<string, string>
  ): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    credits: number;
    discountPercent: number;
  }> {
    const { credits, discountPercent } = this.calculateCredits(amountUsd);
    const amountCents = Math.round(amountUsd * 100);

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        metadata: {
          organizationId,
          credits: credits.toString(),
          discountPercent: discountPercent.toString(),
          ...metadata,
        },
      });

      // Store payment intent in database
      await db.insert(stripePaymentIntents).values({
        organizationId,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret!,
        amount: amountCents,
        currency: 'usd',
        status: paymentIntent.status,
        creditsRequested: credits,
        discountPercent,
        metadata: paymentIntent.metadata,
      });

      return {
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id,
        credits,
        discountPercent,
      };
    } catch (error) {
      console.error('Failed to create Stripe payment intent:', error);
      throw new Error('Failed to create payment intent');
    }
  }

  /**
   * Handle successful payment webhook from Stripe
   */
  static async handlePaymentSuccess(
    paymentIntentId: string,
    organizationId?: string,
    creditsOverride?: number,
    discountPercentOverride?: number
  ): Promise<void> {
    try {
      // Get payment intent from Stripe
      const stripePaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (stripePaymentIntent.status !== 'succeeded') {
        throw new Error(`Payment intent status is ${stripePaymentIntent.status}, not succeeded`);
      }

      // Get our stored payment intent
      const [storedIntent] = await db
        .select()
        .from(stripePaymentIntents)
        .where(eq(stripePaymentIntents.paymentIntentId, paymentIntentId))
        .limit(1);

      if (!storedIntent) {
        throw new Error(`Payment intent ${paymentIntentId} not found in database`);
      }

      // Use provided values or fall back to stored values
      const finalOrganizationId = organizationId || storedIntent.organizationId;
      const finalCredits = creditsOverride || storedIntent.creditsRequested;
      const finalDiscountPercent = discountPercentOverride || storedIntent.discountPercent;

      // Check if already processed
      const existingPurchase = await db
        .select()
        .from(creditPurchases)
        .where(eq(creditPurchases.paymentId, paymentIntentId))
        .limit(1);

      if (existingPurchase.length > 0) {
        console.log(`Payment ${paymentIntentId} already processed`);
        return;
      }

      // Create credit purchase record
      await db.insert(creditPurchases).values({
        organizationId: finalOrganizationId,
        amount: storedIntent.amount,
        credits: finalCredits,
        paymentMethod: 'stripe',
        paymentId: paymentIntentId,
        status: 'completed',
      });

      // Update workspace credits
      const [currentCredits] = await db
        .select()
        .from(workspaceCredits)
        .where(eq(workspaceCredits.organizationId, finalOrganizationId))
        .limit(1);

      if (currentCredits) {
        // Update existing credits
        await db
          .update(workspaceCredits)
          .set({
            balance: (currentCredits.balance ?? 0) + finalCredits,
            totalPurchased: (currentCredits.totalPurchased ?? 0) + finalCredits,
            lastPurchase: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(workspaceCredits.organizationId, finalOrganizationId));
      } else {
        // Create new credits record
        await db.insert(workspaceCredits).values({
          organizationId: finalOrganizationId,
          balance: finalCredits,
          totalPurchased: finalCredits,
          totalUsed: 0,
          lastPurchase: new Date(),
        });
      }

      // Update payment intent status
      await db
        .update(stripePaymentIntents)
        .set({
          status: stripePaymentIntent.status,
          updatedAt: new Date(),
        })
        .where(eq(stripePaymentIntents.paymentIntentId, paymentIntentId));

      console.log(`✅ Successfully processed payment ${paymentIntentId} for ${finalCredits} credits (${finalDiscountPercent}% discount) for org ${finalOrganizationId}`);
    } catch (error) {
      console.error('Failed to handle payment success:', error);
      throw error;
    }
  }

  /**
   * Get pricing plans for frontend
   */
  static getPricingPlans(): CreditPlan[] {
    return CREDIT_PLANS;
  }

  /**
   * Validate webhook signature
   */
  static constructEvent(payload: string, signature: string): Stripe.Event {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpointSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
    }

    try {
      return stripe.webhooks.constructEvent(payload, signature, endpointSecret);
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Get payment history for organization
   */
  static async getPaymentHistory(organizationId: string, limit = 10) {
    return await db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.organizationId, organizationId))
      .orderBy(creditPurchases.createdAt)
      .limit(limit);
  }
}

export default StripeService;