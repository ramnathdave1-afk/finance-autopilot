import Link from "next/link";
import { Button, Card } from "@fa/ui";
import { StepBar } from "@/components/step-bar";

// First-agent-demo stub — Terminal 4 swaps in real Subscription Killer scan.
export default function DemoStep() {
  return (
    <>
      <StepBar step={5} total={5} />
      <Card>
        <h1 className="text-h1 mb-2">Want me to scan for subscriptions you're not using?</h1>
        <p className="text-body text-fg-muted mb-6">Takes about 60 seconds.</p>
        <div className="flex gap-2">
          <Link href="/app" className="flex-1"><Button className="w-full">Scan now</Button></Link>
          <Link href="/app" className="flex-1"><Button variant="ghost" className="w-full">Maybe later</Button></Link>
        </div>
      </Card>
    </>
  );
}
