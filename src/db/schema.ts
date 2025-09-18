import { pgTable, text, timestamp, boolean, integer, index, json, serial, varchar } from 'drizzle-orm/pg-core';

// Better Auth Users table
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// Better Auth Sessions table
export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
});

// Better Auth Accounts table
export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// Better Auth Verifications table
export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt").$defaultFn(() => new Date()),
});

// Better Auth Organization Tables
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  orgVectorDB: text("org_vector_db").$defaultFn(() => crypto.randomUUID()),
  metadata: json("metadata"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// API Keys table
export const apiKeys = pgTable('api_keys', {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id').references(() => organization.id).notNull(),
    keyHash: varchar('key_hash', { length: 255 }).unique().notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    isActive: boolean('is_active').default(true),
    requestLimit: integer('request_limit').default(1000), // requests per month
    requestCount: integer('request_count').default(0), // current request count
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
     index('organization_id_idx').on(table.organizationId),
     index('key_hash_idx').on(table.keyHash),
]);

// Search queries cache table - COMMENTED OUT (not needed for now)
// export const searchCache = pgTable('search_cache', {
//     id: serial('id').primaryKey(),
//     organizationId: text('organization_id').references(() => organization.id).notNull(),
//     query: varchar('query', { length: 500 }).notNull(),
//     queryHash: varchar('query_hash', { length: 64 }).unique().notNull(),
//     results: text('results').notNull(), // JSON string
//     expiresAt: timestamp('expires_at').notNull(),
//     createdAt: timestamp('created_at').defaultNow(),
// }, (table) => [
//     index('search_cache_organization_id_idx').on(table.organizationId),
//     index('query_hash_idx').on(table.queryHash),
//     index('expires_at_idx').on(table.expiresAt),
// ]);

// Request logs table - REMOVED (using serpSearchResults instead)
// export const requestLogs = pgTable('request_logs', {
//     id: serial('id').primaryKey(),
//     organizationId: text('organization_id').references(() => organization.id),
//     apiKeyId: integer('api_key_id').references(() => apiKeys.id),
//     query: varchar('query', { length: 500 }).notNull(),
//     ip: varchar('ip', { length: 45 }),
//     userAgent: text('user_agent'),
//     responseTime: integer('response_time'), // milliseconds
//     status: varchar('status', { length: 20 }).notNull(), // success, error, rate_limited
//     createdAt: timestamp('created_at').defaultNow(),
// }, (table) => [
//     index('request_logs_organization_id_idx').on(table.organizationId),
//     index('request_logs_api_key_id_idx').on(table.apiKeyId),
//     index('request_logs_created_at_idx').on(table.createdAt),
// ]);

// SERP Search Results table
export const serpSearchResults = pgTable('serp_search_results', {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id').references(() => organization.id),
    searchEngine: varchar('search_engine', { length: 50 }).notNull(), // google, duckduckgo, brave, etc.
    resultsCount: integer('results_count').default(0),
    status: varchar('status', { length: 20 }).notNull().default('success'), // success, error, rate_limited
    responseTime: integer('response_time'), // in milliseconds
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
    index('serp_organization_id_idx').on(table.organizationId),
    // index('serp_api_key_id_idx').on(table.apiKeyId), // COMMENTED OUT
    index('serp_search_engine_idx').on(table.searchEngine),
    index('serp_created_at_idx').on(table.createdAt),
    index('serp_status_idx').on(table.status),
]);

// SERP Usage Analytics table (for aggregated stats)
// export const serpUsageAnalytics = pgTable('serp_usage_analytics', {
//     id: serial('id').primaryKey(),
//     organizationId: text('organization_id').references(() => organization.id).notNull(),
//     apiKeyId: integer('api_key_id').references(() => apiKeys.id),
//     date: timestamp('date').notNull(), // Daily aggregation
//     totalRequests: integer('total_requests').default(0),
//     successfulRequests: integer('successful_requests').default(0),
//     failedRequests: integer('failed_requests').default(0),
//     rateLimitedRequests: integer('rate_limited_requests').default(0),
//     avgResponseTime: integer('avg_response_time'), // Average response time in milliseconds
//     uniqueQueries: integer('unique_queries').default(0),
//     totalResults: integer('total_results').default(0),
//     searchEngineStats: json('search_engine_stats'), // {"google": 150, "duckduckgo": 75, ...}
//     createdAt: timestamp('created_at').defaultNow(),
//     updatedAt: timestamp('updated_at').defaultNow(),
// }, (table) => [
//     index('analytics_organization_id_idx').on(table.organizationId),
//     index('analytics_api_key_id_idx').on(table.apiKeyId),
//     index('analytics_date_idx').on(table.date),
// ]);

// SERP Configuration table (for SearXNG instances and settings)
export const serpConfiguration = pgTable('serp_configuration', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    instanceUrl: varchar('instance_url', { length: 255 }).notNull(),
    isActive: boolean('is_active').default(true),
    priority: integer('priority').default(1), // Higher priority instances used first
    maxRequestsPerMinute: integer('max_requests_per_minute').default(30),
    lastHealthCheck: timestamp('last_health_check'),
    healthStatus: varchar('health_status', { length: 20 }).default('unknown'), // healthy, unhealthy, unknown
    responseTime: integer('response_time'), // Last measured response time
    supportedEngines: json('supported_engines'), // Array of supported search engines
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
    index('serp_config_active_idx').on(table.isActive),
    index('serp_config_priority_idx').on(table.priority),
    index('serp_config_health_idx').on(table.healthStatus),
]);

// Workspace Credit Balance table (replaces subscription system)
export const workspaceCredits = pgTable('workspace_credits', {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id').references(() => organization.id).notNull(),
    balance: integer('balance').default(0), // Credits remaining (1 credit = 1 search request)
    totalPurchased: integer('total_purchased').default(0), // Total credits ever purchased
    totalUsed: integer('total_used').default(0), // Total credits used
    lastPurchase: timestamp('last_purchase'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
    index('workspace_credits_org_id_idx').on(table.organizationId),
]);

// Credit Purchase History table
export const creditPurchases = pgTable('credit_purchases', {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id').references(() => organization.id).notNull(),
    amount: integer('amount').notNull(), // Amount paid in cents
    credits: integer('credits').notNull(), // Number of credits purchased
    paymentMethod: varchar('payment_method', { length: 50 }), // stripe, paypal, etc.
    paymentId: varchar('payment_id', { length: 255 }), // External payment ID
    status: varchar('status', { length: 20 }).notNull().default('completed'), // pending, completed, failed
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
    index('credit_purchases_org_id_idx').on(table.organizationId),
    index('credit_purchases_status_idx').on(table.status),
]);

// Stripe Payment Intents table
export const stripePaymentIntents = pgTable('stripe_payment_intents', {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id').references(() => organization.id).notNull(),
    paymentIntentId: varchar('payment_intent_id', { length: 255 }).unique().notNull(),
    clientSecret: varchar('client_secret', { length: 500 }).notNull(),
    amount: integer('amount').notNull(), // Amount in cents
    currency: varchar('currency', { length: 3 }).default('usd'),
    status: varchar('status', { length: 50 }).notNull(), // stripe payment intent status
    creditsRequested: integer('credits_requested').notNull(),
    discountPercent: integer('discount_percent').default(0),
    metadata: json('metadata'), // Additional Stripe metadata
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
    index('stripe_payment_intents_org_id_idx').on(table.organizationId),
    index('stripe_payment_intents_id_idx').on(table.paymentIntentId),
    index('stripe_payment_intents_status_idx').on(table.status),
]);
