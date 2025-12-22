import { Request, Response, NextFunction } from "express";
import { usageService } from "../services/usageService";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role?: string;
        plan?: string;
      };
    }
  }
}

export function checkVideoLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    try {
      const result = await usageService.checkVideoLimit(req.user.id);
      
      if (!result.allowed) {
        return res.status(403).json({ 
          message: result.message,
          code: "LIMIT_EXCEEDED",
          upgradeRequired: true
        });
      }
      
      next();
    } catch (error) {
      console.error("Error checking video limit:", error);
      next();
    }
  };
}

export function checkStoryLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    try {
      const result = await usageService.checkStoryLimit(req.user.id);
      
      if (!result.allowed) {
        return res.status(403).json({ 
          message: result.message,
          code: "LIMIT_EXCEEDED",
          upgradeRequired: true
        });
      }
      
      next();
    } catch (error) {
      console.error("Error checking story limit:", error);
      next();
    }
  };
}

export function checkVoiceCloneLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    try {
      const result = await usageService.checkVoiceCloneLimit(req.user.id);
      
      if (!result.allowed) {
        return res.status(403).json({ 
          message: result.message,
          code: "LIMIT_EXCEEDED",
          upgradeRequired: true
        });
      }
      
      next();
    } catch (error) {
      console.error("Error checking voice clone limit:", error);
      next();
    }
  };
}
