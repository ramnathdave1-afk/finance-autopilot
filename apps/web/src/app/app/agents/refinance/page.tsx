import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
import { stubRefi } from "@/lib/agents-pro-stub";

export default function RefinancePage() {
  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Pro</Badge>
        <h1 className="text-h1 mb-1">Refinance opportunities</h1>
        <p className="text-small text-fg-muted">We monitor rates daily and alert when refi clears your savings threshold.</p>
      </div>
      {stubRefi.length === 0 ? (
        <Card><CardTitle>No opportunities right now.</CardTitle><CardBody className="mt-2">Rates are watched 24/7.</CardBody></Card>
      ) : (
        stubRefi.map((r) => (
          <Card key={r.loan}>
            <CardHeader>
              <Badge tone="accent">Save ${r.lifetimeSavings}</Badge>
              <span className="text-small text-fg-subtle">{r.currentApr}% → {r.offeredApr}%</span>
            </CardHeader>
            <CardTitle>{r.loan}</CardTitle>
            <CardBody className="mt-2">Balance ${r.balance.toLocaleString()}. Switching rate saves ${r.lifetimeSavings} over the loan life.</CardBody>
            <CardFooter>
              <Button>See offer</Button>
              <Button variant="ghost">Dismiss</Button>
            </CardFooter>
          </Card>
        ))
      )}
    </div>
  );
}
