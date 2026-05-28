"use client";
// Tier-3 Tax Prep page (PRD §8.4 Agent 13). Dispatches the real tax_prep /
// tax_summary action via dispatchAction. Because the agent requiresApproval, the
// dispatch parks an awaiting_approval row; the user approves; the agent runs and
// writes a running tax summary into the audit log. We render that summary live
// from the `summary:built` step detail — no static deductible table, no fakes.
// The optional filing handoff (TurboTax / H&R Block) is approved separately and
// only fires when the agent input carries handoff.provider.

import { useState } from "react";
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
import { ApprovalControls, findStep, useTier3Runner } from "@/components/tier3-runner";

function money(n: unknown): string {
  return typeof n === "number" ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";
}

/**
 * The tax year most users are working on right now. During filing season
 * (Jan–Apr) that's the PRIOR completed year — not the brand-new current one.
 * Mirrors @fa/agent-tax-prep's defaultTaxYear (kept local to avoid pulling a
 * server agent package into the client bundle).
 */
function clientDefaultTaxYear(now: Date = new Date()): number {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() <= 3 ? year - 1 : year;
}

/** Selectable tax years: current calendar year back through the prior four. */
function taxYearOptions(now: Date = new Date()): number[] {
  const current = now.getUTCFullYear();
  return [current, current - 1, current - 2, current - 3, current - 4];
}

interface PayerIncome { payer: string; total: number; count: number; crossesReportingThreshold: boolean; needsReview: boolean }
interface DeductionTotal { bucket: string; total: number; count: number }

