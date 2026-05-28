import { Skeleton } from "@fa/ui";

export default function NetWorthLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="card-surface">
        <Skeleton className="h-12 w-48 mb-2" />
        <Skeleton className="h-4 w-32 mb-6" />
        <Skeleton className="h-40 w-full" />
      </div>
      <div className="card-surface">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
