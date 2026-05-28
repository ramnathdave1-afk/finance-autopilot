import Link from "next/link";
import { Badge, Button, Card } from "@fa/ui";

type Tier = {
  name: string;
  monthly: string;
  annual: string;
  blurb: string;
  features: string[];
  cta: string;
  highlight?: boolean;
  founder?: boolean;
};

const tiers: Tier[] = [
  {
    name: "Autopilot",
    monthly: "$19.99",
    annual: "$169/yr",
    blurb: "Six core agents that handle the routine work.",
    features: [
      "Subscription Killer",
      "Auto-Saver (recommend mode)",
      "Round-Up Investor",
      "Spending Coach",
      "Goal Funder",
      "Daily Briefing"
    ],
    cta: "Start free trial",
    highlight: true,
    founder: true
  },
  {
    name: "Pro",
    monthly: "$29.99",
    annual: "$249/yr",
    blurb: "Higher-impact action agents.",
    features: [
      "Everything in Autopilot",
      "Bill Negotiation (voice AI)",
      "Charge Dispute Agent",
      "Credit Card Optimizer",
      "Missing Money Finder",
      "Refinance Watcher",
      "Insurance Shopper"
    ],
    cta: "Upgrade to Pro"
  },
  {
    name: "Premium",
    monthly: "$49.99",
    annual: "$399/yr",
    blurb: "Strategy agents + human backup.",
    features: [
      "Everything in Pro",
      "Tax Prep Agent",
      "Investment Rebalancer",
      "Net Worth Strategy",
      "White-glove human backup"
    ],
    cta: "Go Premium"
  }
];

export default function Paywall() {
  return (
    <main className="container py-16">
      <div className="max-w-2xl mb-12">
        <Badge tone="accent" className="mb-4">Founder pricing — first 100 get $9.99/mo forever</Badge>
        <h1 className="text-h1 mb-2">Pick a plan.</h1>
        <p className="text-body text-fg-muted">7-day free trial. One-click cancel. Refund on any agent failure.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {tiers.map((t) => (
          <Card key={t.name} className={t.highlight ? "shadow-glow border-accent/40" : ""}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-h2">{t.name}</h2>
              {t.founder && <Badge tone="accent">$9.99/mo lifetime</Badge>}
            </div>
            <div className="text-display mb-1">{t.monthly}<span className="text-small text-fg-muted">/mo</span></div>
            <div className="text-small text-fg-muted mb-4">or {t.annual}</div>
            <p className="text-body text-fg-muted mb-5">{t.blurb}</p>
            <ul className="space-y-2 text-body mb-6">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2"><span className="text-accent">✓</span><span>{f}</span></li>
              ))}
            </ul>
            <Link href="/app"><Button variant={t.highlight ? "primary" : "outline"} className="w-full">{t.cta}</Button></Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
