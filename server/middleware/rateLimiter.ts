import { RateLimiterMemory } from "rate-limiter-flexible";
import { Request, Response, NextFunction } from "express";

// General API rate limiter
const rateLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

// Strict rate limiter for auth endpoints
const authRateLimiter = new RateLimiterMemory({
  points: 5, // Number of requests
  duration: 60, // Per 60 seconds
});

// AI service rate limiter
const aiRateLimiter = new RateLimiterMemory({
  points: 10, // Number of requests
  duration: 60, // Per 60 seconds
});

export const rateLimitMiddleware = (limiter: RateLimiterMemory) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = req.ip || req.socket.remoteAddress || 'unknown';
      await limiter.consume(key);
      next();
    } catch (rejRes: any) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      res.set("Retry-After", String(secs));
      res.status(429).json({
        error: "Too many requests",
        retryAfter: secs,
      });
    }
  };
};

export const generalRateLimit = rateLimitMiddleware(rateLimiter);
export const authRateLimit = rateLimitMiddleware(authRateLimiter);
export const aiRateLimit = rateLimitMiddleware(aiRateLimiter);
