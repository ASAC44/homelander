import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReportModel } from "./model.js";
import { escapeLatex } from "./escape.js";
import {
  renderCostForecastChart,
  renderRiskBarChart,
  renderRouteComparisonChart,
  renderDriverCharts,
  renderDependencyGraph,
  renderPortComparison,
} from "./charts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function latexParagraphs(text: string): string {
  return escapeLatex(text)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
}

function renderShipmentTable(model: ReportModel): string {
  const s = model.shipment;
  const rows: string[] = [
    `\\rowcolor{warmpanel}\\textbf{Product} & ${escapeLatex(s.product)} \\\\`,
    `\\textbf{Origin} & ${escapeLatex(s.origin)} \\\\`,
    `\\rowcolor{warmpanel}\\textbf{Destination} & ${escapeLatex(s.destination)} \\\\`,
    `\\textbf{Weight} & ${s.weightKg.toLocaleString()} kg \\\\`,
  ];
  if (s.quantity) rows.push(`\\rowcolor{warmpanel}\\textbf{Quantity} & ${s.quantity.toLocaleString()} \\\\`);
  rows.push(`\\textbf{Ship date} & ${escapeLatex(s.shipDate)} \\\\`);
  if (s.shippingMode) rows.push(`\\rowcolor{warmpanel}\\textbf{Shipping mode} & ${escapeLatex(s.shippingMode)} \\\\`);
  if (s.containerSize) rows.push(`\\textbf{Container} & ${escapeLatex(s.containerSize)} \\\\`);
  if (s.pricePerKg) rows.push(`\\rowcolor{warmpanel}\\textbf{Price/kg} & \\$${fmtUsd(s.pricePerKg)} \\\\`);
  if (s.specialRequirements?.length) {
    rows.push(`\\textbf{Special requirements} & ${escapeLatex(s.specialRequirements.join("; "))} \\\\`);
  }
  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.27\\textwidth}X}
    \\arrayrulecolor{linegray}
    \\toprule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}`;
}

function renderAssumptionsList(model: ReportModel): string {
  if (model.assumptions.length === 0) return "\\textit{None identified.}";
  return "\\begin{itemize}\n" + model.assumptions
    .map((a) => `  \\item ${escapeLatex(a)}`)
    .join("\n") + "\n\\end{itemize}";
}

function renderLimitationsList(model: ReportModel): string {
  if (model.limitations.length === 0) return "\\item None identified.";
  return model.limitations
    .map((l) => `  \\item ${escapeLatex(l)}`)
    .join("\n");
}

function renderRouteTable(model: ReportModel): string {
  const rows = model.routes.map((r) => {
    const flag = r.recommended ? " (Recommended)" : "";
    return `${escapeLatex(r.method)}${flag} & \\$${fmtUsd(r.cost)} & ${r.transitDays} & ${escapeLatex(r.note)} \\\\`;
  });
  return `\\begin{tabularx}{\\textwidth}{lrcX}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Method} & \\textbf{Cost} & \\textbf{Transit} & \\textbf{Note} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}`;
}

function renderLandedCostTable(model: ReportModel): string {
  const lc = model.landedCost;
  return `\\begin{tabularx}{\\textwidth}{lXr}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Component} & \\textbf{Details} & \\textbf{Amount} \\\\
    \\midrule
    Goods value & Based on ${lc.goodsValueUsd > 0 ? "provided price/kg" : "estimated value"} & \\$${fmtUsd(lc.goodsValueUsd)} \\\\
    Freight & ${model.recommendedRoute ? escapeLatex(model.recommendedRoute.method) : "Recommended route"} & \\$${fmtUsd(lc.estimatedFreightUsd)} \\\\
    Duties and taxes & ${lc.totalDutyPct}\\% estimated duty rate & \\$${fmtUsd(lc.estimatedDutyUsd)} \\\\
    \\midrule
    \\textbf{Total landed cost} & & \\textbf{\\$${fmtUsd(lc.estimatedTotalUsd)}} \\\\
    \\bottomrule
  \\end{tabularx}`;
}

function renderTariffSection(model: ReportModel): string {
  const t = model.tariff;
  if (!t) {
    return "\\textbf{Tariff analysis was not completed.} Customs duty rates could not be estimated from available data. Consult a customs broker for accurate classification and duty assessment.";
  }
  const addRows = t.additional.length > 0
    ? t.additional.map((a) => `${escapeLatex(a.name)} & ${a.ratePct}\\% \\\\`).join("\n      ")
    : "None & N/A \\\\";
  return `\\begin{tabularx}{\\textwidth}{lX}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}HS Code & \\texttt{${escapeLatex(t.hsCode)}} \\\\
    Origin & ${escapeLatex(t.originCountry)} \\\\
    \\rowcolor{warmpanel}Destination & ${escapeLatex(t.destinationCountry)} \\\\
    Base duty rate & ${t.baseDutyPct}\\% \\\\
    \\rowcolor{warmpanel}Total duty rate & ${t.totalDutyPct}\\% \\\\
    Estimated duty amount & \\$${fmtUsd(model.landedCost.estimatedDutyUsd)} \\\\
    \\bottomrule
  \\end{tabularx}

  \\vspace{0.5em}
  \\noindent\\textbf{Additional duties and surcharges}
  \\vspace{0.3em}

  \\begin{tabularx}{\\textwidth}{lX}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Name} & \\textbf{Rate} \\\\
    \\midrule
    ${addRows}
    \\bottomrule
  \\end{tabularx}

  ${t.notes ? `\\vspace{0.5em}\\noindent ${escapeLatex(t.notes)}` : ""}`;
}

function renderDocumentsTable(model: ReportModel): string {
  if (model.documents.length === 0) {
    return "\\textbf{No specific documents identified.} Recommended: commercial invoice, packing list, bill of lading \\/ air waybill, certificate of origin, and any product-specific permits.";
  }
  const rows = model.documents.map((d) =>
    `${escapeLatex(d.name)} & ${d.url ? `\\url{${escapeLatex(d.url)}}` : "Official source not available"} \\\\`,
  );
  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.34\\textwidth}X}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Document} & \\textbf{Reference} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}`;
}

