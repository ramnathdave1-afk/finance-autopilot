"use client";
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Button } from "@fa/ui";

interface Props {
  onConnected?: () => void;
}

export function PlaidLinkButton({ onConnected }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/plaid/link-token", { method: "POST" })
      .then((r) => r.json())
      .then((d) => { if (alive) setLinkToken(d.link_token); })
      .catch(() => { if (alive) setErr("Could not start Plaid"); });
    return () => { alive = false; };
  }, []);

  const onSuccess = useCallback(async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicToken,
          institutionId: metadata.institution?.institution_id ?? null,
          institutionName: metadata.institution?.name ?? null
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data?.error ?? "Could not link account");
        return;
      }
      onConnected?.();
    } finally {
      setBusy(false);
    }
  }, [onConnected]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess
  });

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={() => open()}
        disabled={!ready || !linkToken || busy}
        className="w-full"
      >
        {busy ? "Linking…" : "Connect bank with Plaid"}
      </Button>
      {err && <span className="text-small text-danger" role="alert">{err}</span>}
    </div>
  );
}
