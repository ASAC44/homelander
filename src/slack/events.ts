import { env } from "../config.js";
import { WebClient } from "@slack/web-api";
import fs from "node:fs/promises";
import path from "node:path";
import { intake } from "../lib/agents.js";
import {
  deleteUserOpenAiKey,
  extractLikelyApiKey,
  getUserOpenAiContext,
  hasUserOpenAiKey,
  isByokConfigured,
  maskApiKey,
  parseByokCommand,
  saveUserOpenAiKey,
} from "../lib/byok.js";
import { waitForMockLoopMinimum } from "../lib/mock-mode.js";
import { runAnalysis, runTargetedDoubt } from "../lib/orchestrator.js";
import { answerTradeQuestion } from "../lib/qa.js";
import { classifyTargetedDoubt } from "../lib/targeted.js";
import type { AnalysisResult, ShipmentInput } from "../lib/types.js";
import { hasOpenAIAccess } from "../lib/openai.js";
import { renderBlocks, renderTargetedDoubt } from "./render.js";
import { routeMessage } from "./router.js";
import { buildReportModel } from "../report/model.js";
import { renderEvidence } from "../report/evidence.js";
import { renderLatex } from "../report/latex.js";
import { compileLatexReport } from "../report/pdf.js";
import { renderReportWebPage } from "../report/web.js";
import { saveHtmlReport, saveEvidence, initStorage } from "../report/storage.js";
import {
  answerReportFollowUp,
  isLikelyReportFollowUp,
  isLikelyShipmentChange,
  type CompletedThreadReport,
} from "./followup.js";

const bot = env.SLACK_BOT_TOKEN ? new WebClient(env.SLACK_BOT_TOKEN) : null;

// In-memory dedup with a 5-minute TTL.
const seenEvents = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000;
interface LastReportUrls {
  reportUrl?: string | null;
  pdfReportUrl?: string | null;
  evidenceUrl?: string | null;
}

interface SlackReportFile {
  filePath: string;
  fileName: string;
  title: string;
}

interface GeneratedPdfReport {
  file: SlackReportFile;
  publicUrl: string | null;
}

interface ThreadConversationState {
  input?: Partial<ShipmentInput>;
  lastAnalysis?: AnalysisResult;
  lastReportUrls?: LastReportUrls;
  completed?: CompletedThreadReport;
  awaitingIntake?: boolean;
  updatedAt: number;
}

const conversations = new Map<string, ThreadConversationState>();
const CONVERSATION_TTL_MS = 30 * 60 * 1000;
const completedShipments = new Map<string, { input: ShipmentInput; updatedAt: number }>();
const COMPLETED_SHIPMENT_TTL_MS = 2 * 60 * 60 * 1000;

export function shouldGuideFirstDmToByok(opts: {
  isDm: boolean;
  hasSavedUserKey: boolean;
  hasConversationState: boolean;
  hasCompletedShipment: boolean;
  text: string;
}): boolean {
  if (!opts.isDm) return false;
  if (opts.hasSavedUserKey) return false;
  if (opts.hasConversationState || opts.hasCompletedShipment) return false;
  if (!opts.text.trim()) return true;
  if (parseByokCommand(opts.text)) return false;
  return true;
}

function firstDmByokPrompt(): string {
  return (
    "Before we start, add your OpenAI API key in this DM.\n\n" +
    "Send:\n" +
    "`set api key YOUR_KEY`\n\n" +
    "After that, send your shipment request and I’ll run the analysis.\n\n" +
    "_Your key is accepted only in DM and is stored encrypted on the server._"
  );
}

function orgByokRequiredPrompt(): string {
  return (
    "You need to connect your personal OpenAI API key before I can help here.\n\n" +
    "DM me:\n" +
    "`set api key YOUR_KEY`\n\n" +
    "After that, you can come back and use me in DMs or `@mentions`."
  );
}

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

function conversationKey(channel: string, scope: string): string {
  return `${channel}:${scope}`;
}

function getConversationState(key: string): ThreadConversationState | undefined {
  const state = conversations.get(key);
  if (!state) return undefined;
  if (Date.now() - state.updatedAt > CONVERSATION_TTL_MS) {
    conversations.delete(key);
    return undefined;
  }
  return state;
}

function setConversationState(key: string, state: Omit<ThreadConversationState, "updatedAt">): void {
  conversations.set(key, { ...state, updatedAt: Date.now() });
  cleanupConversationState();
}

function setCompletedReportState(
  key: string,
  completed: CompletedThreadReport,
  lastReportUrls: LastReportUrls,
): void {
  conversations.set(key, {
    lastAnalysis: completed.analysisResult,
    lastReportUrls,
    completed,
    awaitingIntake: false,
    updatedAt: Date.now(),
  });
  cleanupConversationState();
}

