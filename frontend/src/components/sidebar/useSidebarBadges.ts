import { useQuery } from "@tanstack/react-query";
import { pathologistApi } from "../../features/pathologist/pathologist.service";
import { samplesApi } from "../../features/samples/samples.service";
import { inventoryApi } from "../../features/inventory/inventory.service";
import { labResultsApi } from "../../features/results/labResults.service";
import type { SidebarBadgeKey } from "./sidebarNav.config";

export type SidebarBadges = Record<SidebarBadgeKey, { count?: number; label?: string; tone?: "default" | "warning" | "danger" }>;

const emptyBadges = (): SidebarBadges => ({
  pathologist: { count: 0 },
  labReceiving: { count: 0 },
  reagentsLow: { count: 0 },
  resultEntry: { count: 0 }
});

export const useSidebarBadges = (): SidebarBadges => {
  const { data: pathQueue = [] } = useQuery({
    queryKey: ["sidebar-badge-pathologist"],
    queryFn: () => pathologistApi.queue(),
    refetchInterval: 60_000
  });

  const { data: samples = [] } = useQuery({
    queryKey: ["sidebar-badge-samples"],
    queryFn: () => samplesApi.list(),
    refetchInterval: 60_000
  });

  const { data: reagents = [] } = useQuery({
    queryKey: ["sidebar-badge-reagents"],
    queryFn: () => inventoryApi.listReagents(),
    refetchInterval: 120_000
  });

  const { data: pendingResults = [] } = useQuery({
    queryKey: ["sidebar-badge-pending-results"],
    queryFn: () => labResultsApi.pending(),
    refetchInterval: 60_000
  });

  const receivingCount = samples.filter((s) => s.status === "IN_TRANSIT" || s.status === "COLLECTED").length;
  const lowReagents = reagents.filter((r) => r.isActive && r.remainingTests <= r.reorderLevel).length;

  const reagentsLowBadge: SidebarBadges["reagentsLow"] = { count: lowReagents };
  if (lowReagents > 0) {
    reagentsLowBadge.label = lowReagents === 1 ? "1 Low" : `${lowReagents} Low`;
    reagentsLowBadge.tone = "danger";
  }

  return {
    ...emptyBadges(),
    pathologist: { count: pathQueue.length, tone: pathQueue.length > 0 ? "warning" : "default" },
    labReceiving: { count: receivingCount, tone: receivingCount > 0 ? "default" : "default" },
    reagentsLow: reagentsLowBadge,
    resultEntry: { count: pendingResults.length, tone: pendingResults.length > 0 ? "default" : "default" }
  };
};
