import { Request, Response, NextFunction } from "express";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { aiPathologistService } from "./aiPathologist.service";

export const analyzeResult = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await aiPathologistService.analyzeResult(req.body);
    res.status(HTTP_STATUS.OK).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const patientSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await aiPathologistService.patientSummary(req.body);
    res.status(HTTP_STATUS.OK).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
