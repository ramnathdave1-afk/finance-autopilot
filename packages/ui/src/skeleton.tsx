import * as React from "react";
import { cn } from "./cn";

export function Skeleton({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-bg-elevated/80",
        className
      )}
      {...p}
    />
  );
}
