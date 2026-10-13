import { ZodError, ZodTypeAny } from "zod";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import { HTTP_STATUS } from "../constants/httpStatus";

export const validate = (schema: ZodTypeAny) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });
      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];
        next(
          new AppError(
            firstIssue?.message ?? "Validation failed",
            HTTP_STATUS.BAD_REQUEST,
            "VALIDATION_ERROR"
          )
        );
        return;
      }
      next(error);
    }
  };
};
