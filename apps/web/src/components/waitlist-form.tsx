"use client";
import { useState, useTransition } from "react";
import { Button, Input } from "@fa/ui";
import { joinWaitlistAction } from "@/app/actions/waitlist";

export function WaitlistForm() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; founderLocked: boolean; rank?: number; error?: string } | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set("source", "landing");
    start(async () => {
      const res = await joinWaitlistAction(data);
      setResult(res);
    });
  }

  if (result?.ok) {
    return (
      <div className="rounded-md border border-accent/40 bg-accent/10 p-4">
        <p className="text-body text-fg">
          {result.founderLocked
            ? `You're in. Founder pricing locked — $9.99/mo forever${result.rank ? ` (rank #${result.rank} of 100)` : ""}.`
            : "You're on the waitlist. We'll email when launch happens."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 max-w-md">
      <Input
        type="email"
        name="email"
        required
        placeholder="you@email.com"
        className="flex-1"
        aria-label="Email"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Join waitlist"}
      </Button>
      {result?.error && <span className="text-small text-danger" role="alert">{result.error}</span>}
    </form>
  );
}
