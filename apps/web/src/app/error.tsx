"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@fa/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Sentry hook lives in T5's instrumentation file — this is the user-facing surface.
    console.error("app error", error);
  }, [error]);

  return (
    <main className="container py-32 max-w-md text-center">
      <p className="text-small text-danger mb-4">Something broke</p>
      <h1 className="text-h1 mb-3">We hit an error.</h1>
      <p className="text-body text-fg-muted mb-2">It&apos;s been logged. Try again, or head home.</p>
      {error.digest && <p className="text-small text-fg-subtle mb-8">Ref: {error.digest}</p>}
      <div className="flex gap-2 justify-center">
        <Button onClick={reset}>Try again</Button>
        <Link href="/"><Button variant="ghost">Home</Button></Link>
      </div>
    </main>
  );
}
