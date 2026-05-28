import Link from "next/link";
import { Badge, Card, CardBody, CardTitle } from "@fa/ui";

type AgentEntry = {
  href: string;
  name: string;
  tier: "Autopilot" | "Pro" | "Premium";
  blurb: string;
};

const agents: AgentEntry[] = [
  { href: "/app/agents/bill-negotiation", name: "Bill Negotiation", tier: "Pro", blurb: "Voice AI calls and renegotiates your bills." },
  { href: "/app/agents/disputes", name: "Charge Disputes", tier: "Pro", blurb: "Detect anomalies and file disputes with your bank." },
  { href: "/app/agents/cards", name: "Card Optimizer", tier: "Pro", blurb: "Use the right card for every purchase category." },
  { href: "/app/agents/missing-money", name: "Missing Money", tier: "Pro", blurb: "Find unclaimed funds and forgotten balances." },
  { href: "/app/agents/refinance", name: "Refinance Watcher", tier: "Pro", blurb: "Monitors rates and alerts on real savings." },
  { href: "/app/agents/insurance", name: "Insurance Shopper", tier: "Pro", blurb: "Re-quotes annually and shows you the best deal." }
];

export default function AgentsIndex() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h1 mb-1">Agents</h1>
        <p className="text-small text-fg-muted">Everything that can work for you.</p>
      </div>
      {agents.map((a) => (
        <Link key={a.href} href={a.href} className="block">
          <Card className="hover:border-border-strong">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{a.name}</CardTitle>
                <CardBody className="mt-1">{a.blurb}</CardBody>
              </div>
              <Badge tone="accent">{a.tier}</Badge>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
