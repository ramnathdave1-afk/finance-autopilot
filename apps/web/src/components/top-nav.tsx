"use client";
import Link from "next/link";
import { Badge, Switch } from "@fa/ui";
import { usePauseAll } from "@/lib/pause-store";

export function TopNav() {
  const [paused, setPaused] = usePauseAll();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/app" className="font-semibold tracking-tight">Pilot</Link>
        <nav className="flex items-center gap-5 text-small text-fg-muted">
          <Link href="/app" className="hover:text-fg">Feed</Link>
          <Link href="/app/net-worth" className="hover:text-fg">Net worth</Link>
          <Link href="/app/agents" className="hover:text-fg">Agents</Link>
          <Link href="/app/activity" className="hover:text-fg">Activity</Link>
          <Link href="/app/settings" className="hover:text-fg">Settings</Link>
        </nav>
        <div className="flex items-center gap-3">
          {paused && <Badge tone="warn">Agents paused</Badge>}
          <label htmlFor="pause-all" className="flex items-center gap-2 cursor-pointer">
            <span className="text-small text-fg-muted">Pause all</span>
            <Switch id="pause-all" checked={paused} onCheckedChange={setPaused} label="Pause all agents" />
          </label>
        </div>
      </div>
    </header>
  );
}
