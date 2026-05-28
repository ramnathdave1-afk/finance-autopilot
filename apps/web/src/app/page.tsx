import Link from "next/link";
import { Button } from "@fa/ui";

export default function Landing() {
  return (
    <main className="container py-24">
      <section className="max-w-3xl">
        <p className="text-small text-fg-muted mb-6">Personal finance, on autopilot.</p>
        <h1 className="text-display mb-6">AI agents that actually do the work.</h1>
        <p className="text-body text-fg-muted mb-10 max-w-2xl">
          Cancel subscriptions. Negotiate bills by voice. Dispute charges. Auto-save. Round-up
          invest. Watch every action in a public audit log. Pause anything in one tap.
        </p>
        <div className="flex items-center gap-3">
          <Link href="/auth/signup"><Button>Get started</Button></Link>
          <Link href="/auth/login"><Button variant="ghost">Sign in</Button></Link>
        </div>
      </section>
    </main>
  );
}
