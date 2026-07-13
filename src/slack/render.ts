import type { AnalysisResult, TargetedDoubtResult } from "../lib/types.js";
import type { SaveEvidenceResult } from "../report/storage.js";

export interface RenderOptions {
  reportUrl?: string | null;
  pdfReportUrl?: string | null;
  evidence?: SaveEvidenceResult | null;
  evidenceUrl?: string | null;
  reportDeliveryNote?: string | null;
}

export function renderBlocks(result: AnalysisResult, opts?: RenderOptions): string {
  const recommendedRoute = result.routes.find((r) => r.recommended) ?? result.routes[0] ?? null;
  const topRisks = [...result.riskFactors]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const lines: string[] = [
    `*Transitra memo ready for ${result.input.product}*`,
    "",
    `*Decision:* ${result.executiveSummary}`,
    "",
    `*Recommended route:* ${recommendedRoute?.method ?? "N/A"}`,
    `*Transit estimate:* ~${recommendedRoute?.transitDays ?? "N/A"} days`,
    `*Freight + duty:* ~$${((recommendedRoute?.cost ?? 0) + (result.tariff?.estimatedDutyUsd ?? 0)).toLocaleString()}`,
    result.tariff
      ? `*Customs:* HS ${result.tariff.hsCode}, ~${result.tariff.totalDutyPct}% estimated duty${result.tariff.notes ? " - " + result.tariff.notes : ""}`
      : "",
    "",
    "*Risk watchlist:*",
    ...topRisks.map(
      (r) => `• *${r.label}* (risk ${r.score}/100): ${r.actionable}`,
    ),
    "",
    `*Sources checked:* ${result.searches.length}. Data mode: ${result.dataMode === "live" ? "LIVE" : "MOCK"}.`,
  ];

  if (opts?.reportUrl) {
    lines.push(`*Full report:* <${opts.reportUrl}|Open interactive report>`);
  }

  if (opts?.pdfReportUrl) {
    lines.push(`*Formal PDF report:* <${opts.pdfReportUrl}|Open memo PDF>`);
  }

  if (opts?.reportDeliveryNote) {
    lines.push(opts.reportDeliveryNote);
  }

  // Evidence reference
  if (opts?.evidence) {
    if (opts.evidenceUrl) {
      lines.push(`*Evidence proof file:* <${opts.evidenceUrl}|${opts.evidence.evidenceId}>`);
    } else {
      lines.push(`*Evidence proof file generated:* ${opts.evidence.evidenceId}`);
    }
  }

  lines.push(
    "",
    "_This is decision-support, not legal/customs/tax/freight-booking advice._",
  );

  return lines.filter(Boolean).join("\n");
}

export function renderTargetedDoubt(result: TargetedDoubtResult): string {
  const sourceLines = result.sources.slice(0, 3).map((source) => `• <${source.url}|${source.title}>`);
  const searchNote = result.searches.some((s) => s.agent === "Product & Material Agent")
    ? `${result.searches.length} including product prep`
    : String(result.searches.length);

  const lines = [
    `*${result.agentName}: ${result.input.product}*`,
    "",
    `*Answer:* ${result.headline}`,
    result.score === null ? "" : `*Risk score:* ${result.score}/100`,
    `*What it means:* ${result.detail}`,
    `*Action:* ${result.actionable}`,
    "",
    sourceLines.length ? "*Top sources checked:*" : "",
    ...sourceLines,
    "",
    `*Searches checked:* ${searchNote}. Data mode: ${result.dataMode === "live" ? "LIVE" : "MOCK"}.`,
    "",
    "_This is decision-support, not legal/customs/tax/freight-booking advice._",
  ];

  return lines.filter(Boolean).join("\n");
}
