import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { 
  authenticateToken, 
  generateAccessToken, 
  generateRefreshToken,
  verifyRefreshToken,
  requireRole 
} from '../../server/middleware/auth';

// Mock dependencies
vi.mock('../../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
  },
}));

vi.mock('../../server/config', () => ({
  config: {
    JWT_SECRET: 'test-jwt-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}));

vi.mock('../../server/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      cookies: {},
      ip: '127.0.0.1',
      path: '/test',
      get: vi.fn(),
    };
    
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token from Authorization header', async () => {
      const token = generateAccessToken('user-123');
      mockRequest.headers = { authorization: `Bearer ${token}` };

      const { storage } = await import('../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        isActive: true,
      } as any);

      await authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockRequest.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
      });
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should authenticate token when Authorization header has extra whitespace', async () => {
      const token = generateAccessToken('user-123');
      mockRequest.headers = { authorization: `Bearer    ${token}` };

      const { storage } = await import('../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        isActive: true,
      } as any);

      await authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockRequest.user).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should authenticate token with lowercase bearer scheme', async () => {
      const token = generateAccessToken('user-123');
      mockRequest.headers = { authorization: `bearer ${token}` };

      const { storage } = await import('../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        isActive: true,
      } as any);

      await authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockRequest.user).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should authenticate valid token from cookies', async () => {
      const token = generateAccessToken('user-123');
      mockRequest.cookies = { accessToken: token };

      const { storage } = await import('../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        isActive: true,
      } as any);

      await authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockRequest.user).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request with no token', async () => {
      await authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };

      await authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject token for inactive user', async () => {
      const token = generateAccessToken('user-123');
      mockRequest.headers = { authorization: `Bearer ${token}` };

      const { storage } = await import('../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        isActive: false,
      } as any);

      await authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid or inactive user' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle expired token', async () => {
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.sign(
        { userId: 'user-123', type: 'access' },
        'test-jwt-secret',
        { expiresIn: '-1s' }
      );
      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };

      await authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    });
  });

  describe('Token generation', () => {
    it('should generate valid access token', () => {
      const token = generateAccessToken('user-123');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should generate valid refresh token', () => {
      const token = generateRefreshToken('user-123');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should verify refresh token', () => {
      const refreshToken = generateRefreshToken('user-123');
      const decoded = verifyRefreshToken(refreshToken);
      
      expect(decoded.userId).toBe('user-123');
      expect(decoded.type).toBe('refresh');
    });

    it('should reject invalid refresh token', () => {
      expect(() => verifyRefreshToken('invalid-token')).toThrow();
    });

    it('should reject access token as refresh token', () => {
      const accessToken = generateAccessToken('user-123');
      expect(() => verifyRefreshToken(accessToken)).toThrow();
    });
  });

  describe('requireRole', () => {
    beforeEach(() => {
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
      };
    });

    it('should allow access for correct role', () => {
      const middleware = requireRole(['user']);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow access for multiple roles', () => {
      const middleware = requireRole(['user', 'admin']);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for incorrect role', () => {
      const middleware = requireRole(['admin']);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should deny access when user not authenticated', () => {
      mockRequest.user = undefined;
      const middleware = requireRole(['user']);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