function clearPendingInputState(key: string): void {
  const existing = getConversationState(key);
  if (!existing?.completed && !existing?.lastAnalysis) {
    conversations.delete(key);
    return;
  }
  conversations.set(key, {
    completed: existing.completed,
    lastAnalysis: existing.lastAnalysis,
    lastReportUrls: existing.lastReportUrls,
    awaitingIntake: false,
    updatedAt: Date.now(),
  });
}

function cleanupConversationState(): void {
  if (conversations.size > 1000) {
    const now = Date.now();
    for (const [id, state] of conversations) {
      if (now - state.updatedAt > CONVERSATION_TTL_MS) conversations.delete(id);
    }
  }
}

function getCompletedShipment(key: string): ShipmentInput | undefined {
  const state = completedShipments.get(key);
  if (!state) return undefined;
  if (Date.now() - state.updatedAt > COMPLETED_SHIPMENT_TTL_MS) {
    completedShipments.delete(key);
    return undefined;
  }
  return state.input;
}

function setCompletedShipment(key: string, input: ShipmentInput): void {
  completedShipments.set(key, { input, updatedAt: Date.now() });
  if (completedShipments.size > 1000) {
    const now = Date.now();
    for (const [id, state] of completedShipments) {
      if (now - state.updatedAt > COMPLETED_SHIPMENT_TTL_MS) completedShipments.delete(id);
    }
  }
}

async function uploadReportFiles(
  client: WebClient,
  channel: string,
  threadTs: string,
  initialComment: string,
  files: SlackReportFile[],
): Promise<void> {
  if (!files.length) return;

  await client.filesUploadV2({
    channel_id: channel,
    thread_ts: threadTs,
    initial_comment: initialComment,
    file_uploads: files.map((file) => ({
      file: file.filePath,
      filename: file.fileName,
      title: file.title,
    })),
  });
}

