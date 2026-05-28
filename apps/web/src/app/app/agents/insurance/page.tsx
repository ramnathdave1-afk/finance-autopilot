import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
import { stubInsurance } from "@/lib/agents-pro-stub";

export default function InsurancePage() {
  const best = stubInsurance.reduce((a, b) => (a.premium < b.premium ? a : b));
  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Pro</Badge>
        <h1 className="text-h1 mb-1">Insurance shopper</h1>
        <p className="text-small text-fg-muted">
          Best quote: <span className="text-fg">{best.carrier} at ${best.premium}/mo</span> — ${Math.abs(best.vsCurrent)} less than current.
        </p>
      </div>
      {stubInsurance.map((q) => (
        <Card key={q.carrier}>
          <CardHeader>
            <Badge tone={q.vsCurrent < 0 ? "accent" : "neutral"}>
              {q.vsCurrent < 0 ? `Save $${Math.abs(q.vsCurrent)}/mo` : "Higher"}
            </Badge>
            <span className="text-small text-fg-subtle">{q.coverage}</span>
          </CardHeader>
          <CardTitle>{q.carrier} — ${q.premium}/mo</CardTitle>
          <CardFooter>
            <Button>Switch</Button>
            <Button variant="ghost">Compare</Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
