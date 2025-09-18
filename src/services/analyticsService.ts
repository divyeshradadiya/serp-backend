import { db } from '../db/index';
import { apiKeys, serpSearchResults, workspaceCredits } from '../db/schema';
import { eq, and, count, sql, gte, desc, lte } from 'drizzle-orm';

// Analytics tracking interface (what we save, not the actual results)
export interface SearchAnalytics {
  engine: string;
  query: string;
  responseTime: number; // in milliseconds
  creditsUsed: number;
  timestamp: string; // ISO date string
  parametersUsed: Record<string, any>;
  success: boolean;
  errorMessage?: string;
  resultsCount?: number; // just the count, not the actual results
}

export class AnalyticsService {
  // Track search analytics (minimal data storage)
  async trackSearch(
    organizationId: string,
    analytics: SearchAnalytics
  ) {
    await db.insert(serpSearchResults).values({
      organizationId,
      searchEngine: analytics.engine,
      resultsCount: analytics.resultsCount || 0,
      status: analytics.success ? 'success' : 'error',
      responseTime: analytics.responseTime,
    });
  }
  // Get overview statistics for an organization
  async getOverviewStats(organizationId: string) {
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

    // Get average response time for recent requests
    const avgResponseTimeResult = await db.select({
      avgResponseTime: sql<number>`AVG(${serpSearchResults.responseTime})`
    })
    .from(serpSearchResults)
    .where(and(
      eq(serpSearchResults.organizationId, organizationId),
      gte(serpSearchResults.createdAt, thirtyDaysAgo),
      sql`${serpSearchResults.responseTime} IS NOT NULL`
    ));

    const averageResponseTime = Math.round(avgResponseTimeResult[0]?.avgResponseTime || 0);
    const successRate = recentRequests[0]?.total > 0
      ? Math.round((recentRequests[0].successful / recentRequests[0].total) * 100)
      : 0;

    return {
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
        averageResponseTime,
      }
    };
  }

  // Get recent API activity
  async getRecentActivity(organizationId: string, limit: number = 10) {
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

    return recentActivity;
  }

  // Get usage chart data
  async getUsageChart(organizationId: string, days: number = 7) {
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

    return usageData;
  }

  // Get chart data with flexible time periods
  async getChartData(organizationId: string, period: string = 'week', limit: number = 20) {
    let startDate: Date;
    let dateFormat: string;

    // Calculate start date based on period
    const now = new Date();
    switch (period) {
      case 'days':
        startDate = new Date(now.getTime() - parseInt(limit.toString()) * 24 * 60 * 60 * 1000);
        dateFormat = 'DATE(created_at)';
        break;
      case 'week':
        startDate = new Date(now.getTime() - parseInt(limit.toString()) * 7 * 24 * 60 * 60 * 1000);
        // PostgreSQL syntax for start of week (Monday)
        dateFormat = 'DATE(created_at - INTERVAL \'1 day\' * EXTRACT(DOW FROM created_at))';
        break;
      case 'month':
        startDate = new Date(now.getTime() - parseInt(limit.toString()) * 30 * 24 * 60 * 60 * 1000);
        // PostgreSQL syntax for start of month
        dateFormat = 'DATE_TRUNC(\'month\', created_at)::DATE';
        break;
      default:
        startDate = new Date(now.getTime() - parseInt(limit.toString()) * 24 * 60 * 60 * 1000);
        dateFormat = 'DATE(created_at)';
    }

    const chartData = await db.select({
      date: sql<string>`${sql.raw(dateFormat)}`,
      requests: count(),
      successful: sql<number>`COUNT(CASE WHEN ${serpSearchResults.status} = 'success' THEN 1 END)`,
      failed: sql<number>`COUNT(CASE WHEN ${serpSearchResults.status} = 'error' THEN 1 END)`,
  credits_used: sql<number>`COUNT(CASE WHEN ${serpSearchResults.status} = 'success' THEN 1 END)`, // Credits counted only for successful requests
  avg_response_time: sql<number>`AVG(${serpSearchResults.responseTime})`
    })
    .from(serpSearchResults)
    .where(and(
      eq(serpSearchResults.organizationId, organizationId),
      gte(serpSearchResults.createdAt, startDate)
    ))
    .groupBy(sql.raw(dateFormat))
    .orderBy(sql.raw(dateFormat))
    .limit(limit);

    // Fill missing dates with zero values
    const result = [];
    const currentDate = new Date(startDate);
    const endDate = new Date();

    while (currentDate <= endDate && result.length < limit) {
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

    return {
      chartData: result.slice(-limit), // Get last N items
      period,
      totalItems: result.length
    };
  }

  // COMMENTED OUT - No longer using per-API-key tracking
  // Get API usage statistics
  // async getApiUsage(apiKeyId: number, days: number = 30) {
  //   const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  //   // Get detailed usage statistics
  //   const usage = await db.select()
  //     .from(serpSearchResults)
  //     .where(and(
  //       eq(serpSearchResults.apiKeyId, apiKeyId),
  //       gte(serpSearchResults.createdAt, daysAgo)
  //     ))
  //     .orderBy(desc(serpSearchResults.createdAt));

  //   // Calculate statistics
  //   const stats = usage.reduce((acc, record) => {
  //     acc.totalRequests++;
  //     if (record.status === 'success') acc.successfulRequests++;
  //     if (record.status === 'error') acc.failedRequests++;
  //     acc.totalResponseTime += record.responseTime || 0;

  //     // Engine statistics
  //     if (record.searchEngine) {
  //       acc.engineStats[record.searchEngine] = (acc.engineStats[record.searchEngine] || 0) + 1;
  //     }

  //     // Daily statistics
  //     const date = record.createdAt?.toISOString().split('T')[0];
  //     if (date) {
  //       if (!acc.dailyStats[date]) {
  //         acc.dailyStats[date] = { requests: 0, errors: 0, avgResponseTime: 0, totalResponseTime: 0 };
  //       }
  //       acc.dailyStats[date].requests++;
  //       if (record.status === 'error') acc.dailyStats[date].errors++;
  //       acc.dailyStats[date].totalResponseTime += record.responseTime || 0;
  //       acc.dailyStats[date].avgResponseTime = acc.dailyStats[date].totalResponseTime / acc.dailyStats[date].requests;
  //     }

  //     return acc;
  //   }, {
  //     totalRequests: 0,
  //     successfulRequests: 0,
  //     failedRequests: 0,
  //     totalResponseTime: 0,
  //     avgResponseTime: 0,
  //     engineStats: {} as Record<string, number>,
  //     dailyStats: {} as Record<string, any>
  //   });

  //   // Calculate average response time
  //   stats.avgResponseTime = stats.totalRequests > 0 ? stats.totalResponseTime / stats.totalRequests : 0;

  //   return {
  //     statistics: stats,
  //     recent_requests: usage.slice(0, 50)
  //   };
  // }

  // Get dashboard statistics
  async getDashboardStats(organizationId: string, days: number = 30) {
    // Get total requests for the period
    const totalRequests = await db.select({
      count: sql<number>`COUNT(*)`
    })
    .from(serpSearchResults)
    .where(and(
      eq(serpSearchResults.organizationId, organizationId),
      gte(serpSearchResults.createdAt, new Date(Date.now() - days * 24 * 60 * 60 * 1000))
    ));

    // Get successful requests
    const successfulRequests = await db.select({
      count: sql<number>`COUNT(*)`
    })
    .from(serpSearchResults)
    .where(and(
      eq(serpSearchResults.organizationId, organizationId),
      eq(serpSearchResults.status, 'success'),
      gte(serpSearchResults.createdAt, new Date(Date.now() - days * 24 * 60 * 60 * 1000))
    ));

    // Get this month's requests
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const thisMonthRequests = await db.select({
      count: sql<number>`COUNT(*)`
    })
    .from(serpSearchResults)
    .where(and(
      eq(serpSearchResults.organizationId, organizationId),
      gte(serpSearchResults.createdAt, thisMonthStart)
    ));

    // Get active API keys count
    const activeKeys = await db.select({
      count: sql<number>`COUNT(*)`
    })
    .from(apiKeys)
    .where(and(
      eq(apiKeys.organizationId, organizationId),
      eq(apiKeys.isActive, true)
    ));

    const total = totalRequests[0]?.count || 0;
    const successful = successfulRequests[0]?.count || 0;
    const successRate = total > 0 ? (successful / total) * 100 : 0;

    return {
      totalRequests: total,
      successfulRequests: successful,
      successRate: Math.round(successRate * 100) / 100,
      thisMonthRequests: thisMonthRequests[0]?.count || 0,
      activeKeys: activeKeys[0]?.count || 0
    };
  }

  // Get usage chart data for dashboard
  async getDashboardUsageChart(organizationId: string, days: number = 30) {
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
        eq(serpSearchResults.organizationId, organizationId),
        gte(serpSearchResults.createdAt, startOfDay),
        lte(serpSearchResults.createdAt, endOfDay)
      ));

      usageData.push({
        date: startOfDay.toISOString().split('T')[0],
        requests: dailyRequests[0]?.count || 0
      });
    }

    return { usageData };
  }

  // Get credit information
  async getCreditInfo(organizationId: string) {
    // Get current credit balance
    const credits = await db.select()
      .from(workspaceCredits)
      .where(eq(workspaceCredits.organizationId, organizationId))
      .limit(1);

    const creditInfo = credits[0] || { balance: 0, totalPurchased: 0, totalUsed: 0 };

    // Calculate usage this month
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const thisMonthUsage = await db.select({
      count: sql<number>`COUNT(*)`
    })
    .from(serpSearchResults)
    .where(and(
      eq(serpSearchResults.organizationId, organizationId),
      gte(serpSearchResults.createdAt, thisMonthStart)
    ));

    return {
      balance: creditInfo.balance,
      totalPurchased: creditInfo.totalPurchased,
      totalUsed: creditInfo.totalUsed,
      thisMonthUsage: thisMonthUsage[0]?.count || 0,
      plan: 'Pro Plan', // This could be dynamic based on credit tiers
      planLimit: 10000 // This could be dynamic based on plan
    };
  }
}