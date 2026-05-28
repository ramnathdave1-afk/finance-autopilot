"use client";
import { useState, useTransition } from "react";
import { Button, Card, CardBody, CardFooter, CardTitle, Input, Label, Switch } from "@fa/ui";
import { saveNotificationPrefs } from "@/app/actions/notifications";

export default function NotificationsPage() {
  const [voice, setVoice] = useState(false);
  const [time, setTime] = useState("07:00");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    setSaved(false);
    start(async () => {
      const res = await saveNotificationPrefs({
        voice_briefing_enabled: voice,
        briefing_time_local: time
      });
      if (!res.ok) {
        setErr(res.error ?? "Could not save");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h1 mb-1">Notifications</h1>
        <p className="text-small text-fg-muted">When and how Pilot reaches out. Critical alerts always come through.</p>
      </div>

      <Card>
        <CardTitle>Daily briefing</CardTitle>
        <CardBody className="mt-2">
          One push per day with yesterday&apos;s spend, today&apos;s outlook, and any actions waiting on you.
        </CardBody>
        <div className="mt-6 grid gap-4">
          <div className="flex items-center justify-between rounded-md border border-border bg-bg p-3">
            <div>
              <div className="text-body">Voice memo</div>
              <div className="text-small text-fg-muted">Hear it instead of reading it.</div>
            </div>
            <Switch checked={voice} onCheckedChange={setVoice} label="Voice briefing" />
          </div>
          <div>
            <Label htmlFor="time">Delivery time (local)</Label>
            <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        {err && <p className="mt-2 text-small text-danger" role="alert">{err}</p>}
        {saved && !err && <p className="mt-2 text-small text-accent">Saved.</p>}
        <CardFooter>
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardTitle>Channels</CardTitle>
        <CardBody className="mt-2">
          Push notifications and email are on by default. Critical alerts (suspicious charge, agent failure, bill due) always send.
        </CardBody>
      </Card>
    </div>
  );
}
