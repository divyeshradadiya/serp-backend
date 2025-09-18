import express from 'express';
import { auth } from '../auth';
import { fromNodeHeaders } from 'better-auth/node';

export interface AuthenticatedRequest extends express.Request {
  userId?: string;
  organizationId?: string | null;
}

/**
 * Auth middleware using Better Auth's getSession method
 */
export async function requireAuth(
  req: AuthenticatedRequest, 
  res: express.Response, 
  next: express.NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    req.userId = session.user.id;
    req.organizationId = session.session?.activeOrganizationId || null;
    
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication required' });
  }
}

/**
 * Middleware to require organization context
 */
export function requireOrganization(
  req: AuthenticatedRequest, 
  res: express.Response, 
  next: express.NextFunction
): void {
  if (!req.organizationId) {
    res.status(400).json({ error: 'No organization selected' });
    return;
  }
  next();
}

/**
 * Error handling middleware
 */
export function errorHandler(
  err: any, 
  req: express.Request, 
  res: express.Response, 
  next: express.NextFunction
): void {
  console.error('Error:', err);
  
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(status).json({
    error: {
      message,
      status,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        details: err 
      })
    }
  });
}

/**
 * 404 handler middleware
 */
export function notFoundHandler(
  req: express.Request, 
  res: express.Response
): void {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404,
      path: req.path,
      method: req.method
    }
  });
}

/**
 * Request logging middleware
 */
export function requestLogger(
  req: express.Request, 
  res: express.Response, 
  next: express.NextFunction
): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl, ip } = req;
    const { statusCode } = res;
    
    console.log(`${method} ${originalUrl} ${statusCode} ${duration}ms - ${ip}`);
  });
  
  next();
}

/**
 * Rate limiting middleware (basic implementation)
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) {
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    const clientData = requestCounts.get(clientId);
    
    if (!clientData || now > clientData.resetTime) {
      requestCounts.set(clientId, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }
    
    if (clientData.count >= maxRequests) {
      res.status(429).json({
        error: {
          message: 'Too many requests',
          status: 429,
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        }
      });
      return;
    }
    
    clientData.count++;
    next();
  };
}