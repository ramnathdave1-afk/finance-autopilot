"use client";
import { useState } from "react";
import { Badge, Card, CardBody, CardTitle } from "@fa/ui";

type Consent = "approve_each" | "auto_small" | "full_auto";
type AgentConfig = { id: string; name: string; tier: string; consent: Consent; enabled: boolean };

const initial: AgentConfig[] = [
  { id: "subscription-killer", name: "Subscription Killer", tier: "Autopilot", consent: "approve_each", enabled: true },
  { id: "auto-saver", name: "Auto-Saver", tier: "Autopilot", consent: "approve_each", enabled: true },
  { id: "round-up", name: "Round-Up Investor", tier: "Autopilot", consent: "auto_small", enabled: true },
  { id: "spending-coach", name: "Spending Coach", tier: "Autopilot", consent: "full_auto", enabled: true },
  { id: "goal-funder", name: "Goal Funder", tier: "Autopilot", consent: "approve_each", enabled: true },
  { id: "daily-brief", name: "Daily Briefing", tier: "Autopilot", consent: "full_auto", enabled: true },
  { id: "bill-negotiation", name: "Bill Negotiation", tier: "Pro", consent: "approve_each", enabled: true },
  { id: "disputes", name: "Charge Disputes", tier: "Pro", consent: "approve_each", enabled: true },
  { id: "cards", name: "Card Optimizer", tier: "Pro", consent: "approve_each", enabled: false },
  { id: "missing-money", name: "Missing Money", tier: "Pro", consent: "auto_small", enabled: true },
  { id: "refinance", name: "Refinance Watcher", tier: "Pro", consent: "auto_small", enabled: true },
  { id: "insurance", name: "Insurance Shopper", tier: "Pro", consent: "approve_each", enabled: false }
];

const labels: Record<Consent, string> = {
  approve_each: "Approve each",
  auto_small: "Auto-do small stuff",
  full_auto: "Full auto"
};

export default function AgentSettings() {
  const [configs, setConfigs] = useState(initial);

  function update(id: string, patch: Partial<AgentConfig>) {
    setConfigs((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h1 mb-1">Agent permissions</h1>
        <p className="text-small text-fg-muted">Earn into Full auto. Default is Approve each.</p>
      </div>
      {configs.map((c) => (
        <Card key={c.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone={c.tier === "Pro" ? "accent" : "neutral"}>{c.tier}</Badge>
                <CardTitle>{c.name}</CardTitle>
              </div>
              <CardBody>{c.enabled ? "Enabled" : "Disabled"}</CardBody>
            </div>
            <button
              type="button"
              onClick={() => update(c.id, { enabled: !c.enabled })}
              className="text-small text-fg-muted hover:text-fg"
            >
              {c.enabled ? "Disable" : "Enable"}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(Object.keys(labels) as Consent[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => update(c.id, { consent: k })}
                disabled={!c.enabled}
                className={`rounded-md border px-3 py-2 text-small transition-colors ${
                  c.consent === k && c.enabled
                    ? "border-accent text-accent"
                    : "border-border text-fg-muted hover:text-fg disabled:opacity-50"
                }`}
              >
                {labels[k]}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
