import { Badge, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
import { DispatchButton } from "@/components/dispatch-button";
import { stubFound } from "@/lib/agents-pro-stub";

export default function MissingMoneyPage() {
  const total = stubFound.reduce((s, f) => s + f.amount, 0);
  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Pro</Badge>
        <h1 className="text-h1 mb-1">Missing money</h1>
        <p className="text-small text-fg-muted">${total.toFixed(2)} found across state unclaimed databases and old accounts.</p>
      </div>
      {stubFound.map((f) => (
        <Card key={f.id}>
          <CardHeader>
            <Badge tone="accent">${f.amount.toFixed(2)}</Badge>
            <span className="text-small text-fg-subtle">{f.source}</span>
          </CardHeader>
          <CardTitle>{f.type}</CardTitle>
          <CardBody className="mt-2">Verify your details and we&apos;ll file the claim.</CardBody>
          <CardFooter>
            <DispatchButton
              agentType="missing_money"
              actionType="file_claim"
              target={f.source}
              doneLabel="Claim filed"
            >
              Claim
            </DispatchButton>
            <DispatchButton
              agentType="missing_money"
              actionType="reject_match"
              target={f.source}
              variant="ghost"
              doneLabel="Dismissed"
            >
              Not me
            </DispatchButton>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
