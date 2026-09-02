import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

export interface AuthRequest extends Request {
  user?: IUser;
}

/**
 * Protect middleware verifies the JWT bearer token sent in the headers.
 * Attaches the database user object to req.user.
 */
export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;
    
    if (req.headers?.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. Token missing.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-1234') as { id: string };
    
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth protect error:', error);
    return res.status(401).json({ success: false, message: 'Session expired or token is invalid.' });
  }
};

/**
 * Restricts access to routes based on user role.
 * Role can be 'super_admin', 'restaurant_admin', or 'staff'.
 */
export const restrictTo = (...roles: ('super_admin' | 'restaurant_admin' | 'staff')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to perform this action.',
      });
    }
    next();
  };
};
