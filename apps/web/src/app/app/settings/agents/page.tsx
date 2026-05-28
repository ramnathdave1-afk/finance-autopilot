"use client";
import { useState, useTransition } from "react";
import { Badge, Card, CardBody, CardTitle } from "@fa/ui";
import { saveAgentConfig } from "@/app/actions/agent-config";
import type { AgentType, ConsentMode } from "@fa/db/types";

type AgentConfig = { id: AgentType; name: string; tier: string; consent: ConsentMode; enabled: boolean };

const initial: AgentConfig[] = [
  { id: "subscription_killer", name: "Subscription Killer", tier: "Autopilot", consent: "approve_each", enabled: true },
  { id: "auto_saver", name: "Auto-Saver", tier: "Autopilot", consent: "approve_each", enabled: true },
  { id: "round_up_investor", name: "Round-Up Investor", tier: "Autopilot", consent: "auto_small", enabled: true },
  { id: "spending_coach", name: "Spending Coach", tier: "Autopilot", consent: "full_auto", enabled: true },
  { id: "goal_funder", name: "Goal Funder", tier: "Autopilot", consent: "approve_each", enabled: true },
  { id: "daily_brief", name: "Daily Briefing", tier: "Autopilot", consent: "full_auto", enabled: true },
  { id: "bill_negotiation", name: "Bill Negotiation", tier: "Pro", consent: "approve_each", enabled: true },
  { id: "charge_dispute", name: "Charge Disputes", tier: "Pro", consent: "approve_each", enabled: true },
  { id: "credit_card_optimizer", name: "Card Optimizer", tier: "Pro", consent: "approve_each", enabled: false },
  { id: "missing_money", name: "Missing Money", tier: "Pro", consent: "auto_small", enabled: true },
  { id: "refinance_watcher", name: "Refinance Watcher", tier: "Pro", consent: "auto_small", enabled: true },
  { id: "insurance_shopper", name: "Insurance Shopper", tier: "Pro", consent: "approve_each", enabled: false }
];

const labels: Record<ConsentMode, string> = {
  approve_each: "Approve each",
  auto_small: "Auto-do small stuff",
  full_auto: "Full auto"
};

export default function AgentSettings() {
  const [configs, setConfigs] = useState(initial);
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<AgentType | null>(null);

  function persist(c: AgentConfig) {
    setSavingId(c.id);
    start(async () => {
      await saveAgentConfig(c.id, c.consent, c.enabled);
      setSavingId(null);
    });
  }

  function update(id: AgentType, patch: Partial<AgentConfig>) {
    setConfigs((cs) => {
      const next = cs.map((c) => (c.id === id ? { ...c, ...patch } : c));
      const updated = next.find((c) => c.id === id);
      if (updated) persist(updated);
      return next;
    });
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
                {savingId === c.id && pending && <span className="text-small text-fg-subtle">saving…</span>}
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
            {(Object.keys(labels) as ConsentMode[]).map((k) => (
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
