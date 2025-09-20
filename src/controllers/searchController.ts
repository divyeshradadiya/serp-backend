import express from 'express';
import crypto from 'crypto';
import { db } from '../db/index';
import { auth } from '../auth';
import { fromNodeHeaders } from 'better-auth/node';
import { SearchService } from '../services/searchService';
import {
  apiKeys,
  serpSearchResults,
  workspaceCredits
} from '../db/schema';
import { eq, and } from 'drizzle-orm';

// SearXNG API response interfaces
interface SearXNGResult {
  title: string;
  url: string;
  content?: string;
  snippet?: string;
  engine?: string;
  publishedDate?: string;
}

interface SearXNGResponse {
  results: SearXNGResult[];
  number_of_results?: number;
  suggestions?: string[];
  infobox?: any;
  answers?: any[];
  corrections?: string[];
}

// Our processed result interface
interface ProcessedResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
  engine: string;
  published_date: string | null;
}

export class SearchController {
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

      (req as any).userId = session.user.id;
      (req as any).organizationId = session.session?.activeOrganizationId || null;

      if (!(req as any).organizationId) {
        res.status(400).json({ error: 'No active organization found' });
        return;
      }

      next();
    } catch (error) {
      console.error('Auth error:', error);
      res.status(401).json({ error: 'Authentication failed' });
    }
  }

  // Perform a search request
  async search(req: express.Request, res: express.Response) {
    const { 
      q,
      query,
      engines,
      engine,
      language,
      pageno,
      time_range,
      format = 'json',
      safesearch,
      // Google specific
      hl,
      lr,
      cr,
      // Bing specific  
      mkt,
      // DuckDuckGo specific
      region,
      // Brave specific
      category,
      spellcheck,
      ui_lang,
      country,
      // Legacy support
      maxResults = 10,
      page
    } = req.body;

    const searchQuery = q || query;
    const searchEngines = engines || (engine ? [engine] : ['google']);
    const searchPage = pageno || page || 1;

    if (!searchQuery || typeof searchQuery !== 'string') {
      return res.status(400).json({ error: 'Query parameter (q) is required' });
    }

    if (searchQuery.length > 500) {
      return res.status(400).json({ error: 'Query too long (max 500 characters)' });
    }

    const { organizationId } = req as any;

    try {
      let apiKeyRecord;

      // Check if this is an internal dashboard request (has session auth) or external API request
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        // External API request - validate the provided API key
        const providedKey = authHeader.substring(7);
        const keyHash = crypto.createHash('sha256').update(providedKey).digest('hex');

        // Verify API key
        const apiKeyResult = await db.select()
          .from(apiKeys)
          .where(and(
            eq(apiKeys.keyHash, keyHash),
            eq(apiKeys.organizationId, organizationId),
            eq(apiKeys.isActive, true)
          ))
          .limit(1);

        if (!apiKeyResult[0]) {
          return res.status(401).json({ error: 'Invalid or inactive API key' });
        }

        apiKeyRecord = apiKeyResult[0];
      } else {
        // Internal dashboard request - find any active API key for this organization
        const activeKeys = await db.select()
          .from(apiKeys)
          .where(and(
            eq(apiKeys.organizationId, organizationId),
            eq(apiKeys.isActive, true)
          ))
          .limit(1);

        if (!activeKeys[0]) {
          return res.status(400).json({
            error: 'No active API key found. Please create an API key first.'
          });
        }

        apiKeyRecord = activeKeys[0];
      }

      // Check credit balance
      const credits = await db.select()
        .from(workspaceCredits)
        .where(eq(workspaceCredits.organizationId, organizationId))
        .limit(1);

      const currentCredits = credits[0];
      if (!currentCredits || (currentCredits.balance || 0) <= 0) {
        return res.status(402).json({
          error: 'Insufficient credits. Please purchase more credits to continue.'
        });
      }

      const startTime = Date.now();

      try {
        // Make request to SearXNG with timeout
        const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        // Build search parameters
        const searchParams = new URLSearchParams();
        searchParams.append('q', searchQuery);
        searchParams.append('format', format);
        
        if (searchEngines && Array.isArray(searchEngines)) {
          searchParams.append('engines', searchEngines.join(','));
        }
        
        // Add common parameters
        if (language) searchParams.append('language', language);
        if (safesearch) searchParams.append('safesearch', safesearch);
        if (time_range && time_range !== 'all') searchParams.append('time_range', time_range);
        if (searchPage > 1) searchParams.append('pageno', searchPage.toString());
        
        // Add engine-specific parameters
        if (hl) searchParams.append('hl', hl);
        if (lr) searchParams.append('lr', lr);
        if (cr) searchParams.append('cr', cr);
        if (mkt) searchParams.append('mkt', mkt);
        if (region) searchParams.append('region', region);
        if (category) searchParams.append('category', category);
        if (spellcheck !== undefined) searchParams.append('spellcheck', spellcheck.toString());
        if (ui_lang) searchParams.append('ui_lang', ui_lang);
        if (country) searchParams.append('country', country);

        // Log all search parameters for debugging
        console.log('Search parameters:', searchParams.toString());
        
        const searchUrl = `${searxngUrl}/search?${searchParams.toString()}`;
        console.log('Search request to SearXNG:', searchUrl);


        // call to SerpAPI
        const searchResponse = await fetch(searchUrl, {
          signal: controller.signal,
        });

        
        console.log('SerpAPI response status:', await searchResponse.json());

        clearTimeout(timeoutId);

        if (!searchResponse.ok) {
          console.log('not ok response =========')
          throw new Error(`SearXNG returned ${searchResponse.status}: ${searchResponse.statusText}`);
        }

        const searchData = await searchResponse.json() as SearXNGResponse;
        const responseTime = Date.now() - startTime;

        console.log(`response time`, responseTime)

        // Process results
        const results: ProcessedResult[] = (searchData.results || []).map((result: SearXNGResult, index: number) => ({
          title: result.title || '',
          url: result.url || '',
          snippet: result.content || result.snippet || '',
          position: index + 1,
          engine: result.engine || (searchEngines && searchEngines[0]) || 'unknown',
          published_date: result.publishedDate || null,
        }));

        console.log(`Found ${results.length} results for query "${searchQuery}"`);
        // Deduct credit and log the request
        try {
          const searchService = new SearchService();
          const primaryEngine = Array.isArray(searchEngines) ? searchEngines[0] : searchEngines;
          const creditsToDeduct = searchService.getCreditCost(primaryEngine);
          
          await db.update(workspaceCredits)
            .set({
              balance: (currentCredits.balance || 0) - creditsToDeduct,
              totalUsed: (currentCredits.totalUsed || 0) + creditsToDeduct,
              updatedAt: new Date()
            })
            .where(eq(workspaceCredits.organizationId, organizationId));
        } catch (creditError) {
          console.error('❌ Failed to deduct credits:', creditError);
          // Continue with the search response even if credit deduction fails
          // This prevents the API from failing due to credit system issues
        }

        // Update API key usage
        const currentApiKey = apiKeyRecord;
        await db.update(apiKeys)
          .set({
            requestCount: (currentApiKey.requestCount || 0) + 1,
          })
          .where(eq(apiKeys.id, currentApiKey.id));

        // Generate unique search result ID
        const searchResultId = crypto.randomUUID();

        // Log search result to database
        await db.insert(serpSearchResults)
          .values({
            organizationId,
            searchEngine: (searchEngines && searchEngines.length === 1) ? searchEngines[0] : 'multiple',
            resultsCount: results.length,
            responseTime,
            status: 'success',
          });

        // Return successful response
        return res.json({
          id: searchResultId,
          query: searchQuery,
          engines: searchEngines,
          results,
          metadata: {
            number_of_results: searchData.number_of_results || results.length,
            response_time: responseTime,
            timestamp: new Date().toISOString(),
            credits_used: 1,
          },
          answers: searchData.answers || [],
          corrections: searchData.corrections || [],
          infoboxes: searchData.infobox ? [searchData.infobox] : [],
          suggestions: searchData.suggestions || [],
        });

      } catch (searchError) {
        const responseTime = Date.now() - startTime;

        // Do not deduct credits for failed requests. Credits are only charged on successful searches.
        // This avoids charging users for transient errors or playground exploratory requests.

        // Generate unique search result ID for failed request
        const searchResultId = crypto.randomUUID();

        // Log failed search
        await db.insert(serpSearchResults)
          .values({
            organizationId,
            searchEngine: engine,
            resultsCount: 0,
            responseTime,
            status: 'error',
          });

        // Update API key request count even for failed requests
        const failedApiKey = apiKeyRecord;
        if (failedApiKey) {
          await db.update(apiKeys)
            .set({
              requestCount: (failedApiKey.requestCount || 0) + 1,
            })
            .where(eq(apiKeys.id, failedApiKey.id));
        }

        return res.status(500).json({
          error: 'Search failed',
          details: searchError instanceof Error ? searchError.message : 'Unknown error'
        });
      }

    } catch (error) {
      console.error('Search request error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get list of supported search engines
  async getEngines(req: express.Request, res: express.Response) {
    try {
      // Return static list of supported engines
      // In a real implementation, this might be dynamic based on SearXNG configuration
      const engines = [
        { name: 'google', cost: 1, enabled: true },
        { name: 'bing', cost: 1, enabled: true },
        { name: 'duckduckgo', cost: 1, enabled: true },
        { name: 'brave', cost: 1, enabled: true },
        { name: 'startpage', cost: 1, enabled: true },
        { name: 'yahoo', cost: 1, enabled: true },
      ];

      res.json(engines);
    } catch (error) {
      console.error('Error fetching engines:', error);
      res.status(500).json({ error: 'Failed to fetch supported engines' });
    }
  }
}