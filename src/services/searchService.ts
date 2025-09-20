import express from 'express';
import { db } from '../db/index';
import { apiKeys, serpSearchResults, workspaceCredits } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
  engine: string;
  published_date: string | null;
}

export interface SearchOptions {
  // Common parameters
  q: string;
  engines?: string[];
  language?: string;
  pageno?: number;
  time_range?: string;
  format?: string;
  safesearch?: string;
  
  // Google specific
  hl?: string;
  lr?: string;
  cr?: string;
  
  // Bing specific
  mkt?: string;
  
  // DuckDuckGo specific
  region?: string;
  
  // Brave specific
  category?: string;
  spellcheck?: boolean;
  ui_lang?: string;
  country?: string;

  // Legacy support
  page?: number;
}

export class SearchService {
  // Validate API key and get key record
  async validateApiKey(apiKeyHash: string, organizationId: string) {
    try {
      const keyRecord = await db.select()
        .from(apiKeys)
        .where(and(
          eq(apiKeys.keyHash, apiKeyHash),
          eq(apiKeys.organizationId, organizationId),
          eq(apiKeys.isActive, true)
        ))
        .limit(1);

      if (keyRecord.length === 0) {
        throw new Error('Invalid or inactive API key');
      }

      return keyRecord[0];
    } catch (error) {
      console.error('DB Error in validateApiKey:', error);
      throw new Error('Database connection error. Please try again.');
    }
  }

  // Check credit balance
  async checkCreditBalance(organizationId: string) {
    const credits = await db.select()
      .from(workspaceCredits)
      .where(eq(workspaceCredits.organizationId, organizationId))
      .limit(1);

    const currentCredits = credits[0];
    if (!currentCredits || (currentCredits.balance || 0) <= 0) {
      throw new Error('Insufficient credits. Please purchase more credits to continue.');
    }

    return currentCredits;
  }

  // Get credit cost for a search engine
  getCreditCost(engine: string): number {
    const creditCosts: Record<string, number> = {
      'google': 1,
      'bing': 2,
      'duckduckgo': 2,
      'brave': 3
    };
    return creditCosts[engine.toLowerCase()] || 1; // Default to 1 if engine not found
  }

  // Deduct credit from organization
  async deductCredit(organizationId: string, credits: number = 1) {
    await db.update(workspaceCredits)
      .set({
        balance: sql`${workspaceCredits.balance} - ${credits}`,
        totalUsed: sql`${workspaceCredits.totalUsed} + ${credits}`,
        updatedAt: new Date()
      })
      .where(eq(workspaceCredits.organizationId, organizationId));
  }

  // Update API key usage - REMOVED (no longer tracking requestCount and lastUsed)
  // async updateApiKeyUsage(apiKeyId: number) {
  //   await db.update(apiKeys)
  //     .set({
  //       requestCount: sql`${apiKeys.requestCount} + 1`,
  //       lastUsed: new Date()
  //     })
  //     .where(eq(apiKeys.id, apiKeyId));
  // }

  // Log search result
  async logSearchResult(
    apiKeyId: number,
    organizationId: string,
    query: string,
    options: SearchOptions,
    results: SearchResult[],
    metadata: any,
    instance: string,
    status: string,
    errorMessage?: string,
    req?: express.Request,
    responseTime?: number
  ) {
    await db.insert(serpSearchResults).values({
      organizationId,
      searchEngine: (options.engines && options.engines.length === 1) ? options.engines[0] : 'multiple',
      resultsCount: results.length,
      status,
      responseTime,
    });
  }

  // Process search results from SearXNG response
  processSearchResults(searxngResults: any[]): SearchResult[] {
    return searxngResults.map((result, index) => ({
      title: result.title || '',
      url: result.url || '',
      snippet: result.content || result.snippet || '',
      position: index + 1,
      engine: result.engine || 'unknown',
      published_date: result.publishedDate || null,
    }));
  }

  // Validate search engines
  validateEngines(engines: string[], supportedEngines: string[]) {
    if (!engines) return;

    const invalidEngines = engines.filter(e => !supportedEngines.includes(e));
    if (invalidEngines.length > 0) {
      throw new Error(`Invalid search engines: ${invalidEngines.join(', ')}. Supported: ${supportedEngines.join(', ')}`);
    }
  }

  // Get supported search engines
  getSupportedEngines() {
    return [
      { name: 'google', cost: 1, enabled: true },
      { name: 'bing', cost: 1, enabled: true },
      { name: 'duckduckgo', cost: 1, enabled: true },
      { name: 'brave', cost: 1, enabled: true },
      { name: 'startpage', cost: 1, enabled: true },
      { name: 'yahoo', cost: 1, enabled: true },
    ];
  }
}