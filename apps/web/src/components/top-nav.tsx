import Link from "next/link";
import { currentUserId } from "@/lib/current-user";
import { getPauseAll } from "@/lib/data/pause";
import { PauseToggle } from "./pause-toggle";

export async function TopNav() {
  const userId = await currentUserId();
  const initialPaused = await getPauseAll(userId);
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
        <PauseToggle initialPaused={initialPaused} />
      </div>
    </header>
  );
}
