import * as React from "react";
import { cn } from "./cn";

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-small text-fg-muted block mb-1.5", className)} {...p} />
);
