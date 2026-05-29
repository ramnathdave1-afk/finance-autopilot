// Twilio Programmable Voice TwiML webhook (PRD §8.3, Agent 7 — Bill Negotiation).
//
// Twilio fetches this URL when the negotiation call connects. We return TwiML
// that voices the negotiation script the agent generated. The script is NOT
// passed in the URL (Twilio logs request URLs + URL length limits): @fa/twilio's
// placeCall appends only `negotiationId`, and we look the script up server-side
// from the bill_negotiations row (call_script) keyed by that id.
//
// Signature validation: Twilio signs voice webhooks with X-Twilio-Signature
// over the full URL + sorted form params. We validate when TWILIO_AUTH_TOKEN is
// set, and degrade gracefully (skip) in dev when it is unset so local TwiML
// previews work. We NEVER return invalid TwiML — buildNegotiationTwiml falls
// back to a safe generic line if the script is missing.

import { buildNegotiationTwiml, validateTwilioSignature } from "@fa/twilio";
import { createServiceClient } from "@fa/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TWIML_CONTENT_TYPE = "text/xml; charset=utf-8";

async function readParams(req: Request): Promise<{
  formParams: Record<string, string>;
  negotiationId: string | null;
  audioUrl: string | null;
}> {
  const url = new URL(req.url);
  // Twilio voice webhooks are POST application/x-www-form-urlencoded by default,
  // but the configured Url can also be fetched via GET. Support both.
  const formParams: Record<string, string> = {};
  if (req.method === "POST") {
    const raw = await req.text();
    const body = new URLSearchParams(raw);
    for (const [k, v] of body.entries()) formParams[k] = v;
  }
  // Only the correlation id rides in the URL (placeCall appends it; Twilio
  // preserves the configured Url's query params). The script is looked up
  // server-side by this id.
  const negotiationId =
    url.searchParams.get("negotiationId") ?? formParams["negotiationId"] ?? null;
  const audioUrl = url.searchParams.get("audioUrl") ?? null;
  return { formParams, negotiationId, audioUrl };
}

/**
 * Resolve the negotiation script for this call by looking up the
 * bill_negotiations row (call_script) keyed by negotiationId. Returns "" when
 * the id is missing/unknown or persistence is unavailable — buildNegotiationTwiml
 * then voices a safe generic line, so the call never receives invalid TwiML.
 */
async function lookupScript(negotiationId: string | null): Promise<string> {
  if (!negotiationId) return "";
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("bill_negotiations")
      .select("call_script")
      .eq("id", negotiationId)
      .maybeSingle();
    if (error || !data) return "";
    return (data as { call_script: string | null }).call_script ?? "";
  } catch {
    return "";
  }
}

function twimlResponse(xml: string, status = 200): Response {
  return new Response(xml, { status, headers: { "Content-Type": TWIML_CONTENT_TYPE } });
}

// Reconstruct the URL Twilio actually signed. Twilio signs its HMAC over the
// public TwiML Url it was configured with (TWILIO_VOICE_TWIML_URL) INCLUDING
// the query string placeCall appended (negotiationId/audioUrl) — not the
// internal proxied req.url Vercel hands us. Preserve the incoming query string
// (that's what Twilio echoes back and signs) and graft it onto the configured
// public origin+path; fall back to forwarded headers, then req.url.
function signedTwimlUrl(req: Request): string {
  const incoming = new URL(req.url);
  const query = incoming.search; // includes leading '?' (or '' if none)

  const configured = process.env.TWILIO_VOICE_TWIML_URL;
  if (configured && configured.trim().length > 0) {
    const base = new URL(configured.trim());
    return `${base.origin}${base.pathname}${query}`;
  }

  const fwdProto = req.headers.get("x-forwarded-proto");
  const fwdHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (fwdProto && fwdHost) {
    return `${fwdProto}://${fwdHost}${incoming.pathname}${query}`;
  }
  return req.url;
}

async function handle(req: Request): Promise<Response> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const { formParams, negotiationId, audioUrl } = await readParams(req);

  // Validate the Twilio signature when we have a token. Degrade gracefully in
  // dev (token unset) so local previews still render.
  if (authToken) {
    const signature = req.headers.get("x-twilio-signature");
    const ok = validateTwilioSignature({
      authToken,
      signature,
      url: signedTwimlUrl(req),
      params: formParams,
    });
    if (!ok) {
      // Reject with TwiML <Reject/> + 403 so a forged request can't drive a call.
      return twimlResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>`,
        403,
      );
    }
  }

  // Look the script up by negotiationId only AFTER the signature check passes,
  // so an unsigned/forged request can't probe the lookup.
  const script = await lookupScript(negotiationId);
  const xml = buildNegotiationTwiml({ script, audioUrl });
  return twimlResponse(xml);
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

// Twilio can be configured to GET the TwiML Url; support it (signature is only
// validated for POST form bodies — GET requests carry no signable form params).
export async function GET(req: Request): Promise<Response> {
  return handle(req);
}
