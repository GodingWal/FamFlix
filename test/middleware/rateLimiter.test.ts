import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// We'll test the middleware factory function
const rateLimitMiddleware = (limiter: RateLimiterMemory) => {
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

describe('Rate Limiter Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSet = vi.fn();

    mockRequest = {
      ip: '127.0.0.1',
      socket: {
        remoteAddress: '127.0.0.1',
      } as any,
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: mockSet,
    };

    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('General rate limiting', () => {
    it('should allow requests within rate limit', async () => {
      const limiter = new RateLimiterMemory({
        points: 5,
        duration: 1,
      });

      const middleware = rateLimitMiddleware(limiter);

      // Make 5 requests (within limit)
      for (let i = 0; i < 5; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(5);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding rate limit', async () => {
      const limiter = new RateLimiterMemory({
        points: 3,
        duration: 10,
      });

      const middleware = rateLimitMiddleware(limiter);

      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // 4th request should be blocked
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(3);
      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Too many requests",
        retryAfter: expect.any(Number),
      });
    });

    it('should set Retry-After header when rate limited', async () => {
      const limiter = new RateLimiterMemory({
        points: 1,
        duration: 10,
      });

      const middleware = rateLimitMiddleware(limiter);

      // First request succeeds
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Second request is rate limited
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockSet).toHaveBeenCalledWith("Retry-After", expect.any(String));
      const retryAfter = mockSet.mock.calls[0][1];
      expect(parseInt(retryAfter)).toBeGreaterThan(0);
      expect(parseInt(retryAfter)).toBeLessThanOrEqual(10);
    });

    it('should rate limit by IP address', async () => {
      const limiter = new RateLimiterMemory({
        points: 2,
        duration: 10,
      });

      const middleware = rateLimitMiddleware(limiter);

      // Two requests from same IP
      mockRequest.ip = '192.168.1.1';
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Third request from same IP should be blocked
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);

      // Reset mocks
      vi.clearAllMocks();

      // Request from different IP should succeed
      mockRequest.ip = '192.168.1.2';
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should fall back to socket.remoteAddress when IP is not available', async () => {
      const limiter = new RateLimiterMemory({
        points: 1,
        duration: 10,
      });

      const middleware = rateLimitMiddleware(limiter);

      mockRequest.ip = undefined;
      mockRequest.socket = { remoteAddress: '10.0.0.1' } as any;

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      // Second request from same remote address should be blocked
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });

    it('should use "unknown" key when no IP information available', async () => {
      const limiter = new RateLimiterMemory({
        points: 2,
        duration: 10,
      });

      const middleware = rateLimitMiddleware(limiter);

      mockRequest.ip = undefined;
      mockRequest.socket = {} as any;

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Third request should be blocked (using 'unknown' key)
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });
  });

  describe('Different rate limit tiers', () => {
    it('should enforce strict limits for auth endpoints', async () => {
      const authLimiter = new RateLimiterMemory({
        points: 5,
        duration: 60,
      });

      const middleware = rateLimitMiddleware(authLimiter);

      // Make 5 auth requests
      for (let i = 0; i < 5; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // 6th request should be blocked
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(5);
      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });

    it('should enforce moderate limits for AI endpoints', async () => {
      const aiLimiter = new RateLimiterMemory({
        points: 10,
        duration: 60,
      });

      const middleware = rateLimitMiddleware(aiLimiter);

      // Make 10 AI requests
      for (let i = 0; i < 10; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // 11th request should be blocked
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(10);
      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });

    it('should enforce general limits for regular endpoints', async () => {
      const generalLimiter = new RateLimiterMemory({
        points: 100,
        duration: 60,
      });

      const middleware = rateLimitMiddleware(generalLimiter);

      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // 101st request should be blocked
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(100);
      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });
  });

  describe('Error response format', () => {
    it('should return proper error structure', async () => {
      const limiter = new RateLimiterMemory({
        points: 1,
        duration: 5,
      });

      const middleware = rateLimitMiddleware(limiter);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const jsonCall = (mockResponse.json as any).mock.calls[0][0];
      expect(jsonCall).toHaveProperty('error', 'Too many requests');
      expect(jsonCall).toHaveProperty('retryAfter');
      expect(typeof jsonCall.retryAfter).toBe('number');
      expect(jsonCall.retryAfter).toBeGreaterThan(0);
    });

    it('should ensure retryAfter is at least 1 second', async () => {
      const limiter = new RateLimiterMemory({
        points: 1,
        duration: 1,
      });

      const middleware = rateLimitMiddleware(limiter);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Immediately make another request
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const jsonCall = (mockResponse.json as any).mock.calls[0][0];
      expect(jsonCall.retryAfter).toBeGreaterThanOrEqual(1);
    });
  });
});
