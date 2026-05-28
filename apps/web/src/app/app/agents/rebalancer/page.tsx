import { Badge, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
import { DispatchButton } from "@/components/dispatch-button";

const holdings = [
  { ticker: "VTI", target: 60, actual: 54 },
  { ticker: "VXUS", target: 25, actual: 22 },
  { ticker: "BND", target: 15, actual: 24 }
];

// Premium agents (rebalancer, tax, strategy, human-backup) aren't in the
// AgentType enum yet — using credit_card_optimizer as a placeholder agentType
// so dispatch typechecks. T2 will extend the enum; the actionType field still
// carries the real intent so the inngest router can fan out correctly.

export default function RebalancerPage() {
  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Premium</Badge>
        <h1 className="text-h1 mb-1">Investment rebalancer</h1>
        <p className="text-small text-fg-muted">Quarterly drift correction + tax-loss harvesting on taxable accounts.</p>
      </div>

      <Card>
        <CardHeader>
          <Badge tone="warn">Out of band</Badge>
          <span className="text-small text-fg-subtle">Last checked today</span>
        </CardHeader>
        <CardTitle>Portfolio drift</CardTitle>
        <ul className="mt-3 space-y-2">
          {holdings.map((h) => {
            const drift = h.actual - h.target;
            return (
              <li key={h.ticker} className="flex items-center justify-between rounded-md border border-border bg-bg p-3">
                <div>
                  <div className="text-body">{h.ticker}</div>
                  <div className="text-small text-fg-muted">Target {h.target}% · Actual {h.actual}%</div>
                </div>
                <Badge tone={Math.abs(drift) > 3 ? "warn" : "neutral"}>{drift > 0 ? `+${drift}%` : `${drift}%`}</Badge>
              </li>
            );
          })}
        </ul>
        <CardBody className="mt-4">
          Suggested trades: sell BND $1,420 → buy VTI $880 + VXUS $540.
        </CardBody>
        <CardFooter>
          <DispatchButton
            agentId="investment_rebalancer"
            agentType="credit_card_optimizer"
            actionType="authorize_rebalance"
            doneLabel="Rebalance queued"
          >
            Authorize rebalance
          </DispatchButton>
          <DispatchButton
            agentId="investment_rebalancer"
            agentType="credit_card_optimizer"
            actionType="adjust_targets"
            variant="ghost"
            doneLabel="Targets saved"
          >
            Adjust targets
          </DispatchButton>
        </CardFooter>
      </Card>

      <Card>
        <CardTitle>Tax-loss harvesting</CardTitle>
        <CardBody className="mt-2">
          Two positions show a harvestable loss totaling $612. Replacement securities staged to avoid wash-sale.
        </CardBody>
        <CardFooter>
          <DispatchButton
            agentId="investment_rebalancer"
            agentType="credit_card_optimizer"
            actionType="review_tlh_losses"
            doneLabel="Review opened"
          >
            Review losses
          </DispatchButton>
        </CardFooter>
      </Card>
    </div>
  );
}