function renderRiskRow(r: ReportModel["risks"][number]): string {
  const scoreLabel = r.score >= 70
    ? "\\textcolor{riskred}{High}"
    : r.score >= 40
      ? "\\textcolor{riskamber}{Medium}"
      : "\\textcolor{riskgreen}{Low}";
  const findings = r.keyFindings.length > 0
    ? r.keyFindings.map((f) => escapeLatex(f)).join("; ")
    : escapeLatex(r.detail);
  return `${escapeLatex(r.label)} & ${r.score}/100 & ${scoreLabel} & ${findings} \\\\`;
}

function renderRisksTable(model: ReportModel): string {
  if (model.risks.length === 0) {
    return "\\textbf{No significant risks identified.}";
  }
  const sorted = [...model.risks].sort((a, b) => b.score - a.score);
  const rows = sorted.map(renderRiskRow);
  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}X c c >{\\raggedright\\arraybackslash}p{5cm}}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Risk} & \\textbf{Score} & \\textbf{Level} & \\textbf{Findings} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}`;
}

function renderDecisionPanel(model: ReportModel): string {
  return `\\panel{
    {\\sectionlabel{Decision Summary}}\\\\[0.35em]
    {\\Large\\bfseries ${escapeLatex(model.executiveSummary.split(".")[0] + ".")}}\\\\[0.55em]
    ${latexParagraphs(model.executiveSummary)}
  }`;
}

function renderKpiCards(model: ReportModel): string {
  const recommendedRoute = model.recommendedRoute ?? model.routes[0] ?? null;
  const total = model.landedCost.estimatedTotalUsd;
  const transit = recommendedRoute ? `${recommendedRoute.transitDays} days` : "N/A";
  const route = recommendedRoute ? escapeLatex(recommendedRoute.method) : "N/A";
  return `\\noindent
