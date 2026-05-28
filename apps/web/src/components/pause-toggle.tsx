"use client";
import { useState, useTransition } from "react";
import { Badge, Switch } from "@fa/ui";
import { setPauseAllAction } from "@/app/actions/pause";

export function PauseToggle({ initialPaused }: { initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [pending, start] = useTransition();

  function toggle(v: boolean) {
    setPaused(v);
    start(async () => {
      const res = await setPauseAllAction(v);
      if (!res.ok) setPaused(!v);
    });
  }

  return (
    <div className="flex items-center gap-3">
      {paused && <Badge tone="warn">Agents paused</Badge>}
      <label htmlFor="pause-all" className="flex items-center gap-2 cursor-pointer">
        <span className="text-small text-fg-muted">{pending ? "Saving…" : "Pause all"}</span>
        <Switch id="pause-all" checked={paused} onCheckedChange={toggle} label="Pause all agents" />
      </label>
    </div>
  );
}
