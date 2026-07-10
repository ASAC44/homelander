import { Hono } from "hono";
import { verifySlackRequest } from "../slack/verify.js";
import { handleEvent, type SlackEventPayload } from "../slack/events.js";

const slackEvents = new Hono();

// Raw body needed for Slack signature verification
slackEvents.post("/events", async (c) => {
  const body = await c.req.text();

  let payload: SlackEventPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return c.text("Invalid JSON", 400);
  }

  // URL verification challenge does not include a signature — handle it first.
  if (payload.type === "url_verification") {
    return c.text(payload.challenge ?? "");
  }

  const verified = await verifySlackRequest(body, {
    "x-slack-request-timestamp": c.req.header("x-slack-request-timestamp") || "",
    "x-slack-signature": c.req.header("x-slack-signature") || "",
  });

  if (!verified) {
    console.warn("[slack] Invalid signature");
    return c.text("Invalid signature", 401);
  }

  const requestUrl = new URL(c.req.url);
  const publicBaseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
  const result = await handleEvent(payload, { publicBaseUrl });

  if (typeof result.body === "string") {
    return c.text(result.body, result.status as 200 | 400 | 401);
  }
  return c.json(result.body, result.status as 200 | 400 | 401);
});

export { slackEvents };