\\metriccard{Recommended route}{${route}}\\hfill\\metriccard{Estimated landed cost}{\\$${fmtUsd(total)}}\\\\[0.7em]
\\metriccard{Estimated transit}{${transit}}\\hfill\\metriccard{Confidence}{${escapeLatex(model.confidence)}}`;
}

function renderRiskSnapshot(model: ReportModel): string {
  const top = [...model.risks].sort((a, b) => b.score - a.score).slice(0, 3);
  if (top.length === 0) {
    return "\\panel{{\\sectionlabel{Risk Watchlist}}\\\\[0.35em]\\textit{No significant risks identified.}}";
  }
  const items = top.map((risk) =>
    `\\item \\textbf{${escapeLatex(risk.label)}} (${risk.score}/100) - ${escapeLatex(risk.actionable)}`,
  ).join("\n      ");
  return `\\panel{
    {\\sectionlabel{Risk Watchlist}}\\\\[0.35em]
    \\begin{itemize}
      ${items}
    \\end{itemize}
  }`;
}

function renderSourcesSection(model: ReportModel): string {
  if (model.sources.length === 0) {
    return "\\textbf{No external sources were cited.} Findings are based on internal knowledge and assumptions.";
  }
  const items = model.sources.map((s) => {
    const snippet = s.snippet
      ? `\\\\[2pt]\\reportfield{${escapeLatex(s.snippet.slice(0, 200))}}`
      : "";
    return `  \\item \\textbf{${escapeLatex(s.title)}} \\\\ \\url{${escapeLatex(s.url)}}${snippet}`;
  });
  return `\\begin{enumerate}[label={[\\arabic*]},ref={[\\arabic*]}]
    ${items.join("\n  ")}
  \\end{enumerate}`;
}

export async function renderLatex(model: ReportModel): Promise<string> {
  const templatePath = path.join(__dirname, "templates", "homelander-report.tex");
  const template = await fs.readFile(templatePath, "utf-8");

  const recommendedRoute = model.recommendedRoute ?? model.routes[0] ?? null;
  const shortId = model.reportId.slice(0, 8);

  const placeholders: Record<string, string> = {
    REPORT_TITLE: escapeLatex(`Trade Analysis: ${model.shipment.product}`),
    REPORT_ID: escapeLatex(model.reportId),
    REPORT_SHORT_ID: shortId,
    REPORT_VERSION: escapeLatex(model.version),
    DATA_MODE: model.dataMode === "live" ? "LIVE" : "MOCK",
    GENERATED_TIMESTAMP: escapeLatex(model.generatedAt),
    GENERATED_DATE: escapeLatex(model.generatedAt.slice(0, 10)),
    SHIPMENT_LANE: `${escapeLatex(model.shipment.origin)} -> ${escapeLatex(model.shipment.destination)}`,
    DECISION_PANEL: renderDecisionPanel(model),
    KPI_CARDS: renderKpiCards(model),
    RISK_SNAPSHOT: renderRiskSnapshot(model),
    ESTIMATED_COST: fmtUsd(recommendedRoute?.cost ?? 0),
    ESTIMATED_TRANSIT: String(recommendedRoute?.transitDays ?? "N/A"),
    SHIPMENT_TABLE: renderShipmentTable(model),
    ASSUMPTIONS_LIST: renderAssumptionsList(model),
    LIMITATIONS_LIST: renderLimitationsList(model),
    ROUTE_TABLE: renderRouteTable(model),
    ROUTE_CHART_SECTION: renderRouteComparisonChart(model),
    LANDED_COST_TABLE: renderLandedCostTable(model),
    TARIFF_SECTION: renderTariffSection(model),
    DOCUMENTS_TABLE: renderDocumentsTable(model),
    RISKS_TABLE: renderRisksTable(model),
    RISK_CHART_SECTION: renderRiskBarChart(model),
    COST_FORECAST_SECTION: renderCostForecastChart(model),
    DRIVER_TRENDS_SECTION: renderDriverCharts(model),
    DEPENDENCY_GRAPH_SECTION: renderDependencyGraph(model),
    PORT_COMPARISON_SECTION: renderPortComparison(model),
    SOURCES_SECTION: renderSourcesSection(model),
    FINAL_DISCLAIMER: escapeLatex(model.disclaimer),
  };

  let result = template;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
}
