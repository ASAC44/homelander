import { env } from "../config.js";
import { WebClient } from "@slack/web-api";
import { intake } from "../lib/agents.js";
import { runAnalysis } from "../lib/orchestrator.js";
import { renderBlocks } from "./render.js";
import { buildReportModel } from "../report/model.js";
import { renderEvidence } from "../report/evidence.js";
import { renderReportWebPage } from "../report/web.js";
import { saveHtmlReport, saveEvidence, initStorage } from "../report/storage.js";

const bot = env.SLACK_BOT_TOKEN ? new WebClient(env.SLACK_BOT_TOKEN) : null;

// In-memory dedup with a 5-minute TTL.
const seenEvents = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000;

export function isDuplicate(eventId: string): boolean {
  const now = Date.now();
  if (seenEvents.has(eventId)) {
    const ts = seenEvents.get(eventId)!;
    if (now - ts < DEDUP_TTL_MS) return true;
  }
  seenEvents.set(eventId, now);
  // Periodic cleanup
  if (seenEvents.size > 1000) {
    for (const [id, ts] of seenEvents) {
      if (now - ts > DEDUP_TTL_MS) seenEvents.delete(id);
    }
  }
  return false;
}

export interface SlackEventPayload {
  token?: string;
  type: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type: string;
    subtype?: string;
    event_ts?: string;
    event_id?: string;
    user?: string;
    bot_id?: string;
    channel?: string;
    thread_ts?: string;
    text?: string;
  };
  event_id?: string;
  event_time?: number;
}

export interface EventResult {
  status: number;
  body: string | Record<string, unknown>;
}

export interface HandleEventOptions {
  publicBaseUrl?: string;
}

// Initialize storage on first use
let storageInit = false;

export async function handleEvent(
  payload: SlackEventPayload,
  opts?: HandleEventOptions,
): Promise<EventResult> {
  // Only handle event_callback
  if (payload.type !== "event_callback" || !payload.event) {
    return { status: 200, body: "ok" };
  }

  const event = payload.event;
  const eventId = event.event_id || payload.event_id || "";
  const eventTs = event.event_ts || "";

  // Dedup
  if (eventId && isDuplicate(eventId)) {
    return { status: 200, body: "ok" };
  }

  // Ignore bot messages and non-message events
  if (event.bot_id) return { status: 200, body: "ok" };
  if (event.subtype === "message_changed" || event.subtype === "message_deleted") {
    return { status: 200, body: "ok" };
  }

  // Determine if this is a DM or app mention
  const isAppMention = event.type === "app_mention";
  const isDm = event.type === "message" && event.channel?.startsWith("D");
  const isMessage = event.type === "message";

  if (!isAppMention && !isDm && !isMessage) {
    return { status: 200, body: "ok" };
  }

  // For non-DM, non-mention messages in channels, ignore
  if (isMessage && !isDm && !isAppMention) {
    return { status: 200, body: "ok" };
  }

  const userText = event.text || "";
  const channel = event.channel || "";
  const threadTs = event.thread_ts || eventTs;
  const user = event.user || "";

  if (!bot || !channel) {
    console.warn("[slack] Bot not configured or no channel");
    return { status: 200, body: "ok" };
  }

  // Strip @Transitra mention prefix for app_mention
  const cleanText = isAppMention ? userText.replace(/<@[A-Z0-9]+>/g, "").trim() : userText;

  if (!cleanText) {
    await bot.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "Hi! Send me your shipment details and I'll analyze routes, costs, customs, and risks. E.g.: \"We need to ship 10,000 metal office chairs from Shenzhen to Los Angeles by September.\"\n\n_Homelander is decision-support, not legal/customs/tax/freight-booking advice._",
    });
    return { status: 200, body: "ok" };
  }

  // Run intake
  let parsed;
  try {
    parsed = await intake(cleanText);
  } catch (err) {
    console.error("[slack] intake failed:", err);
    await bot.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "Sorry, I had trouble understanding that. Could you rephrase your shipment details?",
    });
    return { status: 200, body: "ok" };
  }

  if (!parsed.ready) {
    await bot.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: parsed.question || "Could you provide more details about the shipment?",
    });
    return { status: 200, body: "ok" };
  }

  // Acknowledge receipt and start analysis
  await bot.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Got it! Analyzing shipment of ${parsed.input.product} from ${parsed.input.origin} to ${parsed.input.destination}...`,
  });

  let analysisResult;
  try {
    analysisResult = await runAnalysis(parsed.input);
  } catch (err) {
    console.error("[slack] Analysis failed:", err);
    await bot.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `Sorry, the analysis failed: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`,
    });
    return { status: 200, body: "ok" };
  }

  // Build report pipeline
  if (!storageInit) {
    try {
      await initStorage();
      storageInit = true;
    } catch (err) {
      console.error("[slack] Storage init failed:", err);
    }
  }

  const reportModel = buildReportModel(analysisResult);
  let evidenceResult = null;
  let reportUrl: string | null = null;
  const evidenceBaseUrl = opts?.publicBaseUrl || env.PUBLIC_BASE_URL;
  const evidenceUrl = evidenceBaseUrl
    ? `${evidenceBaseUrl.replace(/\/$/, "")}/evidence/`
    : null;

  // Generate evidence file (always, even if PDF fails)
  try {
    const evidenceText = renderEvidence(reportModel);
    evidenceResult = await saveEvidence(evidenceText);
  } catch (err) {
    console.error("[slack] Evidence generation failed:", err);
  }

  // Generate report webpage
  try {
    const html = renderReportWebPage(reportModel);
    const saved = await saveHtmlReport(
      html,
      reportModel.shipment.product,
      reportModel.reportId,
      reportModel.version,
    );
    if (evidenceBaseUrl) {
      reportUrl = `${evidenceBaseUrl.replace(/\/$/, "")}/reports/${saved.slug}/${saved.fileName}`;
    }
  } catch (err) {
    console.error("[slack] Report webpage generation failed:", err);
  }

  // Post summary
  const blocks = renderBlocks(analysisResult, {
    reportUrl,
    evidence: evidenceResult,
    evidenceUrl: evidenceResult && evidenceUrl ? `${evidenceUrl}${evidenceResult.evidenceId}` : null,
  });

  try {
    await bot.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: blocks,
      unfurl_links: false,
      unfurl_media: false,
    });
  } catch (err) {
    console.error("[slack] Failed to post summary:", err);
  }

  return { status: 200, body: "ok" };
}
