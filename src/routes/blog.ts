import express from 'express';
import { BlogService } from '../services/blogService';
import { loginAdmin, authenticateAdmin } from '../middleware/adminAuth';

interface CreateBlogRequest {
  name: string;
  slug: string;
  description?: string;
  readTime: number;
  categoryIds: number[];
  published: boolean;
  markdownContent: string;
}

interface UpdateBlogRequest extends Partial<CreateBlogRequest> {}

interface CreateCategoryRequest {
  name: string;
  slug: string;
  description?: string;
}

interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {}

const router = express.Router();

// Public routes
router.get('/blogs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 9;
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;

    const result = await BlogService.getBlogsPaginated(page, limit, categoryId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

router.get('/blogs/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const blog = await BlogService.getBlogBySlug(slug);
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch blog' });
  }
});

router.get('/blogs/:slug/related', async (req, res) => {
  try {
    const { slug } = req.params;
    const blog = await BlogService.getBlogBySlug(slug);
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    const relatedBlogs = await BlogService.getBlogsByCategoryIds(blog.categoryIds, 9);
    // Filter out the current blog
    const filteredBlogs = relatedBlogs.filter(b => b.id !== blog.id);
    res.json(filteredBlogs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch related blogs' });
  }
});

// Categories routes
router.get('/categories', async (req, res) => {
  try {
    const categories = await BlogService.getAllCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.get('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const category = await BlogService.getCategoryById(Number(id));
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// Admin login (public)
router.post('/admin/login', loginAdmin);

// Admin routes (protected)
router.use(authenticateAdmin);

// Blog admin routes
router.get('/admin/blogs', async (req, res) => {
  try {
    const blogs = await BlogService.getAllBlogs();
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

router.post('/admin/blogs', async (req, res) => {
  try {
    const body: CreateBlogRequest = req.body;
    const blog = await BlogService.createBlog(body);
    res.status(201).json(blog);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create blog' });
  }
});

router.put('/admin/blogs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body: UpdateBlogRequest = req.body;
    const blog = await BlogService.updateBlog(Number(id), body);
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update blog' });
  }
});

router.delete('/admin/blogs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await BlogService.deleteBlog(Number(id));
    if (!deleted) {
      return res.status(404).json({ error: 'Blog not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete blog' });
  }
});

// Category admin routes
router.get('/admin/categories', async (req, res) => {
  try {
    const categories = await BlogService.getAllCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/admin/categories', async (req, res) => {
  try {
    const body: CreateCategoryRequest = req.body;
    const category = await BlogService.createCategory(body);
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/admin/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body: UpdateCategoryRequest = req.body;
    const category = await BlogService.updateCategory(Number(id), body);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/admin/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await BlogService.deleteCategory(Number(id));
    if (!deleted) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;