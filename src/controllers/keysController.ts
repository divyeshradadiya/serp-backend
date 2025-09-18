import express from 'express';
import crypto from 'crypto';
import { db } from '../db/index';
import { auth } from '../auth';
import { fromNodeHeaders } from 'better-auth/node';
import {
  apiKeys,
  serpSearchResults,
  workspaceCredits,
  organization,
  sessions,
  member
} from '../db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';

export class KeysController {
  // Generate a secure API key
  private generateApiKey(): string {
    const prefix = 'sk_';
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `${prefix}${randomBytes}`;
  }

  // Hash API key for storage
  private hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  // Auth middleware using Better Auth's getSession method
  async requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session || !session.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Store user info in request for later use
      (req as any).userId = session.user.id;
      (req as any).organizationId = session.session?.activeOrganizationId || null;

      next();
    } catch (error) {
      console.error('❌ Auth middleware error:', error);
      res.status(401).json({ error: 'Authentication required' });
    }
  }

  // Get all API keys for an organization
  async getKeys(req: express.Request, res: express.Response) {
    const organizationId = (req as any).organizationId;

    try {
      const keys = await db.select({
        id: apiKeys.id,
        name: apiKeys.name,
        isActive: apiKeys.isActive,
        requestLimit: apiKeys.requestLimit,
        requestCount: apiKeys.requestCount,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, organizationId))
      .orderBy(desc(apiKeys.createdAt));

      // Get usage stats for each key
      const keysWithStats = await Promise.all(keys.map(async (key) => {
        const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const usage = await db.select({
          totalRequests: count(),
          successfulRequests: sql<number>`COUNT(CASE WHEN status = 'success' THEN 1 END)`,
          failedRequests: sql<number>`COUNT(CASE WHEN status = 'error' THEN 1 END)`,
        })
        .from(serpSearchResults)
        .where(and(
          eq(serpSearchResults.organizationId, organizationId),
          sql`${serpSearchResults.createdAt} >= ${last30Days}`
        ));

        return {
          ...key,
          keyHash: undefined, // Never return the actual key hash
          usage: usage[0] || { totalRequests: 0, successfulRequests: 0, failedRequests: 0 }
        };
      }));

      res.json({ keys: keysWithStats });
    } catch (error) {
      console.error('Error fetching API keys:', error);
      res.status(500).json({ error: 'Failed to fetch API keys' });
    }
  }

  // Create a new API key
  async createKey(req: express.Request, res: express.Response) {
    const organizationId = (req as any).organizationId;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'API key name is required' });
    }

    try {
      // Check if organization has credits
      const credits = await db.select()
        .from(workspaceCredits)
        .where(eq(workspaceCredits.organizationId, organizationId))
        .limit(1);

      // Organization should have credits by now (created during signin)
      if (!credits[0]) {
        return res.status(402).json({
          error: 'Organization not properly initialized',
          message: 'Please contact support - organization credits not found'
        });
      }

      // Allow API key creation even with 0 credits (they'll need credits to use it)
      // This way users can set up their API infrastructure before purchasing

      // Check if organization already has too many API keys (optional limit)
      const existingKeys = await db.select({ count: count() })
        .from(apiKeys)
        .where(eq(apiKeys.organizationId, organizationId));

      const maxKeys = 10; // You can make this configurable per plan
      if (existingKeys[0].count >= maxKeys) {
        return res.status(400).json({
          error: `Maximum number of API keys (${maxKeys}) reached`,
          current: existingKeys[0].count
        });
      }

      // Generate and hash the API key
      const apiKey = this.generateApiKey();
      const keyHash = this.hashApiKey(apiKey);

      // Insert the new API key
      const newKey = await db.insert(apiKeys).values({
        organizationId,
        keyHash,
        name: name.trim(),
        isActive: true,
        requestLimit: 6000, // Fixed 100 req/sec (6000/min) - not editable from UI
        requestCount: 0,
      }).returning({
        id: apiKeys.id,
        name: apiKeys.name,
        isActive: apiKeys.isActive,
        requestLimit: apiKeys.requestLimit,
        requestCount: apiKeys.requestCount,
        createdAt: apiKeys.createdAt,
      });

      res.status(201).json({
        message: 'API key created successfully',
        key: apiKey, // Only return the actual key once during creation
        details: newKey[0],
        warning: 'Please store this API key securely. You will not be able to see it again.'
      });

    } catch (error) {
      console.error('Error creating API key:', error);
      res.status(500).json({ error: 'Failed to create API key' });
    }
  }

  // Update an API key
  async updateKey(req: express.Request, res: express.Response) {
    const organizationId = (req as any).organizationId;
    const keyId = parseInt(req.params.id);
    const { name, isActive, requestLimit } = req.body;

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid API key ID' });
    }

    try {
      // Verify the key belongs to the organization
      const existingKey = await db.select()
        .from(apiKeys)
        .where(and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.organizationId, organizationId)
        ))
        .limit(1);

      if (existingKey.length === 0) {
        return res.status(404).json({ error: 'API key not found' });
      }

      // Prepare update object
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (isActive !== undefined) updates.isActive = isActive;
      if (requestLimit !== undefined) updates.requestLimit = requestLimit;
      updates.updatedAt = new Date();

      // Update the key
      const updatedKey = await db.update(apiKeys)
        .set(updates)
        .where(eq(apiKeys.id, keyId))
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          isActive: apiKeys.isActive,
          requestLimit: apiKeys.requestLimit,
          requestCount: apiKeys.requestCount,
          updatedAt: apiKeys.updatedAt,
        });

      res.json({
        message: 'API key updated successfully',
        key: updatedKey[0]
      });

    } catch (error) {
      console.error('Error updating API key:', error);
      res.status(500).json({ error: 'Failed to update API key' });
    }
  }

  // Delete an API key
  async deleteKey(req: express.Request, res: express.Response) {
    const organizationId = (req as any).organizationId;
    const keyId = parseInt(req.params.id);

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid API key ID' });
    }

    try {
      // Verify the key belongs to the organization
      const existingKey = await db.select()
        .from(apiKeys)
        .where(and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.organizationId, organizationId)
        ))
        .limit(1);

      if (existingKey.length === 0) {
        return res.status(404).json({ error: 'API key not found' });
      }

      // Delete the key (this will cascade to related logs due to foreign key)
      await db.delete(apiKeys).where(eq(apiKeys.id, keyId));

      res.json({ message: 'API key deleted successfully' });

    } catch (error) {
      console.error('Error deleting API key:', error);
      res.status(500).json({ error: 'Failed to delete API key' });
    }
  }

  // Get detailed usage statistics for a specific API key
  async getKeyUsage(req: express.Request, res: express.Response) {
    const organizationId = (req as any).organizationId;
    const keyId = parseInt(req.params.id);
    const { days = 30 } = req.query;

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid API key ID' });
    }

    try {
      // Verify the key belongs to the organization
      const existingKey = await db.select()
        .from(apiKeys)
        .where(and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.organizationId, organizationId)
        ))
        .limit(1);

      if (existingKey.length === 0) {
        return res.status(404).json({ error: 'API key not found' });
      }

      const daysAgo = new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000);

      // Get detailed usage statistics
      const usage = await db.select()
        .from(serpSearchResults)
        .where(and(
          eq(serpSearchResults.organizationId, existingKey[0].organizationId),
          sql`${serpSearchResults.createdAt} >= ${daysAgo}`
        ))
        .orderBy(desc(serpSearchResults.createdAt));

      // Calculate statistics
      const stats = usage.reduce((acc, record) => {
        acc.totalRequests++;
        if (record.status === 'success') acc.successfulRequests++;
        if (record.status === 'error') acc.failedRequests++;
        acc.totalResponseTime += record.responseTime || 0;

        // Engine statistics
        if (record.searchEngine) {
          acc.engineStats[record.searchEngine] = (acc.engineStats[record.searchEngine] || 0) + 1;
        }

        // Daily statistics
        const date = record.createdAt?.toISOString().split('T')[0];
        if (date) {
          if (!acc.dailyStats[date]) {
            acc.dailyStats[date] = { requests: 0, errors: 0, avgResponseTime: 0, totalResponseTime: 0 };
          }
          acc.dailyStats[date].requests++;
          if (record.status === 'error') acc.dailyStats[date].errors++;
          acc.dailyStats[date].totalResponseTime += record.responseTime || 0;
          acc.dailyStats[date].avgResponseTime = acc.dailyStats[date].totalResponseTime / acc.dailyStats[date].requests;
        }

        return acc;
      }, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalResponseTime: 0,
        avgResponseTime: 0,
        engineStats: {} as Record<string, number>,
        dailyStats: {} as Record<string, any>
      });

      // Calculate average response time
      stats.avgResponseTime = stats.totalRequests > 0 ? stats.totalResponseTime / stats.totalRequests : 0;

      res.json({
        api_key: existingKey[0],
        period_days: parseInt(days as string),
        statistics: stats,
        recent_requests: usage.slice(0, 50)
      });

    } catch (error) {
      console.error('Error fetching API key usage:', error);
      res.status(500).json({ error: 'Failed to fetch API key usage' });
    }
  }

  // Regenerate an API key
  async regenerateKey(req: express.Request, res: express.Response) {
    const organizationId = (req as any).organizationId;
    const keyId = parseInt(req.params.id);

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid API key ID' });
    }

    try {
      // Verify the key belongs to the organization
      const existingKey = await db.select()
        .from(apiKeys)
        .where(and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.organizationId, organizationId)
        ))
        .limit(1);

      if (existingKey.length === 0) {
        return res.status(404).json({ error: 'API key not found' });
      }

      // Generate new API key
      const newApiKey = this.generateApiKey();
      const newKeyHash = this.hashApiKey(newApiKey);

      // Update with new hash
      const updatedKey = await db.update(apiKeys)
        .set({
          keyHash: newKeyHash,
          updatedAt: new Date(),
          requestCount: 0 // Reset request count for new key
        })
        .where(eq(apiKeys.id, keyId))
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          isActive: apiKeys.isActive,
          requestLimit: apiKeys.requestLimit,
          requestCount: apiKeys.requestCount,
          updatedAt: apiKeys.updatedAt,
        });

      res.json({
        message: 'API key regenerated successfully',
        key: newApiKey, // Only return the actual key once
        details: updatedKey[0],
        warning: 'Please store this new API key securely. The old key is now invalid.'
      });

    } catch (error) {
      console.error('Error regenerating API key:', error);
      res.status(500).json({ error: 'Failed to regenerate API key' });
    }
  }
}