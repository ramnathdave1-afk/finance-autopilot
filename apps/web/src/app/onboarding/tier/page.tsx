import Link from "next/link";
import { Button, Card } from "@fa/ui";
import { StepBar } from "@/components/step-bar";

export default function TierStep() {
  return (
    <>
      <StepBar step={4} total={5} />
      <Card>
        <h1 className="text-h1 mb-2">Pick a plan.</h1>
        <p className="text-body text-fg-muted mb-6">7-day free trial. One-click cancel anytime.</p>
        <Link href="/paywall" className="block"><Button className="w-full mb-3">See plans</Button></Link>
        <Link href="/onboarding/demo" className="block"><Button variant="ghost" className="w-full">Try the free tier</Button></Link>
      </Card>
    </>
  );
}
