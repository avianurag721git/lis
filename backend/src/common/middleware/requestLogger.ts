import { Request, Response, NextFunction } from "express";

export const requestLogger = (req: Request, _res: Response, next: NextFunction): void => {
  const now = new Date().toISOString();
  console.info(`[${now}] ${req.method} ${req.originalUrl}`);
  next();
};
