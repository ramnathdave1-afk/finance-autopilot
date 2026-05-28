import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
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
              <Button>File dispute</Button>
              <Button variant="ghost">Mark legitimate</Button>
            </CardFooter>
          </Card>
        ))
      )}
    </div>
  );
}
