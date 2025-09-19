import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });


// Parse the DATABASE_URL to check if SSL is required
const databaseUrl = process.env.DATABASE_URL || '';
const requiresSsl = databaseUrl.includes('sslmode=require') || databaseUrl.includes('neon.tech');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: requiresSsl ? { rejectUnauthorized: false } : false,
  // Best practices for pooling
  // max: 10, // Max connections (adjust for Lambda concurrency)
  // min: 0, // Min connections
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Timeout for initial connection
  allowExitOnIdle: true, // Allow pool to exit when idle (good for Lambda)
});

// Error handling for pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('connect', (client) => {
  console.log('New client connected to the pool');
});

pool.on('remove', (client) => {
  console.log('Client removed from the pool');
});

// Graceful shutdown for Lambda/serverless
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing pool...');
  await pool.end();
  console.log('Pool closed');
});

export const db = drizzle(pool, { schema });
export * from './schema';
