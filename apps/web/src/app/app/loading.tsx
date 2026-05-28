import { Skeleton } from "@fa/ui";

export default function FeedLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-48" />
      <div className="space-y-3 pt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card-surface">
            <Skeleton className="h-5 w-24 mb-3" />
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
