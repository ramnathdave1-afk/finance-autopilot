import * as React from "react";
import { cn } from "./cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-border bg-bg-elevated px-3 text-body text-fg",
        "placeholder:text-fg-subtle focus-ring",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
