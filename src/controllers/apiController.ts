import express from 'express';
import crypto from 'crypto';
import { db } from '../db/index';
import {
  apiKeys,
  serpSearchResults,
  serpConfiguration,
  workspaceCredits
} from '../db/schema';
import { eq, and, gte, desc, lte, sql, sum } from 'drizzle-orm';

// Credit-based pricing plans (constants)
const CREDIT_PLANS = {
  starter: {
    name: 'Starter Pack',
    credits: 1000,
    price: 500, // $5.00 in cents
    bonus: 0,
    description: 'Perfect for testing and small projects'
  },
  professional: {
    name: 'Professional Pack',
    credits: 5000,
    price: 2000, // $20.00 in cents
    bonus: 500, // Extra 500 credits
    description: 'Great for growing businesses'
  },
  enterprise: {
    name: 'Enterprise Pack',
    credits: 25000,
    price: 8000, // $80.00 in cents
    bonus: 5000, // Extra 5000 credits
    description: 'For high-volume applications'
  },
  ultimate: {
    name: 'Ultimate Pack',
    credits: 100000,
    price: 25000, // $250.00 in cents
    bonus: 25000, // Extra 25000 credits
    description: 'Maximum value for enterprise use'
  }
};

// Rate limiting configuration - 100 requests per second (6000 per minute) for all API keys
const DEFAULT_RATE_LIMIT = 6000; // 100 requests per second = 6000 per minute

// SearXNG Search Engines Configuration
const SUPPORTED_ENGINES = {
  'google': { name: 'Google', code: 'google', hasApi: true },
  'duckduckgo': { name: 'DuckDuckGo', code: 'duckduckgo', hasApi: true },
  'brave': { name: 'Brave Search', code: 'brave', hasApi: true },
  'startpage': { name: 'Startpage', code: 'startpage', hasApi: true },
  'mojeek': { name: 'Mojeek', code: 'mojeek', hasApi: true },
  'yahoo': { name: 'Yahoo', code: 'yahoo', hasApi: true },
  'yep': { name: 'Yep', code: 'yep', hasApi: true },
  'searx': { name: 'SearX', code: 'searx', hasApi: true },
  'qwant': { name: 'Qwant', code: 'qwant', hasApi: true }
  // Note: Bing excluded as mentioned - doesn't provide reliable API access
};

// Default SearXNG instances (fallback list)
const DEFAULT_SEARXNG_INSTANCES = [
  'https://searx.stream',
  'https://search.rhscz.eu',
  'https://searx.rhscz.eu',
  'https://searx.tiekoetter.com',
  'https://northboot.xyz',
  'https://search.inetol.net',
  'https://opnxng.com'
];

interface SerpResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
  engine?: string;
  published_date?: string;
}

interface SearxngResponse {
  query: string;
  number_of_results: number;
  results: Array<{
    title: string;
    url: string;
    content: string;
    publishedDate?: string;
    engine?: string;
  }>;
  answers?: Array<{
    answer: string;
    url: string;
  }>;
  corrections?: Array<string>;
  infoboxes?: Array<{
    infobox: string;
    content: string;
    urls: Array<{ title: string; url: string }>;
  }>;
}

interface SearchOptions {
  engines?: string[];
  language?: string;
  country?: string;
  safesearch?: number;
  timeRange?: string;
  page?: number;
  category?: string;
}

export class ApiController {
  // Get rate limit - now uniform for all users
  private getRateLimit(creditBalance: number): number {
    return DEFAULT_RATE_LIMIT; // Fixed 100 req/sec for all API keys
  }

  // Get healthy SearXNG instance
  private async getHealthySearxngInstance(): Promise<string> {
    try {
      // Try to get from database configuration first
      const instances = await db.select()
        .from(serpConfiguration)
        .where(and(
          eq(serpConfiguration.isActive, true),
          eq(serpConfiguration.healthStatus, 'healthy')
        ))
        .orderBy(desc(serpConfiguration.priority));

      if (instances.length > 0) {
        return instances[0].instanceUrl;
      }

      // Fallback to default instances
      return DEFAULT_SEARXNG_INSTANCES[0];
    } catch (error) {
      console.error('Error getting SearXNG instance:', error);
      return DEFAULT_SEARXNG_INSTANCES[0];
    }
  }

