"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";

function SuccessInner() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  return (
    <Card className="shadow-glow border-accent/40">
      <CardHeader>
        <Badge tone="accent">Welcome aboard</Badge>
      </CardHeader>
      <CardTitle>You&apos;re in.</CardTitle>
      <CardBody className="mt-2">
        Your subscription is active. Your agents are warming up — first runs land in your feed within a few minutes.
      </CardBody>
      {sessionId && <p className="mt-3 text-small text-fg-subtle">Receipt id: {sessionId.slice(0, 12)}…</p>}
      <CardFooter>
        <Link href="/app" className="flex-1"><Button className="w-full">Open Pilot</Button></Link>
        <Link href="/app/settings/agents" className="flex-1"><Button variant="ghost" className="w-full">Set permissions</Button></Link>
      </CardFooter>
    </Card>
  );
}

export default function CheckoutSuccess() {
  return (
    <main className="container py-20 max-w-md">
      <Suspense fallback={<div className="text-fg-muted">Loading…</div>}>
        <SuccessInner />
      </Suspense>
    </main>
  );
}
