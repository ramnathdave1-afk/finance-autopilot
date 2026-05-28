"use client";
// Tier-3 Net Worth Strategy page (PRD §8.4 Agent 15). Dispatches the real
// net_worth_strategy / strategy_recommendation action. RECOMMEND-ONLY: the agent
// projects the user's net_worth_snapshots trajectory toward a target and asks
// Claude for ranked levers — it moves no money. Because it requiresApproval, the
// dispatch parks an awaiting_approval row; the user approves; the agent runs. We
// render the real projection from the `projection:done` audit step (current net
// worth, $/day pace, whether/when the target is reached) plus the lever count
// from `strategy:done` — no hardcoded trajectory sparkline, no literal levers.

import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
import { ApprovalControls, findStep, useTier3Runner } from "@/components/tier3-runner";

// Default goal: $250K by end of 2030. Production passes the user's chosen goal.
const TARGET = { amount: 250_000, date: "2030-12-31" };

interface Lever { title: string; rationale: string; effort: "low" | "medium" | "high" }

function money(n: unknown): string {
  return typeof n === "number" ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";
}

export default function StrategyPage() {
  const runner = useTier3Runner({
    agentType: "net_worth_strategy",
    actionType: "strategy_recommendation",
    input: { target: TARGET },
  });

  const projection = findStep(runner.steps, "projection:done")?.detail;
  const insufficient = findStep(runner.steps, "projection:insufficient");
  const strategy = findStep(runner.steps, "strategy:done")?.detail;
  const reaches = projection?.reaches;
  const levers = (strategy?.levers as Lever[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Premium</Badge>
        <h1 className="text-h1 mb-1">Net worth strategy</h1>
        <p className="text-small text-fg-muted">
          We project your trajectory from your net-worth history and recommend ranked levers to hit{" "}
          {money(TARGET.amount)} by {new Date(TARGET.date).getUTCFullYear()}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your trajectory</CardTitle>
          <Badge tone="neutral">Recommend-only</Badge>
        </CardHeader>

        {runner.phase === "idle" && (
          <>
            <CardBody className="mt-2">
              Build a projection from your tracked net worth and get ranked levers toward your goal.
              Requires your approval before it runs.
            </CardBody>
            <CardFooter>
              <Button onClick={runner.dispatch} disabled={runner.pending}>
                {runner.pending ? "…" : "Run strategy"}
              </Button>
            </CardFooter>
          </>
        )}

        {runner.phase === "dispatching" && <CardBody className="mt-2">Starting…</CardBody>}

        {runner.phase === "awaiting_approval" && (
          <>
            <CardBody className="mt-2">Ready to project your trajectory. Approve to run.</CardBody>
            <CardFooter>
              <ApprovalControls runner={runner} approveLabel="Approve & run" />
            </CardFooter>
          </>
        )}

        {runner.phase === "running" && (
          <CardBody className="mt-2">Reading your net-worth history and building the plan…</CardBody>
        )}

        {runner.phase === "succeeded" && insufficient && (
          <CardBody className="mt-2">
            Not enough net-worth history to project yet. Keep your accounts connected — once we have
            a couple of snapshots we&apos;ll chart your trajectory and recommend levers.
          </CardBody>
        )}

        {runner.phase === "succeeded" && !insufficient && (
          <ul className="mt-3 space-y-2">
            <Row label="Current net worth" value={money(projection?.currentNetWorth)} sub="latest snapshot" />
            <Row
              label="Pace"
              value={money(projection?.dollarsPerDay) + "/day"}
              sub={projection?.flatOrNegative ? "flat or declining" : "growing"}
            />
            <Row
              label={`On track for ${money(TARGET.amount)}?`}
              value={
                reaches === "already_met"
                  ? "Already there"
                  : reaches === "unreachable"
                    ? "Not on current path"
                    : typeof reaches === "string"
                      ? `Reaches ${reaches}`
                      : "—"
              }
              sub={`target ${TARGET.date}`}
            />
          </ul>
        )}

        {runner.phase === "succeeded" && !insufficient && (
          <div className="mt-4">
            <div className="text-body mb-2">Recommended levers</div>
            {typeof strategy?.headline === "string" && strategy.headline !== "" && (
              <CardBody className="mb-2 text-small text-fg-muted">{strategy.headline as string}</CardBody>
            )}
            {levers.length === 0 ? (
              <CardBody className="text-small text-fg-muted">
                No levers to recommend right now — your trajectory already meets the goal, or we need
                a bit more history.
              </CardBody>
            ) : (
              <ul className="space-y-2">
                {levers.map((lever, i) => (
                  <li key={`${lever.title}-${i}`} className="rounded-md border border-border bg-bg p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-body">{lever.title}</div>
                      <Badge tone="neutral">{lever.effort} effort</Badge>
                    </div>
                    <div className="mt-1 text-small text-fg-muted">{lever.rationale}</div>
                  </li>
                ))}
              </ul>
            )}
            <CardBody className="mt-2 text-small text-fg-subtle">Ranked, recommend-only.</CardBody>
          </div>
        )}

        {runner.phase === "failed" && (
          <CardBody className="mt-2 text-danger" role="alert">{runner.error}</CardBody>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-border bg-bg p-3">
      <div>
        <div className="text-body">{label}</div>
        <div className="text-small text-fg-muted">{sub}</div>
      </div>
      <span className="text-body text-fg">{value}</span>
    </li>
  );
}
