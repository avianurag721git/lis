import { Request, Response } from "express";
import { HTTP_STATUS } from "../../common/constants/httpStatus";

type HealthResponse = {
  status: "ok";
  service: string;
  timestamp: string;
  uptime: number;
};

export const getHealth = (_req: Request, res: Response<HealthResponse>): void => {
  res.status(HTTP_STATUS.OK).json({
    status: "ok",
    service: "diagnostic-lab-backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
};
