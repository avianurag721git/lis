export type StatusBadgeVariant = "live" | "tracking" | "critical" | "success" | "warning" | "idle" | "default";

const variantClass: Record<StatusBadgeVariant, string> = {
  live: "status-badge status-badge--live",
  tracking: "status-badge status-badge--tracking",
  critical: "status-badge status-badge--warning",
  success: "status-badge status-badge--success",
  warning: "status-badge status-badge--warning",
  idle: "status-badge status-badge--idle",
  default: "status-badge status-badge--default"
};

type Props = {
  label: string;
  variant?: StatusBadgeVariant;
  pulse?: boolean;
  className?: string;
};

export const StatusBadge = ({ label, variant = "default", className }: Props): JSX.Element => {
  return (
    <span className={[variantClass[variant], className].filter(Boolean).join(" ")}>
      <span className="status-badge__dot" aria-hidden />
      {label}
    </span>
  );
};