export default function TaxPrepPage() {
  // taxYear is user-selectable; defaults to the year most users are actually
  // filing for (prior completed year during Jan–Apr filing season, else current).
  const [taxYear, setTaxYear] = useState(() => clientDefaultTaxYear());
  const summaryRunner = useTier3Runner({
    agentType: "tax_prep",
    actionType: "tax_summary",
    input: { taxYear },
  });
  const handoffRunner = useTier3Runner({
    agentType: "tax_prep",
    actionType: "tax_summary",
    // Hand off the EXACT year the user reviewed, not the calendar year.
    input: { taxYear, handoff: { provider: "turbotax" } },
  });

  const built = findStep(summaryRunner.steps, "summary:built")?.detail;
  const income = (built?.income1099 as PayerIncome[] | undefined) ?? [];
  const needsReview = (built?.needsReview1099 as PayerIncome[] | undefined) ?? [];
  const deductions = (built?.deductionsByBucket as DeductionTotal[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Premium</Badge>
        <h1 className="text-h1 mb-1">Tax prep</h1>
        <p className="text-small text-fg-muted">
          Year-round deductible tracking from your categorized transactions. Hand off to
          TurboTax / H&amp;R Block at filing time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Running tax summary</CardTitle>
          <span className="text-small text-fg-subtle">Recommend-only</span>
        </CardHeader>

        {summaryRunner.phase === "idle" && (
          <>
            <CardBody className="mt-2">
              Build your {taxYear} tax-year summary: flagged deductibles, 1099 income from
              business payers (Stripe / Patreon / YouTube / Etsy / Upwork), and a net
              self-employment estimate. P2P inflows (PayPal / Venmo / Cash App) are shown as
              &ldquo;needs review&rdquo; rather than counted as income. Requires your approval before it runs.
            </CardBody>
            <CardFooter className="flex items-center gap-3">
              <label className="text-small text-fg-muted">
                Tax year{" "}
                <select
                  className="rounded-md border border-border bg-bg px-2 py-1 text-body text-fg"
                  value={taxYear}
                  onChange={(e) => setTaxYear(Number(e.target.value))}
                  aria-label="Tax year"
                >
                  {taxYearOptions().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={summaryRunner.dispatch} disabled={summaryRunner.pending}>
                {summaryRunner.pending ? "…" : "Build summary"}
              </Button>
            </CardFooter>
          </>
        )}

        {summaryRunner.phase === "dispatching" && (
          <CardBody className="mt-2">Starting…</CardBody>
        )}

        {summaryRunner.phase === "awaiting_approval" && (
          <>
            <CardBody className="mt-2">
              Ready to scan your {taxYear} transactions. Approve to run.
            </CardBody>
            <CardFooter>
              <ApprovalControls runner={summaryRunner} approveLabel="Approve & build" />
            </CardFooter>
          </>
        )}

        {summaryRunner.phase === "running" && (
          <CardBody className="mt-2">Scanning transactions and building your summary…</CardBody>
        )}

        {summaryRunner.phase === "succeeded" && (
          <>
            <ul className="mt-3 space-y-2">
              <SummaryRow label="1099 income" value={money(built?.total1099Income)} sub={`${built?.payerCount ?? 0} payers`} />
              <SummaryRow label="Deductibles tracked" value={money(built?.totalDeductions)} sub={`${built?.deductionFlagCount ?? 0} txns flagged`} />
              <SummaryRow label="Net self-employment estimate" value={money(built?.netSelfEmploymentEstimate)} sub="context only — not a liability calc" />
            </ul>

            {income.length > 0 && (
              <div className="mt-4">
                <div className="text-body mb-2">1099 income by payer</div>
                <ul className="space-y-2">
                  {income.map((p) => (
                    <SummaryRow
                      key={p.payer}
                      label={p.payer}
                      value={money(p.total)}
                      sub={p.crossesReportingThreshold ? `${p.count} payments — over $600` : `${p.count} payments`}
                    />
                  ))}
                </ul>
              </div>
            )}

            {needsReview.length > 0 && (
              <div className="mt-4">
                <div className="text-body mb-2">P2P inflows — needs review</div>
                <CardBody className="mb-2 text-small text-fg-muted">
                  Personal transfers and business payments mix on these apps, so we do NOT count
                  these as income. Confirm which portion is business income before filing.
                </CardBody>
                <ul className="space-y-2">
                  {needsReview.map((p) => (
                    <SummaryRow
                      key={p.payer}
                      label={p.payer}
                      value={money(p.total)}
                      sub={`${p.count} inflows — not counted as income`}
                    />
                  ))}
                </ul>
              </div>
            )}

            {deductions.length > 0 && (
              <div className="mt-4">
                <div className="text-body mb-2">Deductibles by category</div>
                <ul className="space-y-2">
                  {deductions.map((d) => (
                    <SummaryRow
                      key={d.bucket}
                      label={d.bucket.replace(/_/g, " ")}
                      value={money(d.total)}
                      sub={`${d.count} txns`}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {summaryRunner.phase === "failed" && (
          <CardBody className="mt-2 text-danger" role="alert">
            {summaryRunner.error}
          </CardBody>
        )}
      </Card>

      <Card>
        <CardTitle>Hand off to filing software</CardTitle>
        <CardBody className="mt-2">
          When you&apos;re ready to file, hand your summary to TurboTax. This is a separate
          approval — nothing is sent until you approve it.
        </CardBody>
        {handoffRunner.phase === "idle" && (
          <CardFooter>
            <Button variant="ghost" onClick={handoffRunner.dispatch} disabled={handoffRunner.pending}>
              {handoffRunner.pending ? "…" : "Hand off to TurboTax"}
            </Button>
          </CardFooter>
        )}
        {handoffRunner.phase === "awaiting_approval" && (
          <CardFooter>
            <ApprovalControls runner={handoffRunner} approveLabel="Approve handoff" />
          </CardFooter>
        )}
        {handoffRunner.phase === "running" && <CardBody className="mt-2">Handing off…</CardBody>}
        {handoffRunner.phase === "succeeded" && (
          <CardBody className="mt-2 text-accent">Handed off to TurboTax.</CardBody>
        )}
        {handoffRunner.phase === "failed" && (
          <CardBody className="mt-2 text-danger" role="alert">{handoffRunner.error}</CardBody>
        )}
      </Card>
    </div>
  );
}

function SummaryRow({ label, value, sub }: { label: string; value: string; sub: string }) {
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
