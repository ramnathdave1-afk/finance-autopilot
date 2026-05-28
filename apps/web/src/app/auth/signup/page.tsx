"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@fa/ui";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="container py-24 max-w-md">
      <Card>
        <h1 className="text-h1 mb-2">Create your account</h1>
        <p className="text-small text-fg-muted mb-6">Lock founder pricing — first 100 get $9.99/mo forever.</p>
        {sent ? (
          <p className="text-body text-fg">Check your email to confirm.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-small text-danger" role="alert">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Creating…" : "Create account"}</Button>
          </form>
        )}
        <p className="mt-6 text-small text-fg-muted">
          Already have one? <Link href="/auth/login" className="text-accent hover:brightness-110">Sign in</Link>
        </p>
      </Card>
    </main>
  );
}
