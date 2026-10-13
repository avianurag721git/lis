import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { env } from "../../utils/env";
import { useTenant } from "../../modules/tenant/tenant.context";
import { lisDashboardApi } from "./dashboard.service";

/** Subscribe to dashboard:stats-update and invalidate related queries. */
export const useDashboardRealtime = (queryKeyNames: string[]): void => {
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const keySig = queryKeyNames.join("|");

  useEffect(() => {
    if (!tenantId) return;
    const keys = keySig.split("|").filter(Boolean);
    const socket: Socket = io(env.apiUrl, { transports: ["websocket", "polling"] });
    socket.emit("join-tenant", tenantId);
    socket.on("dashboard:stats-update", () => {
      for (const k of keys) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [tenantId, qc, keySig]);
};

export const useLisQueries = () => {
  const executive = useQuery({
    queryKey: ["dash-executive"],
    queryFn: () => lisDashboardApi.executiveSummary()
  });
  const tat = useQuery({
    queryKey: ["dash-tat"],
    queryFn: () => lisDashboardApi.tatMetrics()
  });
  const rejections = useQuery({
    queryKey: ["dash-rejections"],
    queryFn: () => lisDashboardApi.sampleRejections()
  });
  const pipeline = useQuery({
    queryKey: ["dash-pipeline"],
    queryFn: () => lisDashboardApi.livePipeline(),
    refetchInterval: 30_000
  });
  return useMemo(() => ({ executive, tat, rejections, pipeline }), [executive, tat, rejections, pipeline]);
};
