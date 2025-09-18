import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../auth';

const router = express.Router();

// Convert Better Auth handler to Node.js compatible handler
const nodeHandler = toNodeHandler(auth.handler);

// Better Auth API routes
router.all('/api/auth/*', async (req, res) => {
  try {
    // console.log(`🔍 Auth request: ${req.method} ${req.originalUrl}`);
    // console.log('� Cookies:', req.headers.cookie);
    
    // Use the Better Auth Node.js handler
    await nodeHandler(req, res);
  } catch (error) {
    console.error('❌ Better Auth error:', error);
    res.status(500).json({ error: 'Authentication server error' });
  }
});

export default router;
