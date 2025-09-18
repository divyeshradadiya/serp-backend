import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as blogSchema from './blog-schema';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Parse the BLOG_DATABASE_URL to check if SSL is required
const blogDatabaseUrl = process.env.BLOG_DATABASE_URL || '';
const requiresSsl = blogDatabaseUrl.includes('sslmode=require') || blogDatabaseUrl.includes('neon.tech');

const blogPool = new Pool({
  connectionString: process.env.BLOG_DATABASE_URL,
  ssl: requiresSsl ? { rejectUnauthorized: false } : false,
});

export const blogDb = drizzle(blogPool, { schema: blogSchema });
export * from './blog-schema';