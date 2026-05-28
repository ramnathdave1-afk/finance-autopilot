"use client";
import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";

export function UserMenu({ email, isDemo }: { email: string | null; isDemo: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const initial = (email?.[0] ?? "D").toUpperCase();

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (isDemo) {
    return (
      <Link href="/auth/login" className="text-small text-fg-muted hover:text-fg">
        Sign in
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 rounded-full bg-accent text-accent-fg text-small font-medium grid place-items-center focus-ring"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border border-border bg-bg-elevated shadow-card z-40 p-1">
          {email && <div className="px-3 py-2 text-small text-fg-muted truncate">{email}</div>}
          <Link href="/app/settings" className="block px-3 py-2 text-small text-fg hover:bg-bg rounded-sm">Settings</Link>
          <Link href="/app/settings/agents" className="block px-3 py-2 text-small text-fg hover:bg-bg rounded-sm">Agent permissions</Link>
          <Link href="/app/settings/notifications" className="block px-3 py-2 text-small text-fg hover:bg-bg rounded-sm">Notifications</Link>
          <form action={signOutAction}>
            <button type="submit" className="block w-full text-left px-3 py-2 text-small text-danger hover:bg-bg rounded-sm">Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
