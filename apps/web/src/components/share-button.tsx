"use client";
import { Button } from "@fa/ui";

export function ShareButton({ delta, pct }: { delta: number; pct: string }) {
  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        title: "Net worth update",
        text: `Up $${delta.toLocaleString()} (${pct}%) this month with Pilot.`
      }).catch(() => {});
    }
  }
  return <Button size="sm" variant="outline" onClick={share}>Share</Button>;
}
