"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";

type Tier = "autopilot" | "pro" | "premium";
const meta: Record<Tier, { name: string; monthly: string; annual: string; pitch: string }> = {
  autopilot: { name: "Autopilot", monthly: "$19.99", annual: "$169/yr", pitch: "Six agents handling the routine work." },
  pro: { name: "Pro", monthly: "$29.99", annual: "$249/yr", pitch: "Voice negotiation, disputes, card optimizer, and more." },
  premium: { name: "Premium", monthly: "$49.99", annual: "$399/yr", pitch: "Strategy agents + white-glove human backup." }
};

function UpgradeInner() {
  const params = useSearchParams();
  const tier = (params.get("to") ?? "pro") as Tier;
  const t = meta[tier] ?? meta.pro;
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [busy, setBusy] = useState(false);

  async function checkout() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier, billing })
      });
      const data = await res.json().catch(() => ({}));
      if (data?.url) window.location.assign(data.url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-glow border-accent/40">
      <CardHeader>
        <Badge tone="accent">Upgrade</Badge>
        <span className="text-small text-fg-subtle">7-day free trial</span>
      </CardHeader>
      <CardTitle>{t.name}</CardTitle>
      <CardBody className="mt-2">{t.pitch}</CardBody>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setBilling("monthly")}
          className={`flex-1 rounded-md border px-3 py-2 text-small ${billing === "monthly" ? "border-accent text-accent" : "border-border text-fg-muted"}`}
        >
          Monthly {t.monthly}
        </button>
        <button
          type="button"
          onClick={() => setBilling("annual")}
          className={`flex-1 rounded-md border px-3 py-2 text-small ${billing === "annual" ? "border-accent text-accent" : "border-border text-fg-muted"}`}
        >
          Annual {t.annual}
        </button>
      </div>
      <CardFooter>
        <Button onClick={checkout} disabled={busy} className="w-full">
          {busy ? "Opening checkout…" : "Start trial"}
        </Button>
      </CardFooter>
      <p className="mt-3 text-small text-fg-muted">One-click cancel. Refund on any agent failure.</p>
    </Card>
  );
}

export default function UpgradePage() {
  return (
    <main className="container py-20 max-w-md">
      <Suspense fallback={<div className="text-fg-muted">Loading…</div>}>
        <UpgradeInner />
      </Suspense>
    </main>
  );
}
