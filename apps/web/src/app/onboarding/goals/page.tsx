"use client";
import Link from "next/link";
import { Button, Card, Input, Label } from "@fa/ui";
import { StepBar } from "@/components/step-bar";

export default function GoalsStep() {
  return (
    <>
      <StepBar step={2} total={5} />
      <Card>
        <h1 className="text-h1 mb-2">Set 1–3 goals.</h1>
        <p className="text-body text-fg-muted mb-6">Your agents will route money toward them.</p>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_140px] gap-2">
              <div>
                <Label htmlFor={`goal-${i}`}>Goal {i}</Label>
                <Input id={`goal-${i}`} placeholder="Emergency fund" />
              </div>
              <div>
                <Label htmlFor={`amt-${i}`}>Amount</Label>
                <Input id={`amt-${i}`} type="number" placeholder="10000" />
              </div>
              <div>
                <Label htmlFor={`by-${i}`}>By</Label>
                <Input id={`by-${i}`} type="month" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-2">
          <Link href="/onboarding" className="flex-1"><Button variant="ghost" className="w-full">Back</Button></Link>
          <Link href="/onboarding/connect" className="flex-1"><Button className="w-full">Continue</Button></Link>
        </div>
      </Card>
    </>
  );
}
