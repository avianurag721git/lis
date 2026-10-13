import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { Check } from "lucide-react";
import { ordersApi, type OrderPipelineStatus } from "../features/orders/orders.service";
import { useTenant } from "../modules/tenant/tenant.context";
import { env } from "../utils/env";
import { cn } from "../lib/utils";

type Props = {
  orderId: string;
  compact?: boolean;
  className?: string;
};

export const OrderPipelineTracker = ({ orderId, compact, className }: Props): JSX.Element | null => {
  const { tenantId } = useTenant();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["order-pipeline", orderId],
    queryFn: () => ordersApi.pipeline(orderId),
    enabled: Boolean(orderId),
    refetchInterval: 15000
  });

  useEffect(() => {
    if (!tenantId || !orderId) return;
    const socket: Socket = io(env.apiUrl, { transports: ["websocket", "polling"] });
    socket.emit("join-tenant", tenantId);
    socket.emit("join-order", orderId);
    const refresh = (): void => {
      void qc.invalidateQueries({ queryKey: ["order-pipeline", orderId] });
    };
    socket.on("order:pipeline-update", refresh);
    socket.on("sample:updated", refresh);
    socket.on("lab-result:queue-update", refresh);
    socket.on("lab-result:pathologist-verified", refresh);
    return () => {
      socket.disconnect();
    };
  }, [tenantId, orderId, qc]);

  if (!orderId) return null;
  if (isLoading && !data) {
    return <div className={cn("pipeline-tracker pipeline-tracker--loading", className)}>Loading pipeline…</div>;
  }
  if (isError || !data) return null;

  return (
    <div className={cn("pipeline-tracker", compact && "pipeline-tracker--compact", className)}>
      {!compact ? (
        <div className="pipeline-tracker-head">
          <strong>{data.patientName}</strong>
          <span className="text-muted text-sm">{data.orderNumber}</span>
          <span className="ml-auto text-xs font-medium text-cyan-600">{data.percentComplete}% complete</span>
        </div>
      ) : null}
      <ol className="pipeline-tracker-steps">
        {data.steps.map((step, idx) => (
          <PipelineStep key={step.id} step={step} isLast={idx === data.steps.length - 1} />
        ))}
      </ol>
    </div>
  );
};

const PipelineStep = ({
  step,
  isLast
}: {
  step: OrderPipelineStatus["steps"][number];
  isLast: boolean;
}): JSX.Element => (
  <li
    className={cn(
      "pipeline-tracker-step",
      step.complete && "pipeline-tracker-step--done",
      step.current && "pipeline-tracker-step--current"
    )}
  >
    <span className="pipeline-tracker-dot" aria-hidden>
      {step.complete ? <Check size={12} strokeWidth={3} /> : null}
    </span>
    <span className="pipeline-tracker-label">{step.label}</span>
    {!isLast ? <span className="pipeline-tracker-connector" aria-hidden /> : null}
  </li>
);
