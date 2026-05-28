"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@fa/ui";
import { StepBar } from "@/components/step-bar";
import { saveGoalsAction } from "@/app/actions/goals";

type Row = { name: string; amount: string; date: string };

export default function GoalsStep() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([
    { name: "", amount: "", date: "" },
    { name: "", amount: "", date: "" },
    { name: "", amount: "", date: "" }
  ]);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  }

  function next() {
    setErr(null);
    start(async () => {
      const res = await saveGoalsAction(
        rows.map((r) => ({
          name: r.name.trim(),
          targetAmount: Number(r.amount) || 0,
          targetDate: r.date || null
        }))
      );
      if (!res.ok) {
        setErr(res.error ?? "Could not save");
        return;
      }
      router.push("/onboarding/connect");
    });
  }

  return (
    <>
      <StepBar step={2} total={5} />
      <Card>
        <h1 className="text-h1 mb-2">Set 1–3 goals.</h1>
        <p className="text-body text-fg-muted mb-6">Your agents will route money toward them.</p>
        <div className="space-y-4">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_140px] gap-2">
              <div>
                <Label htmlFor={`goal-${i}`}>Goal {i + 1}</Label>
                <Input id={`goal-${i}`} placeholder="Emergency fund" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`amt-${i}`}>Amount</Label>
                <Input id={`amt-${i}`} type="number" placeholder="10000" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`by-${i}`}>By</Label>
                <Input id={`by-${i}`} type="month" value={r.date} onChange={(e) => update(i, { date: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
        {err && <p className="mt-2 text-small text-danger" role="alert">{err}</p>}
        <div className="mt-8 flex gap-2">
          <Link href="/onboarding" className="flex-1"><Button variant="ghost" className="w-full">Back</Button></Link>
          <Button className="flex-1" onClick={next} disabled={pending}>{pending ? "Saving…" : "Continue"}</Button>
        </div>
      </Card>
    </>
  );
}
