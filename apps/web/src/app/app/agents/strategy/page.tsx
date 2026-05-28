import { Badge, Button, Card, CardBody, CardFooter, CardTitle, Sparkline } from "@fa/ui";

const trajectory = [
  24310, 26100, 28200, 30800, 33500, 36900, 40200, 44100, 48800, 53200,
  58000, 63100, 69400, 75600, 82900, 90100, 98000, 106400, 115300, 125000
];

export default function StrategyPage() {
  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Premium</Badge>
        <h1 className="text-h1 mb-1">Net worth strategy</h1>
        <p className="text-small text-fg-muted">
          At your current trajectory you hit $100K by Mar 2028. Here&apos;s how to hit $250K by 2030.
        </p>
      </div>

      <Card>
        <CardTitle>Projected trajectory</CardTitle>
        <CardBody className="mt-2">Based on your savings rate, expected income, and market assumptions (real returns).</CardBody>
        <div className="mt-4"><Sparkline values={trajectory} /></div>
      </Card>

      <Card>
        <CardTitle>Levers</CardTitle>
        <ul className="mt-3 space-y-2 text-body">
          <li className="rounded-md border border-border bg-bg p-3">+5% savings rate → $250K eight months earlier</li>
          <li className="rounded-md border border-border bg-bg p-3">Max Roth IRA → +$31K by 2030 from tax-free compounding</li>
          <li className="rounded-md border border-border bg-bg p-3">Shift 5% from bonds to global equity → +$18K projected</li>
        </ul>
        <CardFooter>
          <Button>Run scenarios</Button>
          <Button variant="ghost">Talk to advisor</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
