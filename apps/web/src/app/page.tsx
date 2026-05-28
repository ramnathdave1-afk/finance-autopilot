import Link from "next/link";
import { Badge, Button } from "@fa/ui";
import { WaitlistForm } from "@/components/waitlist-form";
import { getWaitlistCount } from "@/app/actions/waitlist";

export default async function Landing() {
  const count = await getWaitlistCount();
  const founderSeatsLeft = Math.max(0, 100 - count);

  return (
    <main className="container py-24">
      <section className="max-w-3xl">
        <Badge tone="accent" className="mb-6">
          {founderSeatsLeft > 0
            ? `Founder pricing — ${founderSeatsLeft} of 100 seats left at $9.99/mo for life`
            : "Founder seats are gone — standard pricing only"}
        </Badge>
        <h1 className="text-display mb-6">AI agents that actually do the work.</h1>
        <p className="text-body text-fg-muted mb-10 max-w-2xl">
          Cancel subscriptions. Negotiate bills by voice. Dispute charges. Auto-save. Round-up
          invest. Watch every action in a public audit log. Pause anything in one tap.
        </p>
        <div className="mb-10">
          <WaitlistForm />
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth/signup"><Button>Create account</Button></Link>
          <Link href="/auth/login"><Button variant="ghost">Sign in</Button></Link>
          <Link href="/paywall"><Button variant="ghost">See plans</Button></Link>
        </div>
      </section>
    </main>
  );
}
