import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

type Props = {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  className?: string;
  size?: number;
};

/** Inline spinner + label for submit buttons during async work. */
export const ButtonSpinner = ({
  label,
  loadingLabel,
  loading = false,
  className,
  size = 18
}: Props): JSX.Element => {
  if (!loading) {
    return <span className={className}>{label}</span>;
  }
  return (
    <span className={cn("btn-spinner", className)}>
      <Loader2 className="spin" size={size} aria-hidden />
      <span>{loadingLabel ?? label}</span>
    </span>
  );
};
