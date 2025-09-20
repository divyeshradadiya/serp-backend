import express, { Application } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import cors from 'cors';

import indexRouter from './routes/index';
import authRouter from './routes/auth';
import apiRouter from './routes/api';
import keysRouter from './routes/keys';
import overviewRouter from './routes/overview';
import searchRouter from './routes/search';
import billingRouter from './routes/billing';
import blogRouter from './routes/blog';

import { errorHandler, notFoundHandler, requestLogger, rateLimit } from './middleware/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Application = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000', // Frontend dev server
    'http://localhost:3001', // Alternative frontend port
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-API-Key', 'X-Organization-Id']
}));

// Basic middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Custom middleware
app.use(requestLogger);
//for now
// app.use(rateLimit(100, 15 * 60 * 1000)); // 100 requests per 15 minutes

// Routes
app.use('/', indexRouter);
app.use('/', authRouter);
app.use('/api', apiRouter);
app.use('/api/keys', keysRouter);
app.use('/api/overview', overviewRouter);
app.use('/api/search', searchRouter);
app.use('/api/billing', billingRouter);
app.use('/api/blog', blogRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;