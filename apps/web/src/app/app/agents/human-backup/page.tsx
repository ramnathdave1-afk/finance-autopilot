"use client";
import { useState, useTransition } from "react";
import { Badge, Button, Card, CardBody, CardFooter, CardTitle, Input, Label } from "@fa/ui";
import { dispatchAction } from "@/app/actions/agents";

export default function HumanBackupPage() {
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    start(async () => {
      const res = await dispatchAction({
        agentId: "human_backup",
        agentType: "credit_card_optimizer",
        actionType: "human_request",
        target: topic
      });
      if (!res.ok) {
        setErr(res.error ?? "Could not send");
        return;
      }
      setSent(true);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Badge tone="accent" className="mb-2">Premium</Badge>
        <h1 className="text-h1 mb-1">Human backup</h1>
        <p className="text-small text-fg-muted">
          If any agent fails or refuses, a real human takes over within 24 hours. No script. No queue.
        </p>
      </div>

      <Card>
        {sent ? (
          <>
            <CardTitle>Request received.</CardTitle>
            <CardBody className="mt-2">A team member will reach out within 24 hours at the email on file.</CardBody>
          </>
        ) : (
          <>
            <CardTitle>What do you need help with?</CardTitle>
            <CardBody className="mt-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="topic">Topic</Label>
                  <Input id="topic" placeholder="Agent failed to cancel… / Help with a refund…" value={topic} onChange={(e) => setTopic(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="details">Details</Label>
                  <textarea
                    id="details"
                    className="h-32 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-body text-fg placeholder:text-fg-subtle focus-ring resize-none"
                    placeholder="Anything specific we should know."
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                  />
                </div>
              </div>
            </CardBody>
            {err && <p className="mt-2 text-small text-danger" role="alert">{err}</p>}
            <CardFooter>
              <Button onClick={submit} disabled={!topic || pending}>{pending ? "Sending…" : "Send"}</Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
