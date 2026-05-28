import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle } from "@fa/ui";
import { stubCardRecs } from "@/lib/agents-pro-stub";

export default function CardOptimizerPage() {
  const totalLeft = stubCardRecs.reduce((s, r) => s + r.loss, 0);
  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Pro</Badge>
        <h1 className="text-h1 mb-1">Credit card optimizer</h1>
        <p className="text-small text-fg-muted">Estimated ${totalLeft}/mo left on the table with your current card mix.</p>
      </div>
      {stubCardRecs.map((r) => (
        <Card key={r.category}>
          <CardHeader>
            <Badge>{r.category}</Badge>
            <Badge tone="accent">+${r.loss}/mo</Badge>
          </CardHeader>
          <CardTitle>Use the {r.recommended}</CardTitle>
          <CardBody className="mt-2">Earns {r.reward} in this category.</CardBody>
          <CardFooter>
            <Button>Apply</Button>
            <Button variant="ghost">Already have it</Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
