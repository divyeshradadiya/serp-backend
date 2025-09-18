import { eq, and, sql } from 'drizzle-orm';
import { blogDb, blogs, categories } from '../db/blog-db';
import { Blog, Category } from '../types/blog';

export class BlogService {
  // Get all published blogs with categories populated
  static async getPublishedBlogs(): Promise<Blog[]> {
    const blogResults = await blogDb.select().from(blogs).where(eq(blogs.published, true));
    return await this.populateCategories(blogResults);
  }

  // Get blog by slug with categories populated
  static async getBlogBySlug(slug: string): Promise<Blog | null> {
    const result = await blogDb.select().from(blogs).where(and(eq(blogs.slug, slug), eq(blogs.published, true))).limit(1);
    if (!result[0]) return null;
    const blogsWithCategories = await this.populateCategories([result[0]]);
    return blogsWithCategories[0];
  }

  // Get all blogs (for admin) with categories populated
  static async getAllBlogs(): Promise<Blog[]> {
    const blogResults = await blogDb.select().from(blogs);
    return await this.populateCategories(blogResults);
  }

  // Get blogs by category IDs
  static async getBlogsByCategoryIds(categoryIds: number[], limit: number = 9): Promise<Blog[]> {
    const blogResults = await blogDb
      .select()
      .from(blogs)
      .where(and(
        eq(blogs.published, true),
        sql`${blogs.categoryIds} ?| array[${sql.join(categoryIds.map(id => sql`${id}`), sql`, `)}]`
      ))
      .limit(limit);
    return await this.populateCategories(blogResults);
  }

  // Get blogs with pagination and optional category filter
  static async getBlogsPaginated(page: number = 1, limit: number = 9, categoryId?: number): Promise<{ blogs: Blog[], total: number, totalPages: number }> {
    const offset = (page - 1) * limit;
    const whereCondition = categoryId
      ? and(eq(blogs.published, true), sql`${blogs.categoryIds} ? ${categoryId}`)
      : eq(blogs.published, true);

    const [blogResults, totalResult] = await Promise.all([
      blogDb.select().from(blogs).where(whereCondition).limit(limit).offset(offset),
      blogDb.$count(blogs, whereCondition)
    ]);

    const blogsWithCategories = await this.populateCategories(blogResults);
    const totalPages = Math.ceil(totalResult / limit);
    return { blogs: blogsWithCategories, total: totalResult, totalPages };
  }

  // Create a new blog
  static async createBlog(data: Omit<Blog, 'id' | 'createdAt' | 'updatedAt' | 'categories'>): Promise<Blog> {
    const result = await blogDb.insert(blogs).values({
      name: data.name,
      slug: data.slug,
      description: data.description,
      readTime: data.readTime,
      categoryIds: data.categoryIds,
      published: data.published,
      markdownContent: data.markdownContent,
    }).returning();
    const blogsWithCategories = await this.populateCategories([result[0]]);
    return blogsWithCategories[0];
  }

  // Update a blog
  static async updateBlog(id: number, data: Partial<Omit<Blog, 'id' | 'createdAt' | 'categories'>>): Promise<Blog | null> {
    const result = await blogDb.update(blogs).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(blogs.id, id)).returning();
    if (!result[0]) return null;
    const blogsWithCategories = await this.populateCategories([result[0]]);
    return blogsWithCategories[0];
  }

  // Delete a blog
  static async deleteBlog(id: number): Promise<boolean> {
    const result = await blogDb.delete(blogs).where(eq(blogs.id, id));
    return (result as any).rowCount > 0;
  }

  // Helper method to populate categories
  private static async populateCategories(blogResults: any[]): Promise<Blog[]> {
    if (blogResults.length === 0) return [];

    // Collect all categoryIds safely (handle missing or non-array values)
    const allCategoryIds = Array.from(new Set(
      blogResults.flatMap(blog => Array.isArray(blog.categoryIds) ? blog.categoryIds : [])
    ));

    if (allCategoryIds.length === 0) {
      return blogResults.map(blog => ({ ...blog, categories: [] }));
    }

    // Use Drizzle's `in` operator via raw SQL array match is error-prone across drivers,
    // so build a simple WHERE ... IN (...) clause using sql.join for safety.
    const categoryResults = await blogDb
      .select()
      .from(categories)
      .where(sql`${categories.id} IN (${sql.join(allCategoryIds.map(id => sql`${id}`), sql`, `)})`);

    // Create a map for quick lookup
    const categoryMap = new Map(categoryResults.map(cat => [cat.id, { ...cat, description: cat.description || undefined }]));

    // Populate categories for each blog (guard missing categoryIds)
    return blogResults.map(blog => ({
      ...blog,
      categories: (Array.isArray(blog.categoryIds) ? blog.categoryIds : []).map((id: number) => categoryMap.get(id)).filter(Boolean)
    }));
  }

  // Category methods
  static async getAllCategories(): Promise<Category[]> {
    const results = await blogDb.select().from(categories);
    return results.map(cat => ({ ...cat, description: cat.description || undefined }));
  }

  static async getCategoryById(id: number): Promise<Category | null> {
    const result = await blogDb.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!result[0]) return null;
    return { ...result[0], description: result[0].description || undefined };
  }

  static async createCategory(data: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<Category> {
    const result = await blogDb.insert(categories).values(data).returning();
    return { ...result[0], description: result[0].description || undefined };
  }

  static async updateCategory(id: number, data: Partial<Omit<Category, 'id' | 'createdAt'>>): Promise<Category | null> {
    const result = await blogDb.update(categories).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(categories.id, id)).returning();
    if (!result[0]) return null;
    return { ...result[0], description: result[0].description || undefined };
  }

  static async deleteCategory(id: number): Promise<boolean> {
    const result = await blogDb.delete(categories).where(eq(categories.id, id));
    return (result as any).rowCount > 0;
  }
}