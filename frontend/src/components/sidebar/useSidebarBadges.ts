import { useQuery } from "@tanstack/react-query";
import { pathologistApi } from "../../features/pathologist/pathologist.service";
import { samplesApi } from "../../features/samples/samples.service";
import { inventoryApi } from "../../features/inventory/inventory.service";
import { labResultsApi } from "../../features/results/labResults.service";
import { useAuth } from "../../modules/auth/auth.context";
import type { SidebarBadgeKey } from "./sidebarNav.config";

export type SidebarBadges = Record<
  SidebarBadgeKey,
  { count?: number; label?: string; tone?: "default" | "warning" | "danger" }
>;

const emptyBadges = (): SidebarBadges => ({
  pathologist: { count: 0 },
  labReceiving: { count: 0 },
  reagentsLow: { count: 0 },
  resultEntry: { count: 0 }
});

/** Only poll badge endpoints the current role is allowed to call — avoids 403 spam. */
export const useSidebarBadges = (): SidebarBadges => {
  const { hasPermission, isAuthenticated } = useAuth();

  const canPathologist = isAuthenticated && hasPermission("PATHOLOGIST_VERIFY");
  const canSamples =
    isAuthenticated && (hasPermission("SAMPLE_RECEIVE") || hasPermission("SAMPLE_COLLECT"));
  const canReagents = isAuthenticated && hasPermission("REAGENT_MANAGE");
  const canResultEntry = isAuthenticated && hasPermission("RESULT_ENTRY");

  const { data: pathQueue = [] } = useQuery({
    queryKey: ["sidebar-badge-pathologist"],
    queryFn: () => pathologistApi.queue(),
    enabled: canPathologist,
    refetchInterval: canPathologist ? 60_000 : false,
    retry: false
  });

  const { data: samples = [] } = useQuery({
    queryKey: ["sidebar-badge-samples"],
    queryFn: () => samplesApi.list(),
    enabled: canSamples,
    refetchInterval: canSamples ? 60_000 : false,
    retry: false
  });

  const { data: reagents = [] } = useQuery({
    queryKey: ["sidebar-badge-reagents"],
    queryFn: () => inventoryApi.listReagents(),
    enabled: canReagents,
    refetchInterval: canReagents ? 120_000 : false,
    retry: false
  });

  const { data: pendingResults = [] } = useQuery({
    queryKey: ["sidebar-badge-pending-results"],
    queryFn: () => labResultsApi.pending(),
    enabled: canResultEntry,
    refetchInterval: canResultEntry ? 60_000 : false,
    retry: false
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
    labReceiving: { count: receivingCount },
    reagentsLow: reagentsLowBadge,
    resultEntry: { count: pendingResults.length }
  };
};
