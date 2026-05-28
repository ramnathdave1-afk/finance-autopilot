import Link from "next/link";
import { Button, Card } from "@fa/ui";
import { StepBar } from "@/components/step-bar";

// Plaid handoff stub — Terminal 2 wires the real Plaid Link token here.
export default function ConnectStep() {
  return (
    <>
      <StepBar step={3} total={5} />
      <Card>
        <h1 className="text-h1 mb-2">Connect your bank.</h1>
        <p className="text-body text-fg-muted mb-6">
          Read-only. Encrypted. You can disconnect any time. We never see your password.
        </p>
        <div className="rounded-md border border-dashed border-border-strong p-6 text-center text-fg-muted mb-6">
          Plaid Link mounts here.
          <div className="text-small mt-1">(Terminal 2: replace with real Plaid Link token + handler.)</div>
        </div>
        <div className="flex gap-2">
          <Link href="/onboarding/goals" className="flex-1"><Button variant="ghost" className="w-full">Back</Button></Link>
          <Link href="/onboarding/tier" className="flex-1"><Button className="w-full">Skip for now</Button></Link>
        </div>
      </Card>
    </>
  );
}