  // Function to fetch from SearXNG with comprehensive options
  private async fetchFromSearxng(
    query: string,
    options: SearchOptions = {},
    instance?: string
  ): Promise<{ results: SerpResult[], metadata: any, instance: string }> {
    const searxngUrl = instance || await this.getHealthySearxngInstance();
    const url = `${searxngUrl}/search`;

    // Build search parameters
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      safesearch: (options.safesearch || 1).toString(),
      pageno: (options.page || 1).toString(),
    });

    // Add engines if specified
    if (options.engines && options.engines.length > 0) {
      params.append('engines', options.engines.join(','));
    } else {
      params.append('engines', 'google,duckduckgo'); // Default engines
    }

    // Add language if specified
    if (options.language) {
      params.append('language', options.language);
    }

    // Add time range if specified
    if (options.timeRange) {
      params.append('time_range', options.timeRange);
    }

    // Add category if specified
    if (options.category) {
      params.append('categories', options.category);
    }

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${url}?${params}`, {
        headers: {
          'User-Agent': 'SERP-API/1.0 (+https://yourdomain.com)',
          'Accept': 'application/json',
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`SearXNG API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as SearxngResponse;
      const responseTime = Date.now() - startTime;

      const results: SerpResult[] = data.results.map((result, index) => ({
        title: result.title,
        url: result.url,
        snippet: result.content,
        position: index + 1,
        engine: result.engine,
        published_date: result.publishedDate
      }));

      const metadata = {
        query: data.query,
        number_of_results: data.number_of_results,
        response_time: responseTime,
        answers: data.answers || [],
        corrections: data.corrections || [],
        infoboxes: data.infoboxes || [],
        search_engines: options.engines,
        page: options.page || 1,
        language: options.language,
        safe_search: options.safesearch,
        time_range: options.timeRange
      };

      return { results, metadata, instance: searxngUrl };

    } catch (error) {
      console.error('SearXNG fetch error:', error);
      throw new Error(`Failed to fetch search results: ${error}`);
    }
  }

  // Log comprehensive search results
  private async logSearchResult(
    organizationId: string,
    query: string,
    options: SearchOptions,
    results: SerpResult[],
    metadata: any,
    instance: string,
    status: string,
    errorMessage?: string,
    req?: express.Request,
    responseTime?: number
  ) {
    try {
      await db.insert(serpSearchResults).values({
        organizationId,
        searchEngine: (options.engines && options.engines.length === 1) ? options.engines[0] : 'multiple',
        resultsCount: results.length,
        status,
        responseTime,
      });
    } catch (error) {
      console.error('Failed to log search result:', error);
    }
  }

  // Update credit balance after successful search
  private async deductCredit(organizationId: string, credits: number = 1) {
    try {
      await db.update(workspaceCredits)
        .set({
          balance: sql`${workspaceCredits.balance} - ${credits}`,
          totalUsed: sql`${workspaceCredits.totalUsed} + ${credits}`,
          updatedAt: new Date()
        })
        .where(eq(workspaceCredits.organizationId, organizationId));
    } catch (error) {
      console.error('Failed to deduct credit:', error);
    }
  }

  // SERP search endpoint handler
  async search(req: express.Request, res: express.Response) {
    const startTime = Date.now();
    const {
      q: query,
      engines,
      language = 'en',
      country,
      safesearch = 1,
      time_range: timeRange,
      page = 1,
      category = 'general',
      cache = 'true'
    } = req.query;

    const apiKey = (req as any).apiKey;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Query parameter "q" is required',
        example: '/api/search?q=javascript&engines=google,duckduckgo'
      });
    }

    const searchOptions: SearchOptions = {
      engines: engines ? (engines as string).split(',').filter(e => e in SUPPORTED_ENGINES) : undefined,
      language: language as string,
      country: country as string,
      safesearch: parseInt(safesearch as string) || 1,
      timeRange: timeRange as string,
      page: parseInt(page as string) || 1,
      category: category as string
    };

    try {
      // Validate engines
      if (searchOptions.engines) {
        const invalidEngines = searchOptions.engines.filter(e => !(e in SUPPORTED_ENGINES));
        if (invalidEngines.length > 0) {
          return res.status(400).json({
            error: 'Invalid search engines',
            invalid_engines: invalidEngines,
            supported_engines: Object.keys(SUPPORTED_ENGINES)
          });
        }
      }

      let results: SerpResult[] = [];
      let metadata: any = {};
      let instance: string = '';

      // Fetch results from SearXNG
      const searchResult = await this.fetchFromSearxng(query, searchOptions);
      results = searchResult.results;
      metadata = searchResult.metadata;
      instance = searchResult.instance;

      const totalResponseTime = Date.now() - startTime;

      // Log the search
      await this.logSearchResult(
        apiKey.organizationId,
        query,
        searchOptions,
        results,
        metadata,
        instance,
        'success',
        undefined,
        req,
        totalResponseTime
      );

      // Update credit balance (always deduct since no caching)
      const primaryEngine = searchOptions.engines ? searchOptions.engines[0] : 'google';
      const creditCosts: Record<string, number> = {
        'google': 1,
        'bing': 2,
        'duckduckgo': 2,
        'brave': 3
      };
      const creditsToDeduct = creditCosts[primaryEngine.toLowerCase()] || 1;
      await this.deductCredit(apiKey.organizationId, creditsToDeduct);

      const responseTime = Date.now() - startTime;
      const creditBalance = (req as any).creditBalance;

      res.json({
        query,
        results,
        metadata: {
          ...metadata,
          cached: false, // Always false since no caching
          total_response_time: responseTime,
          api_version: '1.0',
          instance_used: instance,
          credits: {
            balance: creditBalance - creditsToDeduct,
            used_for_request: creditsToDeduct,
            rate_limit: (req as any).rateLimit
          }
        }
      });

    } catch (error: any) {
      console.error('Search error:', error);

      const totalResponseTime = Date.now() - startTime;

      await this.logSearchResult(
        apiKey.organizationId,
        query,
        searchOptions,
        [],
        {},
        '',
        'error',
        error?.message || 'Unknown error',
        req,
        totalResponseTime
      );

      res.status(500).json({
        error: 'Failed to fetch search results',
        message: error?.message || 'Unknown error'
      });
    }
  }

  // Get supported search engines
  async getEngines(req: express.Request, res: express.Response) {
    res.json({
      supported_engines: SUPPORTED_ENGINES,
      default_engines: ['google', 'duckduckgo'],
      note: 'Bing is not included due to API access limitations'
    });
  }

  // Get available credit plans
  async getPlans(req: express.Request, res: express.Response) {
    res.json({
      credit_plans: CREDIT_PLANS,
      pricing_model: 'pay_as_you_go',
      currency: 'USD',
      minimum_purchase: '$5.00',
      rate_limit: `${DEFAULT_RATE_LIMIT} requests per minute (100 req/sec)`,
      note: 'Credits never expire and are charged per successful search request'
    });
  }

  // Get API usage statistics
  async getUsage(req: express.Request, res: express.Response) {
    const apiKey = (req as any).apiKey;
    const { days = 30 } = req.query;

    try {
      const daysAgo = new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000);

      const usage = await db.select()
        .from(serpSearchResults)
        .where(and(
          eq(serpSearchResults.organizationId, apiKey.organizationId),
          gte(serpSearchResults.createdAt, daysAgo)
        ))
        .orderBy(desc(serpSearchResults.createdAt));

      const stats = usage.reduce((acc, record) => {
        acc.totalRequests++;
        if (record.status === 'success') acc.successfulRequests++;
        if (record.status === 'error') acc.failedRequests++;

        // Engine stats
        if (record.searchEngine) {
          acc.engineStats[record.searchEngine] = (acc.engineStats[record.searchEngine] || 0) + 1;
        }

        return acc;
      }, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        engineStats: {} as Record<string, number>
      });

      // Get current credit balance
      const credits = await db.select()
        .from(workspaceCredits)
        .where(eq(workspaceCredits.organizationId, apiKey.organizationId))
        .limit(1);

      res.json({
        api_key: apiKey.name,
        organization_id: apiKey.organizationId,
        period_days: parseInt(days as string),
        statistics: stats,
        credits: credits[0] || { balance: 0, totalPurchased: 0, totalUsed: 0 },
        recent_requests: usage.slice(0, 10)
      });
    } catch (error) {
      console.error('Usage stats error:', error);
      res.status(500).json({ error: 'Failed to fetch usage statistics' });
    }
  }

  // Get dashboard statistics
  async getDashboardStats(req: express.Request, res: express.Response) {
    try {
      const apiKey = (req as any).apiKey;
      const days = req.query.days || '30';

      // Get total requests for the period
      const totalRequests = await db.select({
        count: sql<number>`COUNT(*)`
      })
      .from(serpSearchResults)
      .where(and(
        eq(serpSearchResults.organizationId, apiKey.organizationId),
        gte(serpSearchResults.createdAt, new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000))
      ));

      // Get successful requests
      const successfulRequests = await db.select({
        count: sql<number>`COUNT(*)`
      })
      .from(serpSearchResults)
      .where(and(
        eq(serpSearchResults.organizationId, apiKey.organizationId),
        eq(serpSearchResults.status, 'success'),
        gte(serpSearchResults.createdAt, new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000))
      ));

      // Get this month's requests
      const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const thisMonthRequests = await db.select({
        count: sql<number>`COUNT(*)`
      })
      .from(serpSearchResults)
      .where(and(
        eq(serpSearchResults.organizationId, apiKey.organizationId),
        gte(serpSearchResults.createdAt, thisMonthStart)
      ));

      // Get active API keys count
      const activeKeys = await db.select({
        count: sql<number>`COUNT(*)`
      })
      .from(apiKeys)
      .where(and(
        eq(apiKeys.organizationId, apiKey.organizationId),
        eq(apiKeys.isActive, true)
      ));

      const total = totalRequests[0]?.count || 0;
      const successful = successfulRequests[0]?.count || 0;
      const successRate = total > 0 ? (successful / total) * 100 : 0;

      res.json({
        totalRequests: total,
        successfulRequests: successful,
        successRate: Math.round(successRate * 100) / 100,
        thisMonthRequests: thisMonthRequests[0]?.count || 0,
        activeKeys: activeKeys[0]?.count || 0
      });
    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
  }

  // Get usage chart data
  async getUsageChart(req: express.Request, res: express.Response) {
    try {
      const apiKey = (req as any).apiKey;
      const days = parseInt(req.query.days as string) || 30;

      // Get daily usage for the last N days
      const usageData = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

        const dailyRequests = await db.select({
          count: sql<number>`COUNT(*)`
        })
        .from(serpSearchResults)
        .where(and(
          eq(serpSearchResults.organizationId, apiKey.organizationId),
          gte(serpSearchResults.createdAt, startOfDay),
          lte(serpSearchResults.createdAt, endOfDay)
        ));

        usageData.push({
          date: startOfDay.toISOString().split('T')[0],
          requests: dailyRequests[0]?.count || 0
        });
      }

      res.json({ usageData });
    } catch (error) {
      console.error('Usage chart error:', error);
      res.status(500).json({ error: 'Failed to fetch usage chart data' });
    }
  }

  // Get credit information
  async getCredits(req: express.Request, res: express.Response) {
    try {
      const apiKey = (req as any).apiKey;

      // Get current credit balance
      const credits = await db.select()
        .from(workspaceCredits)
        .where(eq(workspaceCredits.organizationId, apiKey.organizationId))
        .limit(1);

      const creditInfo = credits[0] || { balance: 0, totalPurchased: 0, totalUsed: 0 };

      // Calculate usage this month
      const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const thisMonthUsage = await db.select({
        count: sql<number>`COUNT(*)`
      })
      .from(serpSearchResults)
      .where(and(
        eq(serpSearchResults.organizationId, apiKey.organizationId),
        gte(serpSearchResults.createdAt, thisMonthStart)
      ));

      res.json({
        balance: creditInfo.balance,
        totalPurchased: creditInfo.totalPurchased,
        totalUsed: creditInfo.totalUsed,
        thisMonthUsage: thisMonthUsage[0]?.count || 0,
        plan: 'Pro Plan', // This could be dynamic based on credit tiers
        planLimit: 10000 // This could be dynamic based on plan
      });
    } catch (error) {
      console.error('Credits info error:', error);
      res.status(500).json({ error: 'Failed to fetch credit information' });
    }
  }
}