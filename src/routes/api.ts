import express from 'express';
import { ApiController } from '../controllers/apiController';

const router = express.Router();
const apiController = new ApiController();

// Middleware to validate API key (simplified for now)
async function validateApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  // For now, we'll set a temporary apiKey object
  // In production, you'd validate against the database
  (req as any).apiKey = {
    id: 1,
    organizationId: 'temp-org',
    name: 'temp-key'
  };
  next();
}

// Basic rate limiting middleware
async function checkRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Simple in-memory rate limiting
  const clientId = req.ip || 'unknown';
  const now = Date.now();

  if (!(global as any).rateLimit) {
    (global as any).rateLimit = new Map();
  }

  const rateLimitMap = (global as any).rateLimit;
  const clientData = rateLimitMap.get(clientId);

  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + 15 * 60 * 1000 });
    (req as any).creditBalance = 1000;
    (req as any).rateLimit = 6000;
    next();
    return;
  }

  if (clientData.count >= 6000) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
    });
  }

  clientData.count++;
  (req as any).creditBalance = 1000;
  (req as any).rateLimit = 6000;
  next();
}

// Routes
router.get('/search', validateApiKey, checkRateLimit, (req: express.Request, res: express.Response) => {
  apiController.search(req, res);
});

router.get('/engines', (req: express.Request, res: express.Response) => {
  apiController.getEngines(req, res);
});

router.get('/plans', (req: express.Request, res: express.Response) => {
  apiController.getPlans(req, res);
});

router.get('/usage', validateApiKey, (req: express.Request, res: express.Response) => {
  apiController.getUsage(req, res);
});

router.get('/dashboard/stats', validateApiKey, (req: express.Request, res: express.Response) => {
  apiController.getDashboardStats(req, res);
});

router.get('/dashboard/usage-chart', validateApiKey, (req: express.Request, res: express.Response) => {
  apiController.getUsageChart(req, res);
});

router.get('/dashboard/credits', validateApiKey, (req: express.Request, res: express.Response) => {
  apiController.getCredits(req, res);
});

export default router;