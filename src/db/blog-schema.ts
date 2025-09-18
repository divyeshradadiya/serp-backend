import { pgTable, serial, text, boolean, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const blogs = pgTable('blogs', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  readTime: integer('read_time').notNull(), // in minutes
  categoryIds: jsonb('category_ids').$type<number[]>().notNull(), // array of category IDs
  published: boolean('published').default(false).notNull(),
  markdownContent: text('markdown_content').notNull(),
});