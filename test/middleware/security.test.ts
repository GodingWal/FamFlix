import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

vi.mock('../../server/config', () => ({
  config: {
    SESSION_SECRET: 'test-session-secret-key-for-testing-only',
    COOKIE_SECURE: false,
    COOKIE_SAME_SITE: 'lax',
  },
}));

vi.mock('../../server/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const security = await import('../../server/middleware/security');

const { generateCSRFToken, validateCSRFToken, CSRF_SIGNATURE_COOKIE, getCSRFTokenSignature } = security;

describe('CSRF Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      headers: {},
      body: {},
      cookies: {},
      ip: '127.0.0.1',
      path: '/test',
      get: vi.fn(),
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    next = vi.fn();
  });

  it('should skip validation for safe methods', () => {
    mockRequest.method = 'GET';

    validateCSRFToken(mockRequest as Request, mockResponse as Response, next);

    expect(next).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should reject when token is missing', () => {
    validateCSRFToken(mockRequest as Request, mockResponse as Response, next);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid CSRF token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject when signature does not match', () => {
    const token = generateCSRFToken();
    mockRequest.headers = { 'x-csrf-token': token };
    mockRequest.cookies = { [CSRF_SIGNATURE_COOKIE]: 'invalid-signature' };

    validateCSRFToken(mockRequest as Request, mockResponse as Response, next);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid CSRF token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass when token and signature are valid', () => {
    const token = generateCSRFToken();
    const signature = getCSRFTokenSignature(token);

    mockRequest.headers = { 'x-csrf-token': token };
    mockRequest.cookies = { [CSRF_SIGNATURE_COOKIE]: signature };

    validateCSRFToken(mockRequest as Request, mockResponse as Response, next);

    expect(next).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });
});
