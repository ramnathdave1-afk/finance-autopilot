"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@fa/ui";
import { createClient } from "@/lib/supabase/client";

export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="container py-24 max-w-md">
      <Card>
        <h1 className="text-h1 mb-2">Reset password</h1>
        <p className="text-small text-fg-muted mb-6">We'll email you a reset link.</p>
        {sent ? (
          <p className="text-body text-fg">Check your inbox for the reset link.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && <p className="text-small text-danger" role="alert">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Sending…" : "Send reset link"}</Button>
          </form>
        )}
        <p className="mt-6 text-small text-fg-muted">
          <Link href="/auth/login" className="hover:text-fg">Back to sign in</Link>
        </p>
      </Card>
    </main>
  );
}
