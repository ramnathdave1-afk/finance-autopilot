import { Badge, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
import { DispatchButton } from "@/components/dispatch-button";
import { stubDisputes } from "@/lib/agents-pro-stub";

export default function DisputesPage() {
  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Pro</Badge>
        <h1 className="text-h1 mb-1">Charge disputes</h1>
        <p className="text-small text-fg-muted">Suspicious or duplicate charges. Tap to file with your bank.</p>
      </div>
      {stubDisputes.length === 0 ? (
        <Card><CardTitle>Nothing flagged.</CardTitle><CardBody className="mt-2">We&apos;ll alert you the moment something looks off.</CardBody></Card>
      ) : (
        stubDisputes.map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <Badge tone="warn">{d.reason}</Badge>
              <span className="text-small text-fg-subtle">{d.date}</span>
            </CardHeader>
            <CardTitle>{d.merchant}</CardTitle>
            <CardBody className="mt-2">${d.amount.toFixed(2)} charged. We&apos;ll file the dispute on your behalf.</CardBody>
            <CardFooter>
              {/*
                Filing a chargeback is IRREVERSIBLE, so it must be explicitly
                approved — requiresApproval={true} lands the action in
                awaiting_approval (it does NOT run until the user confirms in the
                activity feed). The agent itself declares requiresApproval: true;
                passing false here would create a `pending` row that the router
                runs immediately, filing the dispute with the bank WITHOUT any
                confirmation. Mirrors the bill-negotiation page's authorization
                gate for a real-money outbound action.
              */}
              <DispatchButton
                agentType="charge_dispute"
                actionType="file_dispute"
                target={d.merchant}
                requiresApproval={true}
                doneLabel="Sent for approval"
              >
                File dispute
              </DispatchButton>
              <DispatchButton
                agentType="charge_dispute"
                actionType="mark_legitimate"
                target={d.merchant}
                variant="ghost"
                doneLabel="Marked"
              >
                Mark legitimate
              </DispatchButton>
            </CardFooter>
          </Card>
        ))
      )}
    </div>
  );
}
