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
});

export const db = drizzle(pool, { schema });
export * from './schema';
