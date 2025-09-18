import { Config, defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const drizzleConfig = {
  schema: ['./src/db/schema.ts', './src/db/blog-schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // driver: "pglite",
} satisfies Config;

export default defineConfig(drizzleConfig);