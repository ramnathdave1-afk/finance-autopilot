import * as React from "react";
import { cn } from "./cn";

type Tone = "neutral" | "accent" | "warn" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-bg-elevated text-fg-muted border-border",
  accent: "bg-accent/15 text-accent border-accent/30",
  warn: "bg-warn/15 text-warn border-warn/30",
  danger: "bg-danger/15 text-danger border-danger/30"
};

export const Badge = ({
  tone = "neutral",
  className,
  ...p
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-sm border px-2 py-0.5 text-small font-medium",
      tones[tone],
      className
    )}
    {...p}
  />
);
