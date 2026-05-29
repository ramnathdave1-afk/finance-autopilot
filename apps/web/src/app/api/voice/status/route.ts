// Twilio call status-callback webhook (PRD §8.3, Agent 7 — Bill Negotiation).
//
// Twilio POSTs here as the negotiation call moves through its lifecycle
// (initiated → ringing → in-progress → completed | busy | no-answer | failed |
// canceled). We correlate on CallSid → the bill_negotiations row, mirror the
// provider's status onto the row, and append an audit step to the linked
// agent_action so the trail in agent_actions.audit_log stays complete.
//
// Mirrors the stripe/plaid webhook routes:
//   - nodejs runtime + force-dynamic (raw body, real Node).
//   - validate the Twilio signature (TWILIO_AUTH_TOKEN) before writing; degrade
//     gracefully when unset in dev.
//   - ALWAYS return 200 (even on internal errors) so Twilio doesn't retry-storm.
//     Forged-signature requests get a 403.

import { NextResponse } from "next/server";
import { createServiceClient, logStep } from "@fa/db";
import {
  validateTwilioSignature,
  isTerminalStatus,
  isConnectedCompletion,
  type CallStatusValue,
} from "@fa/twilio";
import type { BillNegotiationStatus } from "@fa/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Twilio CallStatus → our bill_negotiations status. We only WRITE a status for
// transitions the row should reflect; intermediate ('initiated'/'ringing') keep
// the row in 'calling'. We never write 'succeeded'/'no_savings' here — those are
// outcome decisions the agent makes after analyzing the transcript. A
// non-connected terminal status (busy/failed/...) marks the row 'failed'.
function mapNegotiationStatus(callStatus: string): BillNegotiationStatus | null {
  switch (callStatus as CallStatusValue) {
    case "in-progress":
      return "negotiating";
    case "busy":
    case "no-answer":
    case "failed":
    case "canceled":
      return "failed";
    // 'completed' is intentionally NOT mapped: the agent owns the
    // succeeded/no_savings decision after reading the transcript.
    default:
      return null;
  }
}

// Reconstruct the URL Twilio actually signed. Twilio computes its HMAC over the
// public callback URL we configured it with (TWILIO_VOICE_STATUS_CALLBACK_URL),
// which on Vercel differs from the internal, proxied req.url. Prefer the
// configured public URL; otherwise rebuild it from the proxy's forwarded
// scheme/host headers; only fall back to req.url when neither is available.
function signedCallbackUrl(req: Request): string {
  const configured = process.env.TWILIO_VOICE_STATUS_CALLBACK_URL;
  if (configured && configured.trim().length > 0) return configured.trim();

  const fwdProto = req.headers.get("x-forwarded-proto");
  const fwdHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (fwdProto && fwdHost) {
    const { pathname, search } = new URL(req.url);
    return `${fwdProto}://${fwdHost}${pathname}${search}`;
  }
  return req.url;
}

export async function POST(req: Request): Promise<NextResponse> {
  // Always 200 so Twilio doesn't retry-storm; surface outcome in the body.
  try {
    const raw = await req.text();
    const form = new URLSearchParams(raw);
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) params[k] = v;

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken) {
      const signature = req.headers.get("x-twilio-signature");
      // Twilio signs the HMAC over the EXACT public callback URL it was
      // configured with, NOT the (proxied) req.url Vercel hands us — those
      // differ in scheme/host/path behind the edge, so trusting req.url 403s
      // every legitimate callback in prod. Prefer the configured public URL.
      const signedUrl = signedCallbackUrl(req);
      const ok = validateTwilioSignature({ authToken, signature, url: signedUrl, params });
      if (!ok) {
        // Forged or misconfigured — refuse to write. 403 (not a retryable 5xx).
        return NextResponse.json({ ok: false, reason: "invalid_signature" }, { status: 403 });
      }
    }

    const callSid = params["CallSid"];
    const callStatus = params["CallStatus"];
    if (!callSid || !callStatus) {
      return NextResponse.json({ ok: false, reason: "missing_call_fields" }, { status: 200 });
    }

    const supabase = createServiceClient();
    const { data: neg, error } = await supabase
      .from("bill_negotiations")
      .select("id, agent_action_id, status")
      .eq("call_sid", callSid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error(`[voice-status] lookup_error tag=${error.code ?? "db"}`);
      return NextResponse.json({ ok: false, reason: "lookup_error" }, { status: 200 });
    }
    if (!neg) {
      // Unknown call (e.g. status arrived before the row persisted, or a stale
      // callback). Acknowledge without writing.
      return NextResponse.json({ ok: true, matched: false }, { status: 200 });
    }

    const row = neg as { id: string; agent_action_id: string | null; status: BillNegotiationStatus };
    const terminal = isTerminalStatus(callStatus as CallStatusValue);
    const connected = isConnectedCompletion(callStatus as CallStatusValue);
    const nextStatus = mapNegotiationStatus(callStatus);

    // Build the row patch. Stamp call_ended_at + duration on any terminal event.
    const patch: Record<string, unknown> = {};
    // Do NOT overwrite a status the agent already finalized
    // (succeeded/no_savings). Only advance failure/in-progress states.
    const finalized = row.status === "succeeded" || row.status === "no_savings";
    if (nextStatus && !finalized) patch.status = nextStatus;
    if (terminal) {
      patch.call_ended_at = new Date().toISOString();
      const durRaw = params["CallDuration"] ?? params["DialCallDuration"];
      if (durRaw && /^\d+$/.test(durRaw)) patch.call_duration_seconds = Number(durRaw);
    }
    const recordingUrl = params["RecordingUrl"];
    if (recordingUrl) patch.voice_recording_url = recordingUrl;

    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabase
        .from("bill_negotiations")
        .update(patch)
        .eq("id", row.id);
      if (updErr) {
        console.error(`[voice-status] update_error tag=${updErr.code ?? "db"}`);
        return NextResponse.json({ ok: false, reason: "update_error" }, { status: 200 });
      }
    }

    // Append an audit step to the linked agent_action so the trail is complete.
    if (row.agent_action_id) {
      await logStep(row.agent_action_id, {
        step: `voice:call_status:${callStatus}`,
        ok: !terminal || connected,
        detail: {
          callSid,
          callStatus,
          negotiationId: row.id,
          ...(patch.call_duration_seconds !== undefined
            ? { durationSeconds: patch.call_duration_seconds }
            : {}),
        },
      });
    }

    return NextResponse.json({ ok: true, matched: true, negotiationId: row.id, callStatus });
  } catch (e) {
    const tag = e instanceof Error ? e.name : "Unknown";
    console.error(`[voice-status] dispatch_error tag=${tag}`);
    return NextResponse.json({ ok: false, reason: "dispatch_error" }, { status: 200 });
  }
}
