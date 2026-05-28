"use client";
// Tier-3 Investment Rebalancer page (PRD §8.4 Agent 14). Dispatches the real
// investment_rebalancer / rebalance_recommendation action. The agent is
// RECOMMENDATION-ONLY — it never places a trade (autonomousTrade:false). Because
// it requiresApproval, the dispatch parks an awaiting_approval row; the user
// approves; the agent reads the latest holdings snapshot, computes drift, and
// recommends trades + tax-loss-harvesting candidates. We render the real result
// from the `analysis:done` audit step (totalValue, maxAbsDrift, and the actual
// recommendedTrades + harvestCandidates arrays) — no hardcoded VTI/VXUS/BND
// table, no fakes.
//
// THIS PAGE IS THE DISPATCH PATH (per the inngest route + README): so it must
// load the user's taxable-account ids itself and pass them in — otherwise
// findHarvestCandidates sees no taxable positions and harvesting silently
// returns nothing.

import { useEffect, useState } from "react";
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
import { ApprovalControls, findStep, useTier3Runner } from "@/components/tier3-runner";
import { getTaxableAccountIds } from "@/app/actions/agents";

function quarterTag(now = new Date()): string {
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}-Q${q}`;
}

function money(n: unknown): string {
  return typeof n === "number" ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";
}

function pct(n: unknown): string {
  return typeof n === "number" ? `${(n * 100).toFixed(1)}%` : "—";
}

interface Trade { assetClass: string; side: "buy" | "sell"; amount: number }
interface Harvest { ticker: string | null; name: string | null; unrealizedLoss: number }

export default function RebalancerPage() {
  // Load the user's TAXABLE account ids so tax-loss harvesting actually runs.
  // Without these the agent treats every position as non-taxable and finds no
  // harvest candidates. `null` while loading; `[]` once resolved (possibly empty).
  const [taxableAccountIds, setTaxableAccountIds] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    void getTaxableAccountIds().then((ids) => {
      if (alive) setTaxableAccountIds(ids);
    });
    return () => {
      alive = false;
    };
  }, []);

  const runner = useTier3Runner({
    agentType: "investment_rebalancer",
    actionType: "rebalance_recommendation",
    // A 60/40 equity/fixed-income default target. taxableAccountIds is loaded
    // from the user's connected accounts above and passed through so the harvest
    // path is real, not a perpetual zero.
    input: {
      target: { equity: 0.6, fixed_income: 0.4 },
      taxableAccountIds: taxableAccountIds ?? [],
      period: quarterTag(),
    },
  });

  const hasTaxableAccounts = (taxableAccountIds?.length ?? 0) > 0;
  const analysis = findStep(runner.steps, "analysis:done")?.detail;
  const trades = (analysis?.recommendedTrades as Trade[] | undefined) ?? [];
  const harvests = (analysis?.harvestCandidates as Harvest[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Premium</Badge>
        <h1 className="text-h1 mb-1">Investment rebalancer</h1>
        <p className="text-small text-fg-muted">
          Quarterly drift correction
          {hasTaxableAccounts
            ? " + tax-loss-harvesting candidates on your taxable accounts."
            : ". Connect a taxable brokerage account to also surface tax-loss-harvesting candidates."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{quarterTag()} rebalance</CardTitle>
          <Badge tone="neutral">Recommendation only</Badge>
        </CardHeader>

        {runner.phase === "idle" && (
          <>
            <CardBody className="mt-2">
              Analyze your latest holdings snapshot against your target allocation. We recommend
              the trades that close the drift
              {hasTaxableAccounts ? " and flag harvestable losses in your taxable accounts" : ""} —
              we never place a trade. Requires your approval before it runs.
            </CardBody>
            <CardFooter>
              <Button onClick={runner.dispatch} disabled={runner.pending || taxableAccountIds === null}>
                {runner.pending ? "…" : "Check drift"}
              </Button>
            </CardFooter>
          </>
        )}

        {runner.phase === "dispatching" && <CardBody className="mt-2">Starting…</CardBody>}

        {runner.phase === "awaiting_approval" && (
          <>
            <CardBody className="mt-2">Ready to analyze your portfolio. Approve to run.</CardBody>
            <CardFooter>
              <ApprovalControls runner={runner} approveLabel="Approve & analyze" />
            </CardFooter>
          </>
        )}

        {runner.phase === "running" && (
          <CardBody className="mt-2">Loading holdings and computing drift…</CardBody>
        )}

        {runner.phase === "succeeded" && (
          <>
            <ul className="mt-3 space-y-2">
              <Row label="Portfolio value" value={money(analysis?.totalValue)} sub="latest snapshot" />
              <Row label="Max drift from target" value={pct(analysis?.maxAbsDrift)} sub="largest asset-class gap" />
            </ul>

            <div className="mt-4">
              <div className="text-body mb-2">Recommended trades</div>
              {trades.length === 0 ? (
                <CardBody className="text-small text-fg-muted">
                  No trades needed — your allocation is within tolerance.
                </CardBody>
              ) : (
                <ul className="space-y-2">
                  {trades.map((t, i) => (
                    <Row
                      key={`${t.assetClass}-${i}`}
                      label={`${t.side.toUpperCase()} ${t.assetClass}`}
                      value={money(t.amount)}
                      sub="to close the drift"
                    />
                  ))}
                </ul>
              )}
            </div>

            {hasTaxableAccounts && (
              <div className="mt-4">
                <div className="text-body mb-2">Tax-loss-harvesting candidates</div>
                {harvests.length === 0 ? (
                  <CardBody className="text-small text-fg-muted">
                    No harvestable losses in your taxable accounts right now.
                  </CardBody>
                ) : (
                  <ul className="space-y-2">
                    {harvests.map((h, i) => (
                      <Row
                        key={`${h.ticker ?? h.name ?? "h"}-${i}`}
                        label={h.ticker ?? h.name ?? "position"}
                        value={money(h.unrealizedLoss)}
                        sub="unrealized loss (taxable account)"
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}

            <CardBody className="mt-3 text-small text-fg-muted">
              Recommendation only — no trades were placed. Execute these at your brokerage.
            </CardBody>
          </>
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
