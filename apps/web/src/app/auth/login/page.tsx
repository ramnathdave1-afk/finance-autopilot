"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@fa/ui";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else window.location.assign("/app");
  }

  return (
    <main className="container py-24 max-w-md">
      <Card>
        <h1 className="text-h1 mb-2">Sign in</h1>
        <p className="text-small text-fg-muted mb-6">Welcome back.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-small text-danger" role="alert">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
        <div className="mt-6 flex justify-between text-small text-fg-muted">
          <Link href="/auth/magic" className="hover:text-fg">Use magic link</Link>
          <Link href="/auth/reset" className="hover:text-fg">Forgot password?</Link>
        </div>
        <p className="mt-4 text-small text-fg-muted">
          No account? <Link href="/auth/signup" className="text-accent hover:brightness-110">Sign up</Link>
        </p>
      </Card>
    </main>
  );
}
