import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './src/db/blog-schema'; // Adjust path if needed
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Parse the BLOG_DATABASE_URL to check if SSL is required
const blogDatabaseUrl = process.env.BLOG_DATABASE_URL || '';
const requiresSsl = blogDatabaseUrl.includes('sslmode=require') || blogDatabaseUrl.includes('neon.tech');

const pool = new Pool({
  connectionString: process.env.BLOG_DATABASE_URL,
  ssl: requiresSsl ? { rejectUnauthorized: false } : false,
  // max: 10,
  // min: 0,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
});

// Error handling for pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('connect', () => {
  console.log('New client connected to the blog pool');
});

pool.on('remove', () => {
  console.log('Client removed from the blog pool');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing blog pool...');
  await pool.end();
  console.log('Blog pool closed');
});

export const blogDb = drizzle(pool, { schema });