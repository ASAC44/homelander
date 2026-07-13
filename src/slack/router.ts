import { jsonCompletion, hasOpenAI } from "../lib/openai.js";
import { classifyTargetedDoubt } from "../lib/targeted.js";
import type { ShipmentInput } from "../lib/types.js";

export type MessageRoute = "analysis_request" | "question" | "help";

export interface RouteContext {
  awaitingIntake?: boolean;
  input?: Partial<ShipmentInput>;
  hasLastAnalysis?: boolean;
}

export interface RouteDecision {
  route: MessageRoute;
  confidence: number;
  reason: string;
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function hasAnyShipmentContext(context?: RouteContext): boolean {
  if (!context) return false;
  return Boolean(context.hasLastAnalysis || Object.keys(context.input ?? {}).length);
}

function isExplicitAnalysisRequest(text: string): boolean {
  return /^(please\s+)?(can you\s+)?(analy[sz]e|assess|evaluate)\b/i.test(text)
    || /\b(analy[sz]e|assess|evaluate|run|start|generate|create|build|prepare)\b.{0,40}\b(shipment|cargo|lane|route|report|memo|analysis|risk|cost)\b/i.test(text)
    || /\b(full|complete|formal)\s+(analysis|report|memo)\b/i.test(text)
    || /\b(shipment|cargo|lane)\b.{0,40}\b(analy[sz]e|analysis|report|memo)\b/i.test(text);
}

function isQuestion(text: string): boolean {
  const trimmed = normalize(text).toLowerCase();
  return trimmed.endsWith("?")
    || /^(what|why|how|when|where|which|who|can|could|should|would|do|does|did|is|are|will)\b/.test(trimmed)
    || /\b(what documents|which documents|do i need|why is|why are|explain|tell me|how much|how long|duty estimate|tariff|customs|hs code|documentation|certificate|incoterms?)\b/.test(trimmed);
}

function looksLikeIntakeAnswer(text: string): boolean {
  const lower = text.toLowerCase();
  const hasFieldValue = /\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|ton|tons|tonne|tonnes|lb|lbs|pound|pounds)\b/.test(lower)
    || /\$\s*\d+(?:\.\d+)?\s*(?:\/|per)\s*(kg|kilo|kilogram|lb|pound)\b/.test(lower)
    || /\b(20ft|40ft|40 ft|40'?hc|lcl|fcl|pallets?|container|air|ocean|sea|rail|truck|road)\b/.test(lower)
    || /\b(refrigerated|reefer|frozen|fragile|hazardous|hazmat|organic|ambient|standard|no special|none)\b/.test(lower)
    || /\b(ship|ready|pickup|depart|departure|by)\s+(today|tomorrow|next|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|\d{1,2}\/\d{1,2})\b/.test(lower);

  const hasRouteValue = /\bfrom\b.+\bto\b/i.test(text)
    || /[A-Za-z][A-Za-z\s]+,\s*[A-Za-z][A-Za-z\s]+/.test(text);

  return hasFieldValue || hasRouteValue;
}

function deterministicRoute(text: string, context?: RouteContext): RouteDecision | null {
  const clean = normalize(text);
  if (!clean) return { route: "help", confidence: 1, reason: "empty message" };

  if (classifyTargetedDoubt(clean).type === "targeted_doubt") {
    return { route: "question", confidence: 0.92, reason: "targeted trade/logistics doubt" };
  }

  if (isExplicitAnalysisRequest(clean)) {
    return { route: "analysis_request", confidence: 0.95, reason: "explicit analysis/report request" };
  }

  if (context?.awaitingIntake && looksLikeIntakeAnswer(clean) && !isQuestion(clean)) {
    return { route: "analysis_request", confidence: 0.9, reason: "active intake field answer" };
  }

  if (isQuestion(clean)) {
    return { route: "question", confidence: 0.85, reason: "direct trade/logistics question" };
  }

  return null;
}

export async function routeMessage(text: string, context?: RouteContext): Promise<RouteDecision> {
  const deterministic = deterministicRoute(text, context);
  if (deterministic) return deterministic;

  if (!hasOpenAI) {
    return {
      route: hasAnyShipmentContext(context) ? "question" : "analysis_request",
      confidence: 0.55,
      reason: "deterministic fallback",
    };
  }

  const classified = await jsonCompletion<RouteDecision>({
    system:
      "Classify a Slack message for a trade intelligence bot. Return JSON only. " +
      "Use analysis_request only when the user is asking to start or continue a shipment analysis/intake. " +
      "Use question for standalone trade, customs, tariff, logistics, route, document, or prior-report questions. " +
      "Use help for empty greetings or requests for instructions.",
    user:
      `Message: "${text}"\n` +
      `Context: ${JSON.stringify({
        awaitingIntake: Boolean(context?.awaitingIntake),
        hasPartialShipment: Object.keys(context?.input ?? {}).length > 0,
        hasLastAnalysis: Boolean(context?.hasLastAnalysis),
      })}\n` +
      `Return {"route":"analysis_request"|"question"|"help","confidence":number,"reason":string}`,
    fallback: {
      route: hasAnyShipmentContext(context) ? "question" : "analysis_request",
      confidence: 0.5,
      reason: "classifier fallback",
    },
  });

  if (classified.route === "analysis_request" || classified.route === "question" || classified.route === "help") {
    return classified;
  }

  return { route: "analysis_request", confidence: 0.4, reason: "invalid classifier route" };
}

export const testables = {
  isExplicitAnalysisRequest,
  isQuestion,
  looksLikeIntakeAnswer,
};
