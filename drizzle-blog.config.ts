import { Config, defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const drizzleBlogConfig = {
  schema: './src/db/blog-schema.ts',
  out: './drizzle-blog',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.BLOG_DATABASE_URL!,
  },
  // driver: "pglite",
} satisfies Config;

export default defineConfig(drizzleBlogConfig);