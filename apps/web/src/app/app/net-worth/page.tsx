"use client";
import { Badge, Button, Card, CardBody, CardTitle, Sparkline } from "@fa/ui";

// Stub data — T2 wires real net worth time series from connected_accounts + transactions.
const trend = [
  18200, 18450, 18620, 18510, 18890, 19100, 19340, 19420, 19580, 19770,
  19990, 20120, 20410, 20690, 20850, 21020, 21280, 21550, 21810, 22040,
  22210, 22480, 22760, 22910, 23140, 23390, 23510, 23780, 24050, 24310
];
const current = trend[trend.length - 1];
const start = trend[0];
const delta = current - start;
const pct = ((delta / start) * 100).toFixed(1);

const milestones = [
  { label: "$10K", date: "Mar 2025", done: true },
  { label: "$20K", date: "Apr 2026", done: true },
  { label: "$25K", date: "Projected Jun 2026", done: false },
  { label: "$50K", date: "Projected Mar 2027", done: false },
  { label: "$100K", date: "Projected Feb 2028", done: false }
];

async function share() {
  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share({
      title: "Net worth update",
      text: `Up $${delta.toLocaleString()} (${pct}%) this month with Pilot.`
    }).catch(() => {});
  }
}

export default function NetWorthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 mb-1">Net worth</h1>
        <p className="text-small text-fg-muted">Past 30 days.</p>
      </div>

      <Card>
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-display">${current.toLocaleString()}</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone="accent">+${delta.toLocaleString()}</Badge>
              <span className="text-small text-fg-muted">{pct}% this month</span>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={share}>Share</Button>
        </div>
        <Sparkline values={trend} />
      </Card>

      <Card>
        <CardTitle>Milestones</CardTitle>
        <CardBody className="mt-2">Auto-celebrate when you cross a line.</CardBody>
        <ul className="mt-4 space-y-2">
          {milestones.map((m) => (
            <li key={m.label} className="flex items-center justify-between rounded-md border border-border bg-bg p-3">
              <div className="flex items-center gap-3">
                <span className={m.done ? "text-accent" : "text-fg-subtle"}>{m.done ? "✓" : "○"}</span>
                <span className="text-body">{m.label}</span>
              </div>
              <span className="text-small text-fg-muted">{m.date}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
