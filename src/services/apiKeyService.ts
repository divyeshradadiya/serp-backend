import crypto from 'crypto';
import { db } from '../db/index';
import { apiKeys, workspaceCredits } from '../db/schema';
import { eq, and, count, desc } from 'drizzle-orm';

export class ApiKeyService {
  // Generate a secure API key
  generateApiKey(): string {
    const prefix = 'sk_';
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `${prefix}${randomBytes}`;
  }

  // Hash API key for storage
  hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  // Validate API key hash
  async validateApiKeyHash(keyHash: string, organizationId: string) {
    const keyRecord = await db.select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.keyHash, keyHash),
        eq(apiKeys.organizationId, organizationId),
        eq(apiKeys.isActive, true)
      ))
      .limit(1);

    if (keyRecord.length === 0) {
      throw new Error('Invalid or inactive API key');
    }

    return keyRecord[0];
  }

  // Check if organization can create more API keys
  async checkApiKeyLimit(organizationId: string) {
    const existingKeys = await db.select({ count: count() })
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, organizationId));

    const maxKeys = 20; // You can make this configurable per plan
    if (existingKeys[0].count >= maxKeys) {
      throw new Error(`Maximum number of API keys (${maxKeys}) reached. Current: ${existingKeys[0].count}`);
    }
  }

  // Create a new API key
  async createApiKey(organizationId: string, name: string) {
    // Check if organization has credits
    const credits = await db.select()
      .from(workspaceCredits)
      .where(eq(workspaceCredits.organizationId, organizationId))
      .limit(1);

    if (!credits[0]) {
      throw new Error('Organization not properly initialized - no credits found');
    }

    // Check API key limit
    await this.checkApiKeyLimit(organizationId);

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
    }).returning({
      id: apiKeys.id,
      name: apiKeys.name,
      isActive: apiKeys.isActive,
      requestLimit: apiKeys.requestLimit,
      createdAt: apiKeys.createdAt,
    });

    return {
      apiKey,
      details: newKey[0]
    };
  }

  // Get all API keys for an organization
  async getApiKeys(organizationId: string) {
    const keys = await db.select({
      id: apiKeys.id,
      name: apiKeys.name,
      isActive: apiKeys.isActive,
      requestLimit: apiKeys.requestLimit,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt));

    return keys;
  }

  // Update an API key
  async updateApiKey(keyId: number, organizationId: string, updates: {
    name?: string;
    isActive?: boolean;
    requestLimit?: number;
  }) {
    // Verify the key belongs to the organization
    const existingKey = await db.select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.organizationId, organizationId)
      ))
      .limit(1);

    if (existingKey.length === 0) {
      throw new Error('API key not found');
    }

    // Prepare update object
    const updateData: any = {
      updatedAt: new Date()
    };

    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.requestLimit !== undefined) updateData.requestLimit = updates.requestLimit;

    // Update the key
    const updatedKey = await db.update(apiKeys)
      .set(updateData)
      .where(eq(apiKeys.id, keyId))
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        isActive: apiKeys.isActive,
        requestLimit: apiKeys.requestLimit,
        updatedAt: apiKeys.updatedAt,
      });

    return updatedKey[0];
  }

  // Delete an API key
  async deleteApiKey(keyId: number, organizationId: string) {
    // Verify the key belongs to the organization
    const existingKey = await db.select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.organizationId, organizationId)
      ))
      .limit(1);

    if (existingKey.length === 0) {
      throw new Error('API key not found');
    }

    // Delete the key (this will cascade to related logs due to foreign key)
    await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
  }

  // Regenerate an API key
  async regenerateApiKey(keyId: number, organizationId: string) {
    // Verify the key belongs to the organization
    const existingKey = await db.select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.organizationId, organizationId)
      ))
      .limit(1);

    if (existingKey.length === 0) {
      throw new Error('API key not found');
    }

    // Generate new API key
    const newApiKey = this.generateApiKey();
    const newKeyHash = this.hashApiKey(newApiKey);

    // Update with new hash
    const updatedKey = await db.update(apiKeys)
      .set({
        keyHash: newKeyHash,
        updatedAt: new Date(),
      })
      .where(eq(apiKeys.id, keyId))
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        isActive: apiKeys.isActive,
        requestLimit: apiKeys.requestLimit,
        updatedAt: apiKeys.updatedAt,
      });

    return {
      apiKey: newApiKey,
      details: updatedKey[0]
    };
  }
}