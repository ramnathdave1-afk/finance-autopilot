"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle, Input, Label, VoicePlayer } from "@fa/ui";
import { approveActionAction, dispatchAction, getActionStatus } from "@/app/actions/agents";
import { createBillForNegotiation } from "@/app/actions/bills";

type Status = "idle" | "authorize" | "calling" | "complete" | "failed";

const POLL_INTERVAL_MS = 4000;

export default function BillNegotiation() {
  const [provider, setProvider] = useState("");
  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [roi, setRoi] = useState<number | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll the dispatched action's real status while the call is in flight. The
  // voice agent (T4) drives the agent_action row to a terminal state and writes
  // bill_negotiations.voice_recording_url; we reflect exactly what the backend
  // reports — no simulated completion.
  useEffect(() => {
    if (status !== "calling" || !actionId) return;
    let cancelled = false;
    async function poll() {
      const res = await getActionStatus(actionId as string);
      if (cancelled) return;
      if (res.status === "succeeded") {
        setRoi(res.roi);
        setRecordingUrl(res.voiceRecordingUrl ?? null);
        setStatus("complete");
      } else if (res.status === "failed" || res.status === "escalated" || res.status === "cancelled") {
        setErr("The negotiation could not be completed. We'll review and follow up.");
        setStatus("failed");
      }
    }
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    void poll();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, actionId]);

  function authorize() {
    setErr(null);
    start(async () => {
      // 1. Resolve a real bill row + provider support line. The agent dials
      // input.providerPhone and reads input.billId — neither is a free-text
      // field, so we create the bill and look up the support number first.
      const bill = await createBillForNegotiation({
        provider,
        currentAmount: Number(current),
      });
      if (!bill.ok || !bill.billId || !bill.providerPhone) {
        setErr(bill.error ?? "Could not prepare this bill for negotiation");
        setStatus("failed");
        return;
      }

      // 2. Dispatch with the EXACT field names BillNegotiationInput expects:
      // { billId, providerPhone, targetAmount }. requiresApproval:true is the
      // authorization gate for a real outbound call — the row lands
      // awaiting_approval and does NOT run until we approve it below.
      const res = await dispatchAction({
        agentType: "bill_negotiation",
        actionType: "negotiate",
        target: provider,
        requiresApproval: true,
        input: {
          billId: bill.billId,
          providerPhone: bill.providerPhone,
          targetAmount: Number(target),
        },
      });
      if (!res.ok || !res.actionId) {
        setErr(res.error ?? "Could not start negotiation");
        setStatus("failed");
        return;
      }

      // 3. The user just authorized the call — approve the row, which emits the
      // ROUTER_EVENT so the agent actually runs. Without this the row sits in
      // awaiting_approval forever and the call never happens.
      const approved = await approveActionAction(res.actionId);
      if (!approved.ok) {
        setErr(approved.error ?? "Could not authorize the call");
        setStatus("failed");
        return;
      }

      setActionId(res.actionId);
      // Poll agent_actions for the terminal status + recording — never fake a
      // completion.
      setStatus("calling");
    });
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
            <Button onClick={() => setStatus("authorize")} disabled={!provider || !current || !target}>Continue</Button>
          </CardFooter>
        </Card>
      )}

      {status === "authorize" && (
        <Card>
          <CardTitle>Authorize the call</CardTitle>
          <CardBody className="mt-2">
            I&apos;ll call {provider} and try to reduce ${current}/mo to ${target}/mo. Estimated savings: ${Number(current) - Number(target)}/mo.
          </CardBody>
          {err && <p className="mt-2 text-small text-danger" role="alert">{err}</p>}
          <CardFooter>
            <Button onClick={authorize} disabled={pending}>{pending ? "Authorizing…" : "Authorize"}</Button>
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
            <Badge tone="accent">
              {roi != null ? `Saved $${roi.toFixed(0)}/yr` : "Negotiation complete"}
            </Badge>
          </CardHeader>
          <CardTitle>Done with {provider}.</CardTitle>
          <CardBody className="mt-2">
            {recordingUrl
              ? "Full call recording below. Listen, or share with PII masked."
              : "The call wrapped up. A recording will appear here once it finishes processing."}
          </CardBody>
          {recordingUrl && (
            <div className="mt-4">
              <VoicePlayer
                src={recordingUrl}
                transcript={`Call with ${provider} — transcript available with PII masked.`}
                shareable
              />
            </div>
          )}
          <CardFooter>
            <Button onClick={() => { setActionId(null); setRoi(null); setRecordingUrl(null); setStatus("idle"); }}>Negotiate another</Button>
          </CardFooter>
        </Card>
      )}

      {status === "failed" && (
        <Card>
          <CardTitle>Could not start the call</CardTitle>
          <CardBody className="mt-2 text-small text-danger">{err}</CardBody>
          <CardFooter>
            <Button onClick={() => { setErr(null); setStatus("authorize"); }}>Try again</Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
