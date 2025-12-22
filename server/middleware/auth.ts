import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { config } from "../config";
import { logger } from "../utils/logger";

const ACCESS_TOKEN_SECRET: Secret = config.JWT_SECRET;
const REFRESH_TOKEN_SECRET: Secret = config.JWT_REFRESH_SECRET;

const ACCESS_TOKEN_OPTIONS: SignOptions = {
  expiresIn: config.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
};

const REFRESH_TOKEN_OPTIONS: SignOptions = {
  expiresIn: config.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
};

const extractBearerToken = (authHeader: string): string | undefined => {
  const [scheme, token] = authHeader
    .trim()
    .split(/\s+/)
    .filter(part => part.length > 0);

  if (!scheme || !token) {
    return undefined;
  }

  if (scheme.toLowerCase() !== 'bearer') {
    return undefined;
  }

  return token;
};

interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // First try to get token from Authorization header
  const authHeader = req.headers["authorization"];
  let token = typeof authHeader === 'string' ? extractBearerToken(authHeader) : undefined;
  
  // If not in header, try to get from httpOnly cookie
  if (!token && req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    logger.warn('Authentication failed: No token provided', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as TokenPayload;
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    const user = await storage.getUser(decoded.userId);
    
    if (!user || !user.isActive) {
      logger.warn('Authentication failed: Invalid or inactive user', {
        userId: decoded.userId,
        ip: req.ip,
      });
      return res.status(401).json({ error: "Invalid or inactive user" });
    }

    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role || "user",
    };
    
    logger.debug('User authenticated successfully', {
      userId: user.id,
      path: req.path,
    });
    
    next();
  } catch (error: any) {
    logger.warn('Token validation failed', {
      error: error.message,
      ip: req.ip,
      path: req.path,
    });
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: "Token expired", 
        code: "TOKEN_EXPIRED" 
      });
    }
    
    return res.status(403).json({ error: "Invalid token" });
  }
};

export const generateAccessToken = (userId: string): string => {
  return jwt.sign(
    { userId, type: 'access' }, 
    ACCESS_TOKEN_SECRET, 
    ACCESS_TOKEN_OPTIONS
  );
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign(
    { userId, type: 'refresh' }, 
    REFRESH_TOKEN_SECRET, 
    REFRESH_TOKEN_OPTIONS
  );
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as TokenPayload;
  
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  
  return decoded;
};

export const refreshTokens = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token required" });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await storage.getUser(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid user" });
    }

    const newAccessToken = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    // Set httpOnly cookies
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: config.COOKIE_SAME_SITE,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: config.COOKIE_SAME_SITE,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.info('Tokens refreshed successfully', { userId: user.id });

    res.json({
      message: "Tokens refreshed successfully",
      accessToken: newAccessToken, // Also return for clients that need it
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error: any) {
    logger.warn('Token refresh failed', { error: error.message });
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: "Refresh token expired", 
        code: "REFRESH_TOKEN_EXPIRED" 
      });
    }
    
    return res.status(401).json({ error: "Invalid refresh token" });
  }
};

// Middleware to check if user has required role
export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Access denied: Insufficient permissions', {
        userId: req.user.id,
        requiredRoles: roles,
        userRole: req.user.role,
        path: req.path,
      });
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
};
