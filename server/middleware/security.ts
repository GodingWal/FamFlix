import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { config } from "../config";
import { logger } from "../utils/logger";

// CSRF Token generation and validation
export const CSRF_SIGNATURE_COOKIE = "csrfTokenSig";

export const generateCSRFToken = (): string => {
  return randomBytes(32).toString("hex");
};

export const getCSRFTokenSignature = (token: string): string => {
  return createHmac("sha256", config.SESSION_SECRET).update(token).digest("hex");
};

export const validateCSRFToken = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const token = (req.headers['x-csrf-token'] as string | undefined) || (req.body && req.body._csrf);

  if (typeof token !== 'string' || token.length === 0) {
    logger.warn('CSRF token validation failed', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  const signature = req.cookies?.[CSRF_SIGNATURE_COOKIE];

  if (typeof signature !== 'string' || signature.length === 0) {
    logger.warn('CSRF token signature missing', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  try {
    const expectedSignature = getCSRFTokenSignature(token);
    const providedBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new Error('Signature mismatch');
    }
  } catch (error) {
    logger.warn('CSRF token signature validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
};

// Enhanced rate limiting
export const createRateLimit = (options: {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: options.max || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: { error: options.message || 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      res.status(429).json({ error: 'Too many requests, please try again later.' });
    },
  });
};

// Specific rate limits
export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5'),
  message: 'Too many authentication attempts, please try again later.',
});

export const apiRateLimit = createRateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  skipSuccessfulRequests: true,
});

export const uploadRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute
  message: 'Too many upload attempts, please try again later.',
});

// Security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "ws:"],
      // Allow blob: for authenticated audio playback (we fetch audio with auth, then play via blob URL)
      mediaSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// CORS configuration
export const corsConfig = cors({
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
});

// Cookie parser with security options
export const secureCookieParser = cookieParser();

// Request sanitization
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction) => {
  // Remove potentially dangerous characters from query params and body
  const sanitize = (obj: any) => {
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          // Remove script tags and other dangerous patterns
          obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        } else if (typeof obj[key] === 'object') {
          sanitize(obj[key]);
        }
      }
    }
  };

  sanitize(req.query);
  sanitize(req.body);
  next();
};
