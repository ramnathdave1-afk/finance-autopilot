import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

// Regression test for the Twilio-behind-a-proxy signature bug: Twilio signs its
// HMAC over the PUBLIC callback URL (TWILIO_VOICE_TWIML_URL) it was configured
// with, including the query string placeCall appended — NOT the internal,
// proxied req.url Vercel hands the route. The route must validate against the
// configured public URL, not req.url, or every real call 403s in production.

vi.mock("server-only", () => ({}));

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
