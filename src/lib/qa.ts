import { bdSearch, brightDataMode } from "./brightdata.js";
import { textCompletion } from "./openai.js";
import type { AnalysisResult, ShipmentInput, Source } from "./types.js";

export interface AnswerTradeQuestionInput {
  question: string;
  inputContext?: Partial<ShipmentInput>;
  analysisContext?: AnalysisResult;
}

function compactShipment(input?: Partial<ShipmentInput>): string {
  if (!input) return "No shipment context.";
  const parts = [
    input.product ? `Product: ${input.product}` : "",
    input.origin || input.destination ? `Lane: ${input.origin || "?"} -> ${input.destination || "?"}` : "",
    input.weightKg ? `Weight: ${input.weightKg}kg` : "",
    input.shippingMode ? `Mode: ${input.shippingMode}` : "",
    input.containerSize ? `Container: ${input.containerSize}` : "",
    input.pricePerKg ? `Price/kg: $${input.pricePerKg}` : "",
    input.shipDate ? `Ship date: ${input.shipDate}` : "",
    input.specialRequirements?.length ? `Special handling: ${input.specialRequirements.join(", ")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "No shipment context.";
}

function compactAnalysis(result?: AnalysisResult): string {
  if (!result) return "No prior report context.";
  const recommendedRoute = result.routes.find((r) => r.recommended) ?? result.routes[0];
  const topRisks = [...result.riskFactors]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => `${r.label} (${r.score}/100): ${r.actionable}`)
    .join(" | ");
  const tariff = result.tariff
    ? `Tariff: HS ${result.tariff.hsCode}, ${result.tariff.totalDutyPct}% total duty, estimated duty $${result.tariff.estimatedDutyUsd}. ${result.tariff.notes}`
    : "Tariff: unavailable.";
  const documents = result.tariff?.documents.length
    ? `Documents: ${result.tariff.documents.map((d) => d.name).join(", ")}.`
    : "";

  return [
    `Prior report for ${result.input.product}: ${result.executiveSummary}`,
    recommendedRoute ? `Recommended route: ${recommendedRoute.method}, ${recommendedRoute.transitDays} days, ~$${recommendedRoute.cost}.` : "",
    tariff,
    documents,
    topRisks ? `Top risks: ${topRisks}.` : "",
  ].filter(Boolean).join("\n");
}

function needsComplianceDisclaimer(text: string): boolean {
  return /\b(customs|duty|duties|tariff|tax|taxes|legal|regulation|regulatory|hs code|hts|classification|license|certificate|documentation|documents)\b/i.test(text);
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function formatSourceList(sources: Source[]): string {
  if (!sources.length) return "";
  return sources
    .slice(0, 3)
    .map((source, index) => `${index + 1}. ${source.title} - ${source.url}`)
    .join("\n");
}

export function buildFallbackTradeAnswer(input: AnswerTradeQuestionInput, sources: Source[] = []): string {
  const context = input.analysisContext?.input ?? input.inputContext;
  const product = context?.product ? ` for ${context.product}` : "";
  const lane = context?.origin || context?.destination
    ? ` on ${context.origin || "the origin"} -> ${context.destination || "the destination"}`
    : "";
  const sourceText = formatSourceList(sources);
  const contextLine = context?.product || context?.origin || context?.destination
    ? `Based on the current context${product}${lane}, `
    : "Generally, ";

  const lower = input.question.toLowerCase();
  let answer: string;
  if (/document|certificate|paperwork/.test(lower)) {
    answer = `${contextLine}expect the core export/import paperwork to include a commercial invoice, packing list, transport document, and customs entry data. Product-specific documents may include origin certificates, textile/apparel declarations, inspection records, licenses, or safety/compliance certificates depending on HS classification and destination rules.`;
  } else if (/duty|tariff|tax|hs code|classification/.test(lower)) {
    const tariff = input.analysisContext?.tariff;
    answer = tariff
      ? `${contextLine}the prior report estimated HS ${tariff.hsCode} with about ${tariff.totalDutyPct}% total duty and roughly $${tariff.estimatedDutyUsd.toLocaleString()} duty on the stated goods value. The estimate can be high when base duty, additional trade-remedy tariffs, product classification, and declared value all stack together.`
      : `${contextLine}duty depends mainly on HS classification, country of origin, destination country, declared value, and any additional trade-remedy tariffs or preferential-treatment eligibility. A full analysis can estimate the likely code and landed-cost impact.`;
  } else if (/route|transit|delay|port|freight|shipping/.test(lower)) {
    const recommendedRoute = input.analysisContext?.routes.find((r) => r.recommended) ?? input.analysisContext?.routes[0];
    answer = recommendedRoute
      ? `${contextLine}the prior report preferred ${recommendedRoute.method}, with about ${recommendedRoute.transitDays} days in transit and estimated freight near $${recommendedRoute.cost.toLocaleString()}. Re-check port congestion, carrier schedules, and cutoff dates before booking.`
      : `${contextLine}route choice depends on urgency, weight/volume, port congestion, carrier availability, and customs timing. Ocean is usually cost-efficient for heavier cargo, while air is faster but much more expensive.`;
  } else {
    answer = `${contextLine}this looks like a trade/logistics question rather than a request to run a full shipment analysis. I can answer at a high level from available context, but exact cost, duty, route, and risk figures need a full analysis with product, origin, destination, weight, mode, value, and ship date.`;
  }

  if (sourceText) {
    answer += `\n\nSources checked:\n${sourceText}`;
  }
  if (needsComplianceDisclaimer(input.question)) {
    answer += "\n\n_Verify customs, tax, and regulatory decisions with a qualified broker or advisor._";
  }
  return answer;
}

export async function answerTradeQuestion(input: AnswerTradeQuestionInput): Promise<string> {
  const contextInput = input.analysisContext?.input ?? input.inputContext;
  const queryParts = [
    input.question,
    contextInput?.product,
    contextInput?.origin,
    contextInput?.destination,
    "trade logistics customs freight",
  ].filter(Boolean);
  const sources = dedupeSources(await bdSearch(queryParts.join(" "), 4));
  const fallback = buildFallbackTradeAnswer(input, sources);

  return textCompletion({
    system:
      "You are Homelander, a Slack-native international trade intelligence assistant. " +
      "Answer the user's single trade/logistics question directly. Do not ask for missing shipment fields unless exact analysis is required. " +
      "Use current shipment/report context when supplied. Keep the answer concise, practical, and Slack-friendly. " +
      "For customs, tax, tariff, or regulatory topics, include a brief verification disclaimer.",
    user:
      `Question: ${input.question}\n\n` +
      `Shipment context:\n${compactShipment(contextInput)}\n\n` +
      `Prior report context:\n${compactAnalysis(input.analysisContext)}\n\n` +
      `Search mode: ${brightDataMode().toUpperCase()}\n` +
      `Sources:\n${sources.map((s) => `- ${s.title}: ${s.snippet ?? ""} (${s.url})`).join("\n")}`,
    fallback,
  });
}

export const testables = {
  needsComplianceDisclaimer,
  compactShipment,
  compactAnalysis,
};
