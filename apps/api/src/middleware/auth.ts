import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface JWTPayload {
  userId: string;
  role: string;
  institutionId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export const requireRole = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? '') as JWTPayload;
      if (!roles.includes(payload.role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

export const requireAuth = requireRole('APPLICANT', 'SCRUTINY_OFFICER', 'ADMIN');
