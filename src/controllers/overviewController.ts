import express from 'express';
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
import { eq, and, desc, count, sql, gte } from 'drizzle-orm';

export class OverviewController {
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

      next();
    } catch (error) {
      console.error('❌ Auth middleware error:', error);
      res.status(401).json({ error: 'Authentication required' });
    }
  }

  // Get overview statistics
  async getStats(req: express.Request, res: express.Response) {
    const organizationId = (req as any).organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'No organization selected' });
    }

    try {
      // Get current date ranges
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get credit information
      const credits = await db.select()
        .from(workspaceCredits)
        .where(eq(workspaceCredits.organizationId, organizationId))
        .limit(1);

      // Get API key counts
      const totalApiKeys = await db.select({ count: count() })
        .from(apiKeys)
        .where(eq(apiKeys.organizationId, organizationId));

      const activeApiKeys = await db.select({ count: count() })
        .from(apiKeys)
        .where(and(
          eq(apiKeys.organizationId, organizationId),
          eq(apiKeys.isActive, true)
        ));

      // Get request counts
      const requestsToday = await db.select({ count: count() })
        .from(serpSearchResults)
        .where(and(
          eq(serpSearchResults.organizationId, organizationId),
          gte(serpSearchResults.createdAt, startOfToday)
        ));

      const requestsThisMonth = await db.select({ count: count() })
        .from(serpSearchResults)
        .where(and(
          eq(serpSearchResults.organizationId, organizationId),
          gte(serpSearchResults.createdAt, startOfMonth)
        ));

      // Get recent requests (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentRequests = await db.select({
        total: count(),
        successful: sql<number>`COUNT(CASE WHEN ${serpSearchResults.status} = 'success' THEN 1 END)`
      })
      .from(serpSearchResults)
      .where(and(
        eq(serpSearchResults.organizationId, organizationId),
        gte(serpSearchResults.createdAt, thirtyDaysAgo)
      ));

      const successRate = recentRequests[0]?.total > 0
        ? Math.round((recentRequests[0].successful / recentRequests[0].total) * 100)
        : 0;

      res.json({
        credits: {
          balance: credits[0]?.balance || 0,
          totalPurchased: credits[0]?.totalPurchased || 0,
          totalUsed: credits[0]?.totalUsed || 0,
        },
        apiKeys: {
          total: totalApiKeys[0]?.count || 0,
          active: activeApiKeys[0]?.count || 0,
        },
        requests: {
          today: requestsToday[0]?.count || 0,
          thisMonth: requestsThisMonth[0]?.count || 0,
          last30Days: recentRequests[0]?.total || 0,
        },
        performance: {
          successRate,
          totalRequests: recentRequests[0]?.total || 0,
          successfulRequests: recentRequests[0]?.successful || 0,
        }
      });

    } catch (error) {
      console.error('Error fetching overview stats:', error);
      res.status(500).json({ error: 'Failed to fetch overview statistics' });
    }
  }

  // Get recent API activity
  async getActivity(req: express.Request, res: express.Response) {
    const organizationId = (req as any).organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'No organization selected' });
    }

    try {
      const limit = parseInt(req.query.limit as string) || 10;

      const recentActivity = await db.select({
        id: serpSearchResults.id,
        engine: serpSearchResults.searchEngine,
        status: serpSearchResults.status,
        resultsCount: serpSearchResults.resultsCount,
        responseTime: serpSearchResults.responseTime,
        createdAt: serpSearchResults.createdAt,
        apiKeyName: sql<string>`'Organization Default'`, // No longer using specific API keys
      })
      .from(serpSearchResults)
      .where(eq(serpSearchResults.organizationId, organizationId))
      .orderBy(desc(serpSearchResults.createdAt))
      .limit(limit);

      res.json({ activity: recentActivity });

    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.status(500).json({ error: 'Failed to fetch recent activity' });
    }
  }

  // Get usage chart data
  async getUsageChart(req: express.Request, res: express.Response) {
    const organizationId = (req as any).organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'No organization selected' });
    }

    try {
      const days = parseInt(req.query.days as string) || 7;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const usageData = await db.select({
        date: sql<string>`DATE(${serpSearchResults.createdAt})`,
        requests: count(),
        successful: sql<number>`COUNT(CASE WHEN ${serpSearchResults.status} = 'success' THEN 1 END)`,
        failed: sql<number>`COUNT(CASE WHEN ${serpSearchResults.status} = 'error' THEN 1 END)`,
      })
      .from(serpSearchResults)
      .where(and(
        eq(serpSearchResults.organizationId, organizationId),
        gte(serpSearchResults.createdAt, startDate)
      ))
      .groupBy(sql`DATE(${serpSearchResults.createdAt})`)
      .orderBy(sql`DATE(${serpSearchResults.createdAt})`);

      res.json({ chartData: usageData });

    } catch (error) {
      console.error('Error fetching usage chart data:', error);
      res.status(500).json({ error: 'Failed to fetch usage chart data' });
    }
  }

  // Get chart data with flexible time periods
  async getChart(req: express.Request, res: express.Response) {
    const organizationId = (req as any).organizationId;
    const { period = 'day', limit = 15 } = req.query;

    if (!organizationId) {
      return res.status(400).json({ error: 'No organization selected' });
    }

    try {
      let startDate: Date;
      let dateFormat: string;

      // Calculate start date based on period
      const now = new Date();
      switch (period) {
        case 'days':
          startDate = new Date(now.getTime() - (parseInt(limit as string) - 1) * 24 * 60 * 60 * 1000);
          dateFormat = 'DATE("serp_search_results"."created_at")';
          break;
        case 'week':
          startDate = new Date(now.getTime() - (parseInt(limit as string) - 1) * 7 * 24 * 60 * 60 * 1000);
          // PostgreSQL syntax for start of week (Monday) - specify table name to avoid ambiguity
          dateFormat = 'DATE("serp_search_results"."created_at" - INTERVAL \'1 day\' * EXTRACT(DOW FROM "serp_search_results"."created_at"))';
          break;
        case 'month':
          startDate = new Date(now.getTime() - (parseInt(limit as string) - 1) * 30 * 24 * 60 * 60 * 1000);
          // PostgreSQL syntax for start of month - specify table name to avoid ambiguity
          dateFormat = 'DATE_TRUNC(\'month\', "serp_search_results"."created_at")::DATE';
          break;
        default:
          startDate = new Date(now.getTime() - (parseInt(limit as string) - 1) * 24 * 60 * 60 * 1000);
          dateFormat = 'DATE("serp_search_results"."created_at")';
      }

      const chartData = await db.select({
        date: sql<string>`${sql.raw(dateFormat)}`,
        requests: count(),
        successful: sql<number>`COUNT(CASE WHEN ${serpSearchResults.status} = 'success' THEN 1 END)`,
        failed: sql<number>`COUNT(CASE WHEN ${serpSearchResults.status} = 'error' THEN 1 END)`,
  credits_used: sql<number>`COUNT(CASE WHEN ${serpSearchResults.status} = 'success' THEN 1 END)`, // Credits counted only for successful requests
        avg_response_time: sql<number>`AVG(${serpSearchResults.responseTime})`,
      })
      .from(serpSearchResults)
      .where(and(
        eq(serpSearchResults.organizationId, organizationId),
        gte(serpSearchResults.createdAt, startDate)
      ))
      .groupBy(sql.raw(dateFormat))
      .orderBy(sql.raw(dateFormat))
      .limit(parseInt(limit as string));

      // Fill missing dates with zero values
      const result = [];
      const currentDate = new Date(startDate);
      const endDate = new Date();

      while (currentDate <= endDate && result.length < parseInt(limit as string)) {
        let dateKey: string;

        if (period === 'week') {
          // Week format - get Monday of the week
          const startOfWeek = new Date(currentDate);
          const dayOfWeek = startOfWeek.getDay();
          const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
          startOfWeek.setDate(diff);
          dateKey = startOfWeek.toISOString().split('T')[0];
        } else if (period === 'month') {
          // Month format
          dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
        } else {
          // Daily format
          dateKey = currentDate.toISOString().split('T')[0];
        }

        const existingData = chartData.find(item => item.date === dateKey);

        result.push({
          date: dateKey,
          requests: existingData?.requests || 0,
          successful: existingData?.successful || 0,
          failed: existingData?.failed || 0,
          credits_used: existingData?.credits_used || 0,
          avg_response_time: existingData?.avg_response_time || 0,
          success_rate: existingData?.requests ? Math.round((existingData.successful / existingData.requests) * 100) : 0,
        });

        // Move to next period
        if (period === 'week') {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (period === 'month') {
          currentDate.setMonth(currentDate.getMonth() + 1);
        } else {
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }

      res.json({
        chartData: result.slice(-parseInt(limit as string)), // Get last N items
        period,
        totalItems: result.length
      });

    } catch (error) {
      console.error('Error fetching chart data:', error);
      res.status(500).json({ error: 'Failed to fetch chart data' });
    }
  }
}