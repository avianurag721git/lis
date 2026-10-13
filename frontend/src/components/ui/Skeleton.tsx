import { cn } from "../../lib/utils";

type SkeletonProps = {
  className?: string;
};

export const Skeleton = ({ className }: SkeletonProps): JSX.Element => (
  <div className={cn("skeleton", className)} aria-hidden />
);

export const SkeletonText = ({ lines = 3, className }: { lines?: number; className?: string }): JSX.Element => (
  <div className={cn("space-y-2", className)}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-3/5" : "w-full")} />
    ))}
  </div>
);

export const SkeletonCard = ({ className }: SkeletonProps): JSX.Element => (
  <div className={cn("glass-card space-y-4", className)}>
    <Skeleton className="h-4 w-1/3" />
    <Skeleton className="h-8 w-2/3" />
    <SkeletonText lines={2} />
  </div>
);

export const SkeletonTable = ({ rows = 5 }: { rows?: number }): JSX.Element => (
  <div className="space-y-2">
    <Skeleton className="h-10 w-full" />
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-12 w-full" />
    ))}
  </div>
);

export const SkeletonStatGrid = ({ count = 4 }: { count?: number }): JSX.Element => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);
