import * as React from "react";
import { cn } from "./cn";

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  stroke?: string;
  fill?: string;
}

export function Sparkline({
  values,
  width = 600,
  height = 160,
  className,
  stroke = "hsl(150 80% 52%)",
  fill = "hsl(150 80% 52% / 0.15)"
}: SparklineProps) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full h-auto", className)}
      role="img"
      aria-label="Trend chart"
    >
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
