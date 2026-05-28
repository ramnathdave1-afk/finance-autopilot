"use client";
import Link from "next/link";
import { Button, Card } from "@fa/ui";
import { StepBar } from "@/components/step-bar";

const HELP = [
  "Cancel subscriptions",
  "Save more",
  "Negotiate bills",
  "Pay off debt",
  "Invest",
  "All of it"
];

export default function WelcomeStep() {
  return (
    <>
      <StepBar step={1} total={5} />
      <Card>
        <h1 className="text-h1 mb-2">Welcome.</h1>
        <p className="text-body text-fg-muted mb-6">What do you want help with?</p>
        <div className="grid grid-cols-2 gap-2 mb-8">
          {HELP.map((h) => (
            <label key={h} className="flex items-center gap-2 rounded-md border border-border bg-bg p-3 hover:border-border-strong cursor-pointer">
              <input type="checkbox" className="accent-accent" />
              <span className="text-body">{h}</span>
            </label>
          ))}
        </div>
        <Link href="/onboarding/goals"><Button className="w-full">Continue</Button></Link>
      </Card>
    </>
  );
}
