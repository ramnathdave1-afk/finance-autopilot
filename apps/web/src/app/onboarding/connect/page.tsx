"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@fa/ui";
import { StepBar } from "@/components/step-bar";
import { PlaidLinkButton } from "@/components/plaid-link";

export default function ConnectStep() {
  const router = useRouter();
  return (
    <>
      <StepBar step={3} total={5} />
      <Card>
        <h1 className="text-h1 mb-2">Connect your bank.</h1>
        <p className="text-body text-fg-muted mb-6">
          Read-only. Encrypted. You can disconnect any time. We never see your password.
        </p>
        <PlaidLinkButton onConnected={() => router.push("/onboarding/tier")} />
        <div className="mt-6 flex gap-2">
          <Link href="/onboarding/goals" className="flex-1"><Button variant="ghost" className="w-full">Back</Button></Link>
          <Link href="/onboarding/tier" className="flex-1"><Button variant="ghost" className="w-full">Skip for now</Button></Link>
        </div>
      </Card>
    </>
  );
}
