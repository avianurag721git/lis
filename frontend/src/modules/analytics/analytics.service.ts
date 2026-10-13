import { httpClient } from "../../services/http";
import { AnalyticsDashboard } from "./analytics.types";

type Params = { from?: string; to?: string };

export const getAnalyticsDashboard = async (params?: Params): Promise<AnalyticsDashboard> => {
  const response = await httpClient.get<AnalyticsDashboard>("/analytics/dashboard", { params });
  return response.data;
};
