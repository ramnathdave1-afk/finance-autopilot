// Sentry error tracking (PRD §19) — server-side capture wrapper.
//
// In-house thin client so the dep graph stays small. Adds @sentry/nextjs
// as a follow-up if/when we want auto-instrumented spans + tracing; this
// gives us the critical-path signal (uncaught + manually-captured errors)
// in the meantime.
//
// Env-gated: when SENTRY_DSN is unset, every call is a no-op. Production
// reads DSN from env and POSTs to Sentry's `store` endpoint.

type SentryLevel = "fatal" | "error" | "warning" | "info" | "debug";

const DSN = process.env.SENTRY_DSN;

interface ParsedDsn {
  protocol: string;
  publicKey: string;
  host: string;
  projectId: string;
}

let parsedCache: ParsedDsn | null | undefined;

function parseDsn(): ParsedDsn | null {
  if (parsedCache !== undefined) return parsedCache;
  if (!DSN) {
    parsedCache = null;
    return null;
  }
  try {
    const u = new URL(DSN);
    parsedCache = {
      protocol: u.protocol.replace(":", ""),
      publicKey: u.username,
      host: u.host,
      projectId: u.pathname.replace(/^\//, ""),
    };
  } catch {
    parsedCache = null;
  }
  return parsedCache;
}

export interface CaptureOptions {
  level?: SentryLevel;
  tags?: Record<string, string>;
  user?: { id?: string; email?: string };
  /** Arbitrary key-value context attached to the event. */
  extra?: Record<string, unknown>;
}

/**
 * Capture an exception (or a plain string). Fire-and-forget; never throws.
 */
export async function captureError(
  err: unknown,
  opts: CaptureOptions = {},
): Promise<void> {
  const d = parseDsn();
  if (!d) return; // dev/test no-op

  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "captured");
  const payload = {
    event_id: cryptoRandomId(),
    timestamp: new Date().toISOString(),
    level: opts.level ?? "error",
    platform: "node",
    server_name: process.env.VERCEL_REGION ?? "local",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tags: opts.tags ?? {},
    user: opts.user,
    extra: opts.extra,
    exception: {
      values: [
        {
          type: e.name,
          value: e.message,
          stacktrace: e.stack ? parseStack(e.stack) : undefined,
        },
      ],
    },
  };

  const url = `${d.protocol}://${d.host}/api/${d.projectId}/store/`;
  const auth = [
    "Sentry sentry_version=7",
    "sentry_client=fa-web/0.1",
    `sentry_key=${d.publicKey}`,
  ].join(", ");

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": auth,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // intentional — Sentry failure must not surface.
  }
}

function parseStack(stack: string) {
  const frames = stack
    .split("\n")
    .slice(1)
    .map((line) => ({ filename: line.trim() }));
  return { frames };
}

function cryptoRandomId(): string {
  const arr = new Uint8Array(16);
  // crypto.getRandomValues is available on Node 19+; fallback for older.
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
