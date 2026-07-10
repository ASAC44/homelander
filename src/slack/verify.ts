import { env } from "../config.js";

// https://api.slack.com/authentication/verifying-requests-from-slack
// Uses constant-time comparison to prevent timing attacks.

async function hmacSha256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifySlackRequest(
  body: string,
  headers: Record<string, string | string[]>,
): Promise<boolean> {
  const secret = env.SLACK_SIGNING_SECRET;
  if (!secret) return false;

  const timestamp = typeof headers["x-slack-request-timestamp"] === "string"
    ? headers["x-slack-request-timestamp"]
    : Array.isArray(headers["x-slack-request-timestamp"])
      ? headers["x-slack-request-timestamp"][0]
      : "";
  const signature = typeof headers["x-slack-signature"] === "string"
    ? headers["x-slack-signature"]
    : Array.isArray(headers["x-slack-signature"])
      ? headers["x-slack-signature"][0]
      : "";

  if (!timestamp || !signature) return false;

  // Reject requests older than 5 minutes to prevent replay attacks.
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const base = `v0:${timestamp}:${body}`;
  const expected = `v0=${await hmacSha256(secret, base)}`;
  return constantTimeEq(signature, expected);
}
