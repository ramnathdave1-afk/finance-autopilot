import { Badge, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
import { DispatchButton } from "@/components/dispatch-button";

const deductibles = [
  { category: "Home office", amount: 1240, count: 18 },
  { category: "Mileage", amount: 980, count: 142 },
  { category: "Software & subscriptions", amount: 612, count: 11 },
  { category: "Phone / internet", amount: 380, count: 12 }
];

export default function TaxPrepPage() {
  const total = deductibles.reduce((s, d) => s + d.amount, 0);
  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Premium</Badge>
        <h1 className="text-h1 mb-1">Tax prep</h1>
        <p className="text-small text-fg-muted">
          Year-round deductible tracking. Hand off to TurboTax / H&amp;R Block at filing time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <Badge tone="accent">${total.toLocaleString()} tracked</Badge>
          <span className="text-small text-fg-subtle">YTD</span>
        </CardHeader>
        <CardTitle>Deductibles by category</CardTitle>
        <ul className="mt-3 space-y-2">
          {deductibles.map((d) => (
            <li key={d.category} className="flex items-center justify-between rounded-md border border-border bg-bg p-3">
              <span className="text-body">{d.category}</span>
              <span className="text-small text-fg-muted">${d.amount.toLocaleString()} · {d.count} txns</span>
            </li>
          ))}
        </ul>
        <CardFooter>
          <DispatchButton
            agentId="tax_prep"
            agentType="credit_card_optimizer"
            actionType="export_to_turbotax"
            doneLabel="Export queued"
          >
            Export to TurboTax
          </DispatchButton>
          <DispatchButton
            agentId="tax_prep"
            agentType="credit_card_optimizer"
            actionType="review_transactions"
            variant="ghost"
            doneLabel="Review opened"
          >
            Review transactions
          </DispatchButton>
        </CardFooter>
      </Card>

      <Card>
        <CardTitle>1099 income</CardTitle>
        <CardBody className="mt-2">
          Aggregated from Stripe, PayPal, Cash App, and direct deposits flagged as 1099-style.
        </CardBody>
      </Card>
    </div>
  );
}