async function generatePdfReport(
  reportModel: ReturnType<typeof buildReportModel>,
  outputDir: string,
  slug: string,
  publicBaseUrl?: string,
): Promise<GeneratedPdfReport | null> {
  const publicReportsBaseUrl = publicBaseUrl
    ? `${publicBaseUrl.replace(/\/$/, "")}/reports/${slug}`
    : null;

  try {
    const texPath = path.join(outputDir, `report-${reportModel.reportId}.tex`);
    const tex = await renderLatex(reportModel);
    await fs.writeFile(texPath, tex, "utf-8");

    const compiled = await compileLatexReport(texPath, outputDir);
    if (compiled.success) {
      if (env.REPORT_KEEP_TEX !== "true") {
        await fs.unlink(texPath).catch(() => {});
        await fs.unlink(compiled.logPath).catch(() => {});
      }

      return {
        file: {
          filePath: compiled.pdfPath,
          fileName: path.basename(compiled.pdfPath),
          title: "Formal PDF report",
        },
        publicUrl: publicReportsBaseUrl
          ? `${publicReportsBaseUrl}/${path.basename(compiled.pdfPath)}`
          : null,
      };
    }

    console.warn("[slack] PDF report compilation failed:", compiled.error);
  } catch (err) {
    console.error("[slack] PDF report generation failed:", err);
  }

  return null;
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
  const isDm = Boolean(event.type === "message" && event.channel?.startsWith("D"));
  const isMessage = event.type === "message";
  const userId = event.user;

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

  if (!bot || !channel) {
    console.warn("[slack] Bot not configured or no channel");
    return { status: 200, body: "ok" };
  }

  // Strip @Transitra mention prefix for app_mention
  const cleanText = isAppMention ? userText.replace(/<@[A-Z0-9]+>/g, "").trim() : userText;
  const stateKey = conversationKey(channel, isDm ? "dm" : threadTs);
  const threadState = getConversationState(stateKey);
  const modelContext = userId ? await getUserOpenAiContext(userId) : undefined;
  const hasSavedUserKey = Boolean(modelContext?.apiKey);
  const hasCompleted = Boolean(getCompletedShipment(stateKey));

  if (!isDm && extractLikelyApiKey(cleanText)) {
    await bot.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "Do not post API keys in channels or shared threads. DM me instead with `set api key YOUR_KEY`, then rotate the exposed key immediately.",
    });
    return { status: 200, body: "ok" };
  }

  if (isDm && userId) {
    const byok = parseByokCommand(cleanText);
    if (byok) {
      if (!isByokConfigured()) {
        await bot.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: "BYOK storage is not configured on the server yet. Set `BYOK_ENCRYPTION_SECRET` or `SLACK_SIGNING_SECRET` first.",
        });
        return { status: 200, body: "ok" };
      }

      if (byok.type === "help") {
        await bot.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text:
            "To use your own OpenAI key in this workspace, DM me one of these commands:\n" +
            "- `set api key YOUR_KEY`\n" +
            "- `api key status`\n" +
            "- `remove api key`\n\n" +
            "Keys are accepted only in DMs and are stored encrypted on the server.",
        });
        return { status: 200, body: "ok" };
      }

      if (byok.type === "status") {
        const hasSavedKey = await hasUserOpenAiKey(userId);
        await bot.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: hasSavedKey
            ? "Your personal OpenAI key is saved and will be used for your requests."
            : "You do not have a personal OpenAI key saved.",
        });
        return { status: 200, body: "ok" };
      }

      if (byok.type === "remove") {
        const removed = await deleteUserOpenAiKey(userId);
        await bot.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: removed
            ? "Removed your saved OpenAI key. You will need to DM me a new key before I can help again."
            : "No saved personal OpenAI key was found for your user.",
        });
        return { status: 200, body: "ok" };
      }

      await saveUserOpenAiKey(userId, byok.apiKey);
      await bot.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text:
          `Saved your OpenAI key (${maskApiKey(byok.apiKey)}). ` +
          "I will use it for your future requests in this workspace. If this key was previously shared anywhere else, rotate it.",
      });
      return { status: 200, body: "ok" };
    }
  }

  if (!hasSavedUserKey) {
    await bot.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: isDm ? firstDmByokPrompt() : orgByokRequiredPrompt(),
    });
    return { status: 200, body: "ok" };
  }

  if (shouldGuideFirstDmToByok({
    isDm,
    hasSavedUserKey,
    hasConversationState: Boolean(threadState),
    hasCompletedShipment: hasCompleted,
    text: cleanText,
  })) {
    await bot.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: firstDmByokPrompt(),
    });
    return { status: 200, body: "ok" };
  }

  if (!cleanText) {
    await bot.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: firstDmByokPrompt(),
    });
    return { status: 200, body: "ok" };
  }

  const route = await routeMessage(cleanText, {
    awaitingIntake: threadState?.awaitingIntake,
    input: threadState?.input,
    hasLastAnalysis: Boolean(threadState?.lastAnalysis || threadState?.completed),
    hasModelAccess: hasOpenAIAccess(modelContext),
  }, { modelContext });

  if (route.route === "help") {
    await bot.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "Hi! Ask me a trade/logistics question, or send shipment details and ask me to analyze them. E.g.: \"What documents do I need for cotton shirts from India to the US?\" or \"Analyze 10,000 kg of metal office chairs from Shenzhen to Los Angeles by September.\"\n\n_Homelander is decision-support, not legal/customs/tax/freight-booking advice._",
    });
    return { status: 200, body: "ok" };
  }

  if (route.route === "question") {
    try {
      const analysisContext = threadState?.lastAnalysis ?? threadState?.completed?.analysisResult;
      const shipmentChange = isLikelyShipmentChange(cleanText);
      const targetedRoute = !shipmentChange && analysisContext
        ? classifyTargetedDoubt(cleanText)
        : { type: "unknown" as const };
      const answer = targetedRoute.type === "targeted_doubt" && analysisContext
        ? renderTargetedDoubt(await runTargetedDoubt(
            analysisContext.input,
            targetedRoute.kind,
            cleanText,
            { analysisContext, modelContext },
          ))
        : threadState?.completed && isLikelyReportFollowUp(cleanText) && !shipmentChange
          ? await answerReportFollowUp(cleanText, threadState.completed, { modelContext })
          : await answerTradeQuestion({
              question: cleanText,
              inputContext: analysisContext?.input
                ?? threadState?.input
                ?? getCompletedShipment(stateKey),
              analysisContext,
            }, { modelContext });
      await bot.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: answer,
        unfurl_links: false,
        unfurl_media: false,
      });
    } catch (err) {
      console.error("[slack] Q&A failed:", err);
      await bot.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: "Sorry, I had trouble answering that. Could you rephrase the trade or logistics question?",
      });
    }
    return { status: 200, body: "ok" };
  }

  // Run intake
  let parsed;
  const currentInput = (threadState?.awaitingIntake ? threadState.input : undefined) ??
    (threadState?.completed && isLikelyShipmentChange(cleanText)
      ? threadState.completed.analysisResult.input
      : undefined);
  try {
    parsed = await intake(cleanText, currentInput, { modelContext });
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
    setConversationState(stateKey, {
      input: parsed.input,
      lastAnalysis: threadState?.lastAnalysis,
      lastReportUrls: threadState?.lastReportUrls,
      completed: threadState?.completed,
      awaitingIntake: true,
    });
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
    text: "Running the analysis...",
  });

  const mockLoopStartedAtMs = Date.now();
  let analysisResult;
  try {
    analysisResult = await runAnalysis(parsed.input, { modelContext });
    clearPendingInputState(stateKey);
    setCompletedShipment(stateKey, analysisResult.input);
  } catch (err) {
    console.error("[slack] Analysis failed:", err);
    clearPendingInputState(stateKey);
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
  let pdfReportUrl: string | null = null;
  let htmlReportFile: SlackReportFile | null = null;
  let pdfReportFile: SlackReportFile | null = null;
  const evidenceBaseUrl = opts?.publicBaseUrl || env.PUBLIC_BASE_URL;
  const evidenceUrl = evidenceBaseUrl
    ? `${evidenceBaseUrl.replace(/\/$/, "")}/evidence/`
    : null;
  let evidenceLink: string | null = null;

  // Generate evidence file (always, even if PDF fails)
  try {
    const evidenceText = renderEvidence(reportModel);
    evidenceResult = await saveEvidence(evidenceText);
    evidenceLink = evidenceResult && evidenceUrl ? `${evidenceUrl}${evidenceResult.evidenceId}` : null;
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
    htmlReportFile = {
      filePath: saved.filePath,
      fileName: saved.fileName,
      title: "Interactive HTML report",
    };
    if (evidenceBaseUrl) {
      reportUrl = `${evidenceBaseUrl.replace(/\/$/, "")}/reports/${saved.slug}/${saved.fileName}`;
    }

    const generatedPdf = await generatePdfReport(
      reportModel,
      path.dirname(saved.filePath),
      saved.slug,
      evidenceBaseUrl,
    );
    if (generatedPdf) {
      pdfReportFile = generatedPdf.file;
      pdfReportUrl = generatedPdf.publicUrl;
    }
  } catch (err) {
    console.error("[slack] Report webpage generation failed:", err);
  }

  // Post summary
  setCompletedReportState(stateKey, {
    analysisResult,
    reportUrl,
    pdfReportUrl,
    evidence: evidenceResult,
  }, {
    reportUrl,
    pdfReportUrl,
    evidenceUrl: evidenceLink,
  });

  const reportFiles = [htmlReportFile, pdfReportFile].filter((file): file is SlackReportFile =>
    file !== null
  );
  const hasHtmlAndPdf = Boolean(htmlReportFile && pdfReportFile);
  const missingGenerationNote = [
    !htmlReportFile ? "Interactive HTML generation failed." : null,
    !pdfReportFile ? "PDF generation failed." : null,
  ].filter((note): note is string => note !== null).join(" ");
  const attachedReportNote = hasHtmlAndPdf
    ? "*Attached files:* Interactive HTML report and formal PDF report."
    : reportFiles.length
      ? `*Attached files:* ${reportFiles.map((file) => file.title).join(", ")}. ${missingGenerationNote}`.trim()
      : null;
  const fallbackReportNote = reportFiles.length
    ? hasHtmlAndPdf
      ? "*Report upload:* The HTML and PDF reports were generated locally, but Slack file upload failed. Use the links above if configured."
      : `*Report upload:* ${missingGenerationNote} Slack file upload also failed. Use the links above if configured.`
    : "*Report upload:* No report files were available to upload.";
  const attachedSummary = renderBlocks(analysisResult, {
    reportUrl,
    pdfReportUrl,
    evidence: evidenceResult,
    evidenceUrl: evidenceLink,
    reportDeliveryNote: attachedReportNote,
  });
  const fallbackSummary = renderBlocks(analysisResult, {
    reportUrl,
    pdfReportUrl,
    evidence: evidenceResult,
    evidenceUrl: evidenceLink,
    reportDeliveryNote: fallbackReportNote,
  });

  try {
    await waitForMockLoopMinimum(mockLoopStartedAtMs);
    if (reportFiles.length) {
      try {
        await uploadReportFiles(bot, channel, threadTs, attachedSummary, reportFiles);
      } catch (err) {
        console.error("[slack] Failed to upload report files:", {
          files: reportFiles.map((file) => file.filePath),
          error: err,
        });
        await bot.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: fallbackSummary,
          unfurl_links: false,
          unfurl_media: false,
        });
      }
    } else {
      await bot.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: fallbackSummary,
        unfurl_links: false,
        unfurl_media: false,
      });
    }
  } catch (err) {
    console.error("[slack] Failed to post summary:", err);
  }

  return { status: 200, body: "ok" };
}
