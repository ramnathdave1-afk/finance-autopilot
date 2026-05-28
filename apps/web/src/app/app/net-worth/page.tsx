import { Badge, Card, CardBody, CardTitle, Sparkline } from "@fa/ui";
import { ShareButton } from "@/components/share-button";
import { currentUserId } from "@/lib/current-user";
import { getNetWorth } from "@/lib/data/net-worth";

const milestones = [
  { label: "$10K", date: "Mar 2025", done: true },
  { label: "$20K", date: "Apr 2026", done: true },
  { label: "$25K", date: "Projected Jun 2026", done: false },
  { label: "$50K", date: "Projected Mar 2027", done: false },
  { label: "$100K", date: "Projected Feb 2028", done: false }
];

export default async function NetWorthPage() {
  const userId = await currentUserId();
  const { current, trend } = await getNetWorth(userId);
  const start = trend[0];
  const delta = current - start;
  const pct = start > 0 ? ((delta / start) * 100).toFixed(1) : "0.0";

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
              <Badge tone="accent">{delta >= 0 ? "+" : ""}${delta.toLocaleString()}</Badge>
              <span className="text-small text-fg-muted">{pct}% this month</span>
            </div>
          </div>
          <ShareButton delta={delta} pct={pct} />
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
