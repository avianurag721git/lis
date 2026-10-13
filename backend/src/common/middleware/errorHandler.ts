import { Request, Response, NextFunction } from "express";
import { HTTP_STATUS } from "../constants/httpStatus";
import { AppError } from "../errors/AppError";
import { logger } from "../logger/logger";

type ErrorResponse = {
  success: boolean;
  message: string;
  code?: string;
  stack?: string;
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response<ErrorResponse>,
  _next: NextFunction
): void => {
  const isProd = process.env.NODE_ENV === "production";
  const statusCode = err instanceof AppError ? err.statusCode : HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const code = err instanceof AppError ? err.code : "INTERNAL_SERVER_ERROR";

  if (statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    logger.error({ err, code, statusCode }, err.message);
  } else {
    logger.warn({ err: { message: err.message, code }, statusCode }, "request error");
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal server error",
    code,
    ...(isProd ? {} : { stack: err.stack })
  });
};
