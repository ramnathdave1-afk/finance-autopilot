"use client";
import { useState } from "react";
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle, Input, Label, VoicePlayer } from "@fa/ui";

type Status = "idle" | "submitted" | "authorizing" | "calling" | "complete" | "failed";

export default function BillNegotiation() {
  const [provider, setProvider] = useState("");
  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  function submit() {
    setStatus("submitted");
    setTimeout(() => setStatus("authorizing"), 600);
  }

  function authorize() {
    setStatus("calling");
    // Background: T4/T5 wire to Twilio voice agent. Status updates flow back via Inngest events.
    setTimeout(() => setStatus("complete"), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <Badge tone="accent" className="mb-2">Pro</Badge>
        <h1 className="text-h1 mb-1">Negotiate a bill</h1>
        <p className="text-small text-fg-muted">
          AI calls the company, navigates the phone tree, talks to a rep, and reports back with a recording.
        </p>
      </div>

      {status === "idle" && (
        <Card>
          <CardTitle>Which bill?</CardTitle>
          <CardBody className="mt-4">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="provider">Provider</Label>
                <Input id="provider" placeholder="Comcast / Verizon / GEICO…" value={provider} onChange={(e) => setProvider(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="current">Current $/mo</Label>
                  <Input id="current" type="number" value={current} onChange={(e) => setCurrent(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="target">Target $/mo</Label>
                  <Input id="target" type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
                </div>
              </div>
              <div>
                <Label htmlFor="bill">Upload bill (photo or PDF)</Label>
                <Input id="bill" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {file && <p className="mt-1 text-small text-fg-muted">{file.name}</p>}
              </div>
            </div>
          </CardBody>
          <CardFooter>
            <Button onClick={submit} disabled={!provider || !current || !target}>Continue</Button>
          </CardFooter>
        </Card>
      )}

      {status === "submitted" && (
        <Card><CardTitle>Preparing call script…</CardTitle><CardBody className="mt-2 text-small">Reviewing your bill and tailoring the negotiation strategy.</CardBody></Card>
      )}

      {status === "authorizing" && (
        <Card>
          <CardTitle>Authorize the call</CardTitle>
          <CardBody className="mt-2">
            I&apos;ll call {provider} and try to reduce ${current}/mo to ${target}/mo. Estimated savings: ${Number(current) - Number(target)}/mo.
          </CardBody>
          <CardFooter>
            <Button onClick={authorize}>Authorize</Button>
            <Button variant="ghost" onClick={() => setStatus("idle")}>Cancel</Button>
          </CardFooter>
        </Card>
      )}

      {status === "calling" && (
        <Card>
          <CardHeader>
            <Badge tone="warn">Calling…</Badge>
          </CardHeader>
          <CardTitle>On the phone with {provider}</CardTitle>
          <CardBody className="mt-2 text-small">
            Calls typically take 3–10 minutes. We&apos;ll push you when it&apos;s done.
          </CardBody>
        </Card>
      )}

      {status === "complete" && (
        <Card>
          <CardHeader>
            <Badge tone="accent">Saved ${Number(current) - Number(target)}/mo</Badge>
          </CardHeader>
          <CardTitle>Done. New rate: ${target}/mo.</CardTitle>
          <CardBody className="mt-2">Full call recording below. Listen, or share with PII masked.</CardBody>
          <div className="mt-4">
            <VoicePlayer
              src="/audio/sample-negotiation.mp3"
              durationSec={247}
              transcript={`Agent: Hi, calling about my ${provider} account…\n[transcript continues — masked PII]`}
              shareable
            />
          </div>
          <CardFooter>
            <Button onClick={() => setStatus("idle")}>Negotiate another</Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
