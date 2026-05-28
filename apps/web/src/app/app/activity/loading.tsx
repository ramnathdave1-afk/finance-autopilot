import { Skeleton } from "@fa/ui";

export default function ActivityLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="space-y-3 pt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card-surface flex justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-56" />
            </div>
            <div className="text-right space-y-2">
              <Skeleton className="h-3 w-16 ml-auto" />
              <Skeleton className="h-5 w-12 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
