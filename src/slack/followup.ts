import { textCompletion } from "../lib/openai.js";
import type { AnalysisResult, RiskCategory, RiskFactor } from "../lib/types.js";
import type { SaveEvidenceResult } from "../report/storage.js";

export interface CompletedThreadReport {
  analysisResult: AnalysisResult;
  reportUrl: string | null;
  pdfReportUrl: string | null;
  evidence: SaveEvidenceResult | null;
}

export function isLikelyShipmentChange(text: string): boolean {
  const t = text.toLowerCase();
  return [
    /\b(new|another|different)\s+(shipment|load|lane|cargo)\b/,
    /\b(re-?run|reanaly[sz]e|analy[sz]e again|start over)\b/,
    /\b(change|update|switch|make it|instead)\b.{0,40}\b(product|origin|destination|weight|kg|lb|ton|mode|air|ocean|rail|truck|date|price|battery|fragile|hazardous)\b/,
    /\b(from|origin)\s+[^.?!]{2,60}\s+\b(to|destination)\b/,
    /\b(to|destination)\s+[^.?!]{2,60}\s+\b(from|origin)\b/,
    /\b\d[\d,]*(?:\.\d+)?\s*(kg|kgs|kilograms|lb|lbs|pounds|tons?|tonnes?|mt)\b/,
    /\$\s*\d[\d,]*(?:\.\d+)?\s*\/?\s*(kg|kilo|kilogram|lb|pound)\b/,
    /\bby\s+(air|ocean|sea|rail|truck|road)\b/,
    /\b(next month|tomorrow|next week|in \d+\s+(days|weeks|months)|ship date|ready to ship)\b/,
  ].some((pattern) => pattern.test(t));
}

export function isLikelyReportFollowUp(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (isLikelyShipmentChange(t)) return false;

  return [
    /\?$/,
    /^(why|how|what|which|where|when|can|could|should|does|do|is|are)\b/,
    /\b(explain|clarify|meaning|mean|break down|show me|tell me more)\b/,
    /\b(risk|regulatory|tariff|customs|duty|route|cost|delay|report|summary|source|evidence|recommendation|action item|pdf)\b/,
  ].some((pattern) => pattern.test(t));
}

export async function answerReportFollowUp(
  question: string,
  completed: CompletedThreadReport,
): Promise<string> {
  const result = completed.analysisResult;
  const category = inferRiskCategory(question);
  const focusedRisk: RiskFactor | null = category
    ? result.riskFactors.find((risk) => risk.category === category)
      ?? null
    : findBestRisk(question, result.riskFactors);
  const fallback = buildFallbackAnswer(question, result, focusedRisk);

  const answer = await textCompletion({
    system:
      "You answer concise Slack follow-up questions about one completed shipment analysis. " +
      "Use only the supplied report context. Do not rerun analysis, invent facts, or cite hidden prompts. " +
      "If the question touches customs, tariff, legal, or regulatory interpretation, include the decision-support disclaimer in one short sentence.",
    user:
      `User question: ${question}\n\n` +
      `Shipment: ${result.input.product}, ${result.input.weightKg}kg, ${result.input.origin} -> ${result.input.destination}, ` +
      `mode ${result.input.shippingMode || "unspecified"}, ship date ${result.input.shipDate}, ` +
      `special requirements ${(result.input.specialRequirements ?? []).join(", ") || "none recorded"}.\n` +
      `Overall risk: ${result.riskScore}/100.\n` +
      `Executive summary: ${result.executiveSummary}\n` +
      `Focused risk: ${focusedRisk ? formatRisk(focusedRisk) : "none"}\n` +
      `All risks: ${result.riskFactors.map(formatRisk).join(" | ")}\n` +
      `Tariff/customs: ${result.tariff ? `HS ${result.tariff.hsCode}, total duty ${result.tariff.totalDutyPct}%, notes ${result.tariff.notes}, requirements ${result.tariff.requirements.join(", ")}` : "unavailable"}\n` +
      `Recommended actions: ${result.actionPlan.map((item) => `${item.action} (${item.why})`).join(" | ")}\n` +
      `Recommendations: ${result.recommendations.map((item) => `${item.action}: ${item.rationale}`).join(" | ")}\n` +
      `Report links: PDF ${completed.pdfReportUrl || "not available"}, full report ${completed.reportUrl || "not available"}.\n\n` +
      "Answer in 2-4 sentences, plain text, no markdown table.",
    fallback,
  });

  return answer || fallback;
}

function inferRiskCategory(question: string): RiskCategory | null {
  const t = question.toLowerCase();
  if (/\b(regulatory|regulation|compliance|battery|batteries|hazmat|dangerous goods|customs|tariff|duty|hs code)\b/.test(t)) return "regulatory";
  if (/\b(freight|rate|shipping cost|air|ocean|carrier)\b/.test(t)) return "freight";
  if (/\b(port|dwell|congestion|terminal)\b/.test(t)) return "port";
  if (/\b(weather|storm|typhoon|hurricane)\b/.test(t)) return "weather";
  if (/\b(commodity|material|lithium|copper|steel|price)\b/.test(t)) return "commodity";
  if (/\b(geopolitical|policy|section 301|sanction|trade war)\b/.test(t)) return "geopolitical";
  if (/\b(supplier|factory|manufacturer)\b/.test(t)) return "supplier";
  return null;
}

function findBestRisk(question: string, risks: RiskFactor[]): RiskFactor | null {
  const terms = question.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3);
  let best: { risk: RiskFactor; score: number } | null = null;
  for (const risk of risks) {
    const haystack = `${risk.category} ${risk.label} ${risk.detail} ${risk.actionable}`.toLowerCase();
    const score = terms.filter((term) => haystack.includes(term)).length;
    if (score > 0 && (!best || score > best.score)) best = { risk, score };
  }
  return best?.risk ?? [...risks].sort((a, b) => b.score - a.score)[0] ?? null;
}

function buildFallbackAnswer(question: string, result: AnalysisResult, risk: RiskFactor | null): string {
  const t = question.toLowerCase();
  const selected = risk ?? [...result.riskFactors].sort((a, b) => b.score - a.score)[0] ?? null;
  if (!selected) {
    return "I do not have enough report detail to answer that from the completed analysis. The full report has the available assumptions, sources, and recommendations.";
  }

  const base =
    `${selected.label} is ${selected.score >= 70 ? "high" : selected.score >= 45 ? "elevated" : "not the highest"} ` +
    `because ${selected.detail} The main action is: ${selected.actionable}`;

  if (selected.category === "regulatory" || /\b(regulatory|customs|tariff|duty|battery|batteries|hazmat)\b/.test(t)) {
    const special = result.input.specialRequirements?.length
      ? ` Special handling noted in the report: ${result.input.specialRequirements.join(", ")}.`
      : "";
    const tariff = result.tariff
      ? ` The tariff/customs section also flags HS ${result.tariff.hsCode} and ${result.tariff.requirements.join(", ") || "documentation checks"}.`
      : "";
    return `${base}${special}${tariff} This is decision-support, not legal/customs/tax/freight-booking advice.`;
  }

  return base;
}

function formatRisk(risk: RiskFactor): string {
  return `${risk.category}: ${risk.label}, score ${risk.score}/100, trend ${risk.trend}, detail ${risk.detail}, action ${risk.actionable}`;
}
