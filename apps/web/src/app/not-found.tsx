import Link from "next/link";
import { Button } from "@fa/ui";

export default function NotFound() {
  return (
    <main className="container py-32 max-w-md text-center">
      <p className="text-small text-fg-subtle mb-4">404</p>
      <h1 className="text-h1 mb-3">Couldn&apos;t find that page.</h1>
      <p className="text-body text-fg-muted mb-8">It may have moved, or the link is stale.</p>
      <div className="flex gap-2 justify-center">
        <Link href="/"><Button>Home</Button></Link>
        <Link href="/app"><Button variant="ghost">Open Pilot</Button></Link>
      </div>
    </main>
  );
}
