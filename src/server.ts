import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./config.js";
import { health } from "./routes/health.js";
import { analyze } from "./routes/analyze.js";
import { slackEvents } from "./routes/slack-events.js";
import { evidence } from "./routes/evidence.js";
import { reports } from "./routes/reports.js";
import { initStorage, cleanupExpiredEvidence } from "./report/storage.js";

const app = new Hono();

// Global error handler
app.onError((err, c) => {
  console.error("[server] Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Not-found handler
app.notFound((c) => c.json({ error: "Not found" }, 404));

app.route("/health", health);
app.route("/analyze", analyze);
app.route("/slack", slackEvents);
app.route("/evidence", evidence);
app.route("/reports", reports);

const server = serve({ fetch: app.fetch, port: env.PORT }, async (info) => {
  console.log(`[server] Listening on http://localhost:${info.port}`);
  console.log("[server] Routes: /health, /analyze, /slack/events, /evidence/:id, /reports/:slug/:file");

  // Initialize storage directories
  try {
    await initStorage();
    console.log(`[server] Report storage: ${env.REPORT_STORAGE_DIR}`);
    console.log(`[server] Evidence storage: ${env.EVIDENCE_STORAGE_DIR} (TTL: ${env.EVIDENCE_TTL_HOURS}h)`);

    // Clean expired evidence on startup
    const removed = await cleanupExpiredEvidence();
    if (removed > 0) console.log(`[server] Cleaned ${removed} expired evidence files`);
  } catch (err) {
    console.warn("[server] Storage init failed:", err);
  }

  if (!env.OPENAI_API_KEY) console.warn("[server] OPENAI_API_KEY not set — using fallback/heuristic data");
  if (!env.BRIGHTDATA_API_TOKEN) console.warn("[server] BRIGHTDATA_API_TOKEN not set — using mock search data");
  if (!env.SLACK_BOT_TOKEN) console.warn("[server] SLACK_BOT_TOKEN not set — Slack bot disabled");
  if (!env.SLACK_SIGNING_SECRET) console.warn("[server] SLACK_SIGNING_SECRET not set — Slack verification disabled");
  if (!env.PUBLIC_BASE_URL) console.warn("[server] PUBLIC_BASE_URL not set — deriving public evidence links from request host when possible");
});

// Graceful shutdown
const shutdown = () => {
  console.log("[server] Shutting down...");
  server.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
