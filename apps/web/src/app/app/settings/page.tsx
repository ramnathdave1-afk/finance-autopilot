"use client";
import { useState } from "react";
import { Button, Card, CardTitle, CardBody, CardFooter } from "@fa/ui";

export default function SettingsPage() {
  const [cancelled, setCancelled] = useState(false);
  async function cancelSubscription() {
    // One-click cancel — anti-Cleo. T5 wires this to Stripe.
    await fetch("/api/billing/cancel", { method: "POST" }).catch(() => {});
    setCancelled(true);
  }
  return (
    <div className="space-y-6">
      <h1 className="text-h1">Settings</h1>

      <Card>
        <CardTitle>Account</CardTitle>
        <CardBody className="mt-2">Manage your email, password, and security.</CardBody>
      </Card>

      <Card>
        <CardTitle>Privacy & data</CardTitle>
        <CardBody className="mt-2">Export or delete all your data anytime.</CardBody>
      </Card>

      <Card>
        <CardTitle>Subscription</CardTitle>
        <CardBody className="mt-2">
          {cancelled
            ? "Cancelled. You'll keep access until the end of the billing period."
            : "One tap. No retention flow. No 'are you sure' cascade."}
        </CardBody>
        {!cancelled && (
          <CardFooter>
            <Button variant="danger" onClick={cancelSubscription}>Cancel subscription</Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
