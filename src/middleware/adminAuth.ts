import { Request, Response, NextFunction } from 'express';

// Use environment variables for admin credentials
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

export interface AuthRequest extends Request {
  admin?: boolean;
}

// Simple login function (for POST /admin/login)
export const loginAdmin = (req: Request, res: Response) => {
  const { email, password } = req.body;
  console.log('Attempted login with:', email, "envEEmail", ADMIN_EMAIL, password,"envPassword", ADMIN_PASSWORD);
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    // Set a simple session cookie (not secure, for demo only)
    res.cookie('admin_session', 'true', { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 1 day
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
};

// Middleware to check admin auth
export const authenticateAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = req.cookies.admin_session;
  if (session === 'true') { 
    req.admin = true;
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};