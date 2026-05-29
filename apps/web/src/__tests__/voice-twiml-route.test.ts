import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

// Regression test for the Twilio-behind-a-proxy signature bug: Twilio signs its
// HMAC over the PUBLIC callback URL (TWILIO_VOICE_TWIML_URL) it was configured
// with, including the query string placeCall appended — NOT the internal,
// proxied req.url Vercel hands the route. The route must validate against the
// configured public URL, not req.url, or every real call 403s in production.

vi.mock("server-only", () => ({}));

// Script is looked up server-side by negotiationId — mock @fa/db so the route
// can resolve bill_negotiations.call_script without a live Supabase.
const scriptsById = new Map<string, string | null>();
vi.mock("@fa/db", () => ({
  createServiceClient: () => ({
    from(_table: string) {
      let id = "";
      const chain = {
        select: () => chain,
        eq: (_c: string, v: string) => {
          id = v;
          return chain;
        },
        maybeSingle: async () =>
          scriptsById.has(id)
            ? { data: { call_script: scriptsById.get(id) ?? null }, error: null }
            : { data: null, error: null },
      };
      return chain;
    },
  }),
}));

import { POST } from "@/app/api/voice/twiml/route";

const AUTH_TOKEN = "test_auth_token_123";
const PUBLIC_URL = "https://app.example.com/api/voice/twiml";
// Twilio fetches the configured Url WITH the query placeCall appended.
const QUERY = "?script=Hello%20there&negotiationId=neg_42";
const PUBLIC_SIGNED_URL = `${PUBLIC_URL}${QUERY}`;
// On Vercel the route sees an internal, proxied URL (different host/scheme).
const PROXIED_REQ_URL = `http://internal.vercel.app/api/voice/twiml${QUERY}`;

// Compute the X-Twilio-Signature exactly as Twilio does: HMAC-SHA1 of
// url + sorted(formKey+formValue), base64.
function twilioSignature(url: string, params: Record<string, string>): string {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  return createHmac("sha1", AUTH_TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");
}

function postReq(reqUrl: string, signature: string, params: Record<string, string>) {
  const body = new URLSearchParams(params).toString();
  return new Request(reqUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body,
  });
}

describe("POST /api/voice/twiml — signature validated against configured public URL", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    process.env.TWILIO_VOICE_TWIML_URL = PUBLIC_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts a signature computed over the public URL even when req.url is proxied", async () => {
    const params = { CallSid: "CA123", AccountSid: "AC123" };
    // Twilio signs against the PUBLIC url; the request arrives at a proxied url.
    const sig = twilioSignature(PUBLIC_SIGNED_URL, params);
    const res = await POST(postReq(PROXIED_REQ_URL, sig, params));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("<Response>");
    expect(xml).not.toContain("<Reject/>");
  });

  it("rejects a signature computed over the (wrong) proxied req.url", async () => {
    const params = { CallSid: "CA123", AccountSid: "AC123" };
    // A signature over the internal proxied url must NOT validate.
    const sig = twilioSignature(PROXIED_REQ_URL, params);
    const res = await POST(postReq(PROXIED_REQ_URL, sig, params));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/voice/twiml — script is looked up by negotiationId, never from the URL", () => {
  const ORIGINAL_ENV = { ...process.env };
  // Only negotiationId rides in the URL (placeCall no longer appends the script).
  const ID_QUERY = "?negotiationId=neg_42";
  const ID_SIGNED_URL = `${PUBLIC_URL}${ID_QUERY}`;
  const ID_REQ_URL = `http://internal.vercel.app/api/voice/twiml${ID_QUERY}`;

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    process.env.TWILIO_VOICE_TWIML_URL = PUBLIC_URL;
    scriptsById.clear();
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("voices the server-stored script resolved from bill_negotiations.call_script", async () => {
    scriptsById.set("neg_42", "Hi, I'd like to lower my Comcast bill.");
    const params = { CallSid: "CA123", AccountSid: "AC123" };
    const sig = twilioSignature(ID_SIGNED_URL, params);
    const res = await POST(postReq(ID_REQ_URL, sig, params));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("Hi, I&apos;d like to lower my Comcast bill.");
    expect(xml).toContain("<Say");
  });

  it("falls back to the safe generic line when the id resolves to no script", async () => {
    // Unknown / unset call_script → buildNegotiationTwiml's safe default, never
    // invalid TwiML.
    const params = { CallSid: "CA123", AccountSid: "AC123" };
    const sig = twilioSignature(ID_SIGNED_URL, params);
    const res = await POST(postReq(ID_REQ_URL, sig, params));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("connect me with billing");
  });
});
