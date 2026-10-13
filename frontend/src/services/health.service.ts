import { httpClient } from "./http";

export type HealthStatus = {
  status: "ok";
  service: string;
  timestamp: string;
  uptime: number;
};

export const getHealthStatus = async (): Promise<HealthStatus> => {
  const { data } = await httpClient.get<HealthStatus>("/health");
  return data;
};
