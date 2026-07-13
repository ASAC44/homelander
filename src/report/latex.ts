import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReportModel } from "./model.js";
import { escapeLatex } from "./escape.js";
import {
  renderCostForecastChart,
  renderLandedCostBreakdownChart,
  renderMaterialExposureChart,
  renderRiskBarChart,
  renderRiskScoreMeter,
  renderRouteMapSketch,
  renderRouteComparisonChart,
  renderDriverCharts,
  renderDependencyGraph,
  renderPortComparison,
} from "./charts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}\\%`;
}

function latexParagraphs(text: string): string {
  return escapeLatex(text)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
}

function riskLevel(score: number): string {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function riskLatex(score: number): string {
  if (score >= 70) return "\\textcolor{riskred}{High}";
  if (score >= 40) return "\\textcolor{riskamber}{Medium}";
  return "\\textcolor{riskgreen}{Low}";
}

function severityLatex(severity: "high" | "medium" | "low"): string {
  if (severity === "high") return "\\textcolor{riskred}{High}";
  if (severity === "medium") return "\\textcolor{riskamber}{Medium}";
  return "\\textcolor{riskgreen}{Low}";
}

function trendLatex(trend: "up" | "down" | "flat"): string {
  if (trend === "up") return "\\textcolor{riskred}{Up}";
  if (trend === "down") return "\\textcolor{riskgreen}{Down}";
  return "\\textcolor{metatext}{Flat}";
}

function categoryLabel(category: string): string {
  return category
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function listItems(items: string[]): string {
  if (items.length === 0) return "  \\item None identified.";
  return items.map((item) => `  \\item ${escapeLatex(item)}`).join("\n");
}

function parseShipDate(s: string): Date | null {
  if (!s) return null;
  const direct = Date.parse(s);
  if (!Number.isNaN(direct)) return new Date(direct);
  const monthYear = s.match(/([A-Za-z]+)\s+(\d{4})/);
  if (monthYear) {
    const parsed = Date.parse(`${monthYear[1]} 1, ${monthYear[2]}`);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  return null;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function forecastAnchorDate(model: ReportModel): Date {
  const parsed = Date.parse(model.generatedAt);
  return Number.isNaN(parsed) ? new Date() : new Date(parsed);
}

function forecastDate(model: ReportModel, horizonDays: number): string {
  return fmtDate(addDays(forecastAnchorDate(model), horizonDays));
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
  if (model.landedCost.goodsValueUsd > 0) rows.push(`\\textbf{Estimated goods value} & \\$${fmtUsd(model.landedCost.goodsValueUsd)} \\\\`);
  if (s.specialRequirements?.length) {
    rows.push(`\\textbf{Special requirements} & ${escapeLatex(s.specialRequirements.join("; "))} \\\\`);
  }
  if (s.locked?.length) {
    rows.push(`\\rowcolor{warmpanel}\\textbf{Locked cost components} & ${escapeLatex(s.locked.join("; "))} \\\\`);
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

function renderOpenQuestionsList(model: ReportModel): string {
  return `\\begin{itemize}
${listItems(model.openQuestions)}
\\end{itemize}`;
}

function renderDataQualitySection(model: ReportModel): string {
  const returnedSources = model.searches.reduce((sum, s) => sum + s.results, 0);
  const sourcedRisks = model.risks.filter((r) => r.sources.length > 0).length;
  const liveDrivers = model.drivers.filter((d) => d.priceLive).length;
  const tariffSources = model.tariff?.sources.length ?? 0;
  const sourceCategories = new Map<string, number>();
  for (const source of model.sources) {
    sourceCategories.set(source.category, (sourceCategories.get(source.category) ?? 0) + 1);
  }
  const categorySummary = [...sourceCategories.entries()]
    .map(([category, count]) => `${category}: ${count}`)
    .join("; ") || "No cited source categories.";

  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.24\\textwidth}X}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Overall confidence} & ${escapeLatex(model.confidence)} \\\\
    \\rowcolor{warmpanel}\\textbf{Generated at} & ${escapeLatex(model.generatedAt)} \\\\
    \\textbf{Search coverage} & ${model.searches.length} searches; ${returnedSources} returned source records \\\\
    \\rowcolor{warmpanel}\\textbf{Cited source records} & ${model.sources.length} unique cited sources \\\\
    \\textbf{Risk source coverage} & ${sourcedRisks}/${model.risks.length} risk factors include supporting sources \\\\
    \\rowcolor{warmpanel}\\textbf{Driver price coverage} & ${liveDrivers}/${model.drivers.length} live driver prices; remaining values are estimated/fallback data \\\\
    \\textbf{Tariff source records} & ${tariffSources} tariff/customs source records \\\\
    \\rowcolor{warmpanel}\\textbf{Source categories} & ${escapeLatex(categorySummary)} \\\\
    \\bottomrule
  \\end{tabularx}`;
}

function renderRouteTable(model: ReportModel): string {
  const rows = model.routes.map((r) => {
    const flag = r.recommended ? " (Recommended)" : "";
    return `${escapeLatex(r.method)}${flag} & \\$${fmtUsd(r.cost)} & ${r.transitDays} days & ${escapeLatex(r.note)} \\\\`;
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
  const perUnit = model.shipment.quantity && model.shipment.quantity > 0
    ? `\\$${fmtUsd(lc.estimatedTotalUsd / model.shipment.quantity)}`
    : "Unavailable";
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
    \\textbf{Per-unit landed cost} & Based on provided quantity, if available & \\textbf{${perUnit}} \\\\
    \\bottomrule
  \\end{tabularx}`;
}

function renderCostExposurePanel(model: ReportModel): string {
  const locked = model.shipment.locked ?? [];
  const goodsLocked = locked.includes("Goods");
  const freightLocked = locked.includes("Freight");
  const lastForecast = model.costForecasts[model.costForecasts.length - 1];
  let exposurePct = model.expectedCostIncreasePct;
  let exposureLabel = "landed cost, 90-day horizon";
  let explanation = "How much more the delivered landed cost could rise if price or freight is not locked before the ship date.";

  if (locked.length > 0) {
    if (goodsLocked && freightLocked) {
      exposurePct = 0;
      exposureLabel = "goods and freight locked";
      explanation = "Goods and freight are marked locked, so the delivered cost exposure is fixed in this model. The forecast remains useful as market context.";
    } else if (goodsLocked) {
      exposurePct = lastForecast?.freightCostPct ?? exposurePct;
      exposureLabel = "freight exposure because goods are locked";
      explanation = "Goods are marked locked, so the remaining cost movement is freight exposure.";
    } else if (freightLocked) {
      exposurePct = lastForecast?.productCostPct ?? exposurePct;
      exposureLabel = "goods exposure because freight is locked";
      explanation = "Freight is marked locked, so the remaining cost movement is product and input-cost exposure.";
    } else {
      exposureLabel = "open landed-cost exposure";
    }
  }

  return `\\softpanel{
    {\\sectionlabel{Cost Exposure by Ship Date}}\\\\[0.25em]
    {\\Large\\bfseries ${fmtPct(exposurePct)}} \\quad ${escapeLatex(exposureLabel)}\\\\[0.35em]
    ${escapeLatex(explanation)}
  }`;
}

function renderTransitImpact(model: ReportModel): string {
  const route = model.recommendedRoute ?? model.routes[0] ?? null;
  if (!route) return "\\textit{No transit route was generated.}";
  const [delayLo, delayHi] = model.expectedDelayDays;
  const start = parseShipDate(model.shipment.shipDate);
  const arrival = start
    ? `${fmtDate(addDays(start, route.transitDays + delayLo))} - ${fmtDate(addDays(start, route.transitDays + delayHi))}`
    : "Unavailable - ship date was not parseable";
  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.24\\textwidth}X}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Selected route} & ${escapeLatex(route.method)} \\\\
    \\textbf{Base freight cost} & \\$${fmtUsd(route.cost)} \\\\
    \\rowcolor{warmpanel}\\textbf{Base transit} & ${route.transitDays} days \\\\
    \\textbf{Risk delay} & +${delayLo}-${delayHi} days \\\\
    \\rowcolor{warmpanel}\\textbf{Door-to-door range} & ${route.transitDays + delayLo}-${route.transitDays + delayHi} days \\\\
    \\textbf{Estimated arrival window} & ${escapeLatex(arrival)} \\\\
    \\rowcolor{warmpanel}\\textbf{Route note} & ${escapeLatex(route.note)} \\\\
    \\bottomrule
  \\end{tabularx}`;
}

function renderPortRecommendationSection(model: ReportModel): string {
  if (!model.portRecommendation) {
    return "\\textit{No AI port recommendation was generated.}";
  }
  const recommended = model.portOptions.find((p) => p.recommended);
  const selectedRoute = model.recommendedRoute ?? model.routes.find((r) => r.recommended) ?? model.routes[0] ?? null;
  const sourceCount = model.portOptions.reduce((sum, p) => sum + p.sources.length, 0);
  const metrics = recommended
    ? ` Recommended port metrics: congestion ${recommended.congestionScore}/100, wait about ${recommended.waitDays} days, estimated freight \\$${fmtUsd(recommended.freightCost)}.`
    : "";
  const priceContext = selectedRoute
    ? `Port prices shown for ${selectedRoute.method}; congestion via Bright Data.`
    : "Port prices shown for the selected route; congestion via Bright Data.";
  return `\\softpanel{
    {\\sectionlabel{AI Port Recommendation}}\\\\[0.25em]
    Recommended entry port: {\\bfseries ${escapeLatex(model.portRecommendation.recommended)}}\\\\[0.35em]
    ${escapeLatex(model.portRecommendation.rationale)}${metrics}\\\\[0.35em]
    \\reportfield{${escapeLatex(priceContext)}}\\\\[0.2em]
    \\reportfield{Port intelligence sources attached: ${sourceCount}}
  }`;
}

function renderCommodityTable(model: ReportModel): string {
  const hs = model.commodity.hsCodes.length ? model.commodity.hsCodes.join(", ") : "Unconfirmed";
  const materials = model.commodity.materials.length
    ? model.commodity.materials.map((m) => `${m.material} ${m.pct}%`).join("; ")
    : "Unavailable";
  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.28\\textwidth}X}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Product category} & ${escapeLatex(model.commodity.productCategory)} \\\\
    \\textbf{Candidate HS codes} & ${escapeLatex(hs)} \\\\
    \\rowcolor{warmpanel}\\textbf{Material exposure} & ${escapeLatex(materials)} \\\\
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
  const evidence = t.sources.length
    ? `\\vspace{0.7em}
  \\noindent\\textbf{Tariff and customs evidence}
  \\vspace{0.3em}

  ${renderSourceEvidenceTable(t.sources)}`
    : "\\vspace{0.7em}\\noindent\\textit{No tariff-specific source excerpts were attached.}";

  return `\\begin{tabularx}{\\textwidth}{lX}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}HS Code & \\texttt{${escapeLatex(t.hsCode)}} \\\\
    Origin & ${escapeLatex(t.originCountry)} \\\\
    \\rowcolor{warmpanel}Destination & ${escapeLatex(t.destinationCountry)} \\\\
    Base duty rate & ${t.baseDutyPct}\\% \\\\
    \\rowcolor{warmpanel}Total duty rate & ${t.totalDutyPct}\\% \\\\
    Estimated duty amount & \\$${fmtUsd(model.landedCost.estimatedDutyUsd)} \\\\
    Goods value basis & \\$${fmtUsd(t.goodsValueUsd || model.landedCost.goodsValueUsd)} \\\\
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

  \\vspace{0.7em}
  \\noindent\\textbf{Compliance requirements}
  \\begin{itemize}
${listItems(t.requirements)}
  \\end{itemize}

  ${t.notes ? `\\vspace{0.5em}\\noindent\\textbf{Notes and verification warning:} ${escapeLatex(t.notes)}` : ""}

  ${evidence}`;
}

function renderSourceEvidenceTable(sources: ReportModel["sources"]): string {
  const rows = sources.map((s) =>
    `${escapeLatex(s.title)} & ${escapeLatex(s.snippet ?? "No excerpt available.")} & ${escapeLatex(s.retrievedAt)} \\\\`,
  );
  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.28\\textwidth}X>{\\raggedright\\arraybackslash}p{0.21\\textwidth}}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Source} & \\textbf{Excerpt} & \\textbf{Retrieved} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}`;
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
  const findings = r.keyFindings.length > 0
    ? r.keyFindings.map((f) => escapeLatex(f)).join("; ")
    : escapeLatex(r.detail);
  return `${escapeLatex(categoryLabel(r.category))} & ${escapeLatex(r.label)} & ${r.score}/100 & ${riskLatex(r.score)} & ${trendLatex(r.trend)} & ${findings} \\\\`;
}

function renderRisksTable(model: ReportModel): string {
  if (model.risks.length === 0) {
    return "\\textbf{No significant risks identified.}";
  }
  const sorted = [...model.risks].sort((a, b) => b.score - a.score);
  const rows = sorted.map(renderRiskRow);
  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.13\\textwidth}>{\\raggedright\\arraybackslash}p{0.17\\textwidth} c c c X}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Category} & \\textbf{Risk} & \\textbf{Score} & \\textbf{Level} & \\textbf{Trend} & \\textbf{Findings} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}`;
}

function renderDecisionPanel(model: ReportModel): string {
  const firstSentence = model.executiveSummary.split(".")[0] + ".";
  return `\\panel{
    {\\sectionlabel{Decision Summary}}\\\\[0.35em]
    {\\Large\\bfseries ${escapeLatex(firstSentence)}}\\\\[0.55em]
    ${latexParagraphs(model.executiveSummary === firstSentence ? "" : model.executiveSummary)}
  }`;
}

function renderKpiCards(model: ReportModel): string {
  const recommendedRoute = model.recommendedRoute ?? model.routes[0] ?? null;
  const total = model.landedCost.estimatedTotalUsd;
  const transit = recommendedRoute ? `${recommendedRoute.transitDays} days` : "N/A";
  const route = recommendedRoute ? escapeLatex(recommendedRoute.method) : "N/A";
  const delay = `${model.expectedDelayDays[0]}-${model.expectedDelayDays[1]} days`;
  const exposure = fmtPct(model.expectedCostIncreasePct);
  return `\\noindent
\\metriccard{Recommended route}{${route}}\\hfill\\metriccard{Estimated landed cost}{\\$${fmtUsd(total)}}\\\\[0.65em]
\\metriccard{Base transit}{${transit}}\\hfill\\metriccard{Risk delay}{${delay}}\\\\[0.65em]
\\metriccard{90-day exposure}{${exposure}}\\hfill\\metriccard{Confidence}{${escapeLatex(model.confidence)}}`;
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
    ${renderRiskScoreMeter(model)}\\\\[1em]
    \\reportfield{Overall risk level: ${riskLevel(model.riskScore)} risk.}\\\\[0.45em]
    \\begin{itemize}
      ${items}
    \\end{itemize}
  }`;
}

function renderExecutiveActions(model: ReportModel): string {
  const actions = model.recommendations;
  if (actions.length === 0) {
    return "\\textit{No recommendations were generated.}";
  }
  return `\\begin{itemize}
${actions.map((r) => `  \\item \\textbf{${escapeLatex(r.action)}} - ${escapeLatex(r.rationale)}`).join("\n")}
\\end{itemize}`;
}

function renderAlertsSection(model: ReportModel): string {
  if (model.alerts.length === 0) {
    return "\\textit{No critical alerts were generated.}";
  }
  const rows = model.alerts.map((a) =>
    `${severityLatex(a.severity)} & ${escapeLatex(a.title)} & ${escapeLatex(a.impact)} \\\\`,
  );
  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.16\\textwidth}>{\\raggedright\\arraybackslash}p{0.27\\textwidth}X}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Severity} & \\textbf{Alert} & \\textbf{Impact} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}`;
}

function renderActionPlan(model: ReportModel): string {
  if (model.actionPlan.length === 0) {
    return "\\textit{No action plan was generated.}";
  }
  const rows = model.actionPlan.map((a) =>
    `${severityLatex(a.urgency)} & ${escapeLatex(a.deadline)} & ${escapeLatex(a.dueDate ?? "No date")} / ${escapeLatex(a.category)} & ${escapeLatex(a.action)} & ${escapeLatex(a.why)} \\\\`,
  );
  return `\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.1\\textwidth}>{\\raggedright\\arraybackslash}p{0.14\\textwidth}>{\\raggedright\\arraybackslash}p{0.16\\textwidth}>{\\raggedright\\arraybackslash}p{0.25\\textwidth}>{\\raggedright\\arraybackslash}p{0.25\\textwidth}}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Urgency} & \\textbf{Deadline} & \\textbf{Due / Category} & \\textbf{Action} & \\textbf{Why it matters} \\\\
    \\midrule
    \\endfirsthead
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Urgency} & \\textbf{Deadline} & \\textbf{Due / Category} & \\textbf{Action} & \\textbf{Why it matters} \\\\
    \\midrule
    \\endhead
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{longtable}`;
}

function renderCostForecastTable(model: ReportModel): string {
  if (model.costForecasts.length === 0) {
    return "\\textit{No numeric cost forecast table was generated.}";
  }
  const rows = model.costForecasts.map((c) =>
    `${c.horizonDays} days & ${escapeLatex(forecastDate(model, c.horizonDays))} & ${fmtPct(c.productCostPct)} & ${fmtPct(c.freightCostPct)} & ${fmtPct(c.landedCostPct)} \\\\`,
  );
  return `\\reportfield{Forecast dates are anchored to the report generation timestamp.}

  \\vspace{0.25em}
  \\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.13\\textwidth}>{\\raggedright\\arraybackslash}p{0.2\\textwidth}rrr}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Horizon} & \\textbf{Forecast date} & \\textbf{Product} & \\textbf{Freight} & \\textbf{Landed} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}`;
}

function renderRiskSourceExcerpts(model: ReportModel): string {
  const rows = [...model.risks]
    .sort((a, b) => b.score - a.score)
    .flatMap((risk) =>
      risk.sources.map((source) =>
        `${escapeLatex(risk.label)} & ${escapeLatex(source.title)} & ${escapeLatex(source.snippet ?? "No excerpt available.")} \\\\`,
      ),
    );
  if (rows.length === 0) {
    return "\\textit{No risk source excerpts were attached.}";
  }
  return `\\vspace{0.7em}
\\noindent\\textbf{Risk source excerpts by factor}

\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.2\\textwidth}>{\\raggedright\\arraybackslash}p{0.29\\textwidth}>{\\raggedright\\arraybackslash}p{0.43\\textwidth}}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Risk} & \\textbf{Source} & \\textbf{Excerpt} \\\\
    \\midrule
    \\endfirsthead
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Risk} & \\textbf{Source} & \\textbf{Excerpt} \\\\
    \\midrule
    \\endhead
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{longtable}`;
}

function renderRiskDetails(model: ReportModel): string {
  if (model.risks.length === 0) return "\\textit{No risk detail available.}";
  const sections = [...model.risks].sort((a, b) => b.score - a.score).map((r) => {
    const findings = r.keyFindings.length
      ? `\\begin{itemize}\n${listItems(r.keyFindings)}\n\\end{itemize}`
      : "";
    const sources = r.sources.length
      ? `\\reportfield{Sources: ${r.sources.map((s) => escapeLatex(s.title)).join("; ")}}`
      : "\\reportfield{No supporting source attached to this risk factor.}";
    return `\\riskdetail{${escapeLatex(r.label)}}{${escapeLatex(categoryLabel(r.category))} - ${r.score}/100 ${riskLevel(r.score)}}{${trendLatex(r.trend)}}{
\\textbf{Action:} ${escapeLatex(r.actionable)}

\\vspace{0.35em}
${escapeLatex(r.detail)}

${findings}
${sources}
}`;
  });
  return `${sections.join("\n\n")}

${renderRiskSourceExcerpts(model)}`;
}

function renderNewsSection(model: ReportModel): string {
  if (model.news.length === 0) {
    return "\\textit{No news intelligence sources were returned.}";
  }
  const items = model.news.map((s) => {
    const snippet = s.snippet ? `\\\\[1pt]{\\small\\textcolor{metatext}{${escapeLatex(s.snippet)}}}` : "";
    return `\\item \\textbf{${escapeLatex(s.title)}} ${snippet}\\\\{\\footnotesize\\url{${escapeLatex(s.url)}}}`;
  });
  return `\\begin{enumerate}[label={[N\\arabic*]},leftmargin=*]
${items.join("\n")}
\\end{enumerate}`;
}

function renderSearchLog(model: ReportModel): string {
  if (model.searches.length === 0) {
    return "\\textit{No search log was recorded.}";
  }
  const totalResults = model.searches.reduce((sum, s) => sum + s.results, 0);
  const rows = model.searches.map((s) =>
    `${escapeLatex(s.agent)} & ${escapeLatex(s.query)} & ${s.results} & ${s.mode === "live" ? "LIVE" : "ESTIMATED"} \\\\`,
  );
  return `\\reportfield{${model.searches.length} searches; ${totalResults} returned source records.}\\\\[0.2em]
\\reportfield{Each row records a Bright Data search\\_engine query, the responsible agent, returned result count, and retrieval status.}

\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.23\\textwidth}>{\\raggedright\\arraybackslash}p{0.52\\textwidth}cc}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Agent} & \\textbf{Query} & \\textbf{Results} & \\textbf{Mode} \\\\
    \\midrule
    \\endfirsthead
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Agent} & \\textbf{Query} & \\textbf{Results} & \\textbf{Mode} \\\\
    \\midrule
    \\endhead
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{longtable}`;
}

function renderSourcesSection(model: ReportModel): string {
  if (model.sources.length === 0) {
    return "\\textbf{No external sources were cited.} Findings are based on internal knowledge and assumptions.";
  }
  const items = model.sources.map((s) => {
    const snippet = s.snippet
      ? `\\\\[2pt]\\reportfield{${escapeLatex(s.snippet)}}`
      : "";
    return `  \\item \\textbf{${escapeLatex(s.title)}} \\\\
      \\reportfield{${escapeLatex(s.category)} | retrieved ${escapeLatex(s.retrievedAt)}}\\\\
      \\url{${escapeLatex(s.url)}}${snippet}`;
  });
  return `\\begin{enumerate}[label={[\\arabic*]},ref={[\\arabic*]}]
    ${items.join("\n  ")}
  \\end{enumerate}`;
}

function renderDriverSourceDetail(model: ReportModel): string {
  if (model.drivers.length === 0) {
    return "\\textit{No driver-source detail was generated.}";
  }
  const rows = model.drivers.map((d) => {
    const sources = d.sources.length
      ? d.sources.map((s) => `${s.title}${s.snippet ? ` - ${s.snippet}` : ""}`).join("; ")
      : "No attached driver sources";
    return `${escapeLatex(d.name)} & ${escapeLatex(d.affects)} & ${escapeLatex(d.forecastNote || "Forecast rationale unavailable.")} & ${escapeLatex(sources)} \\\\`;
  });
  return `\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.17\\textwidth}>{\\raggedright\\arraybackslash}p{0.18\\textwidth}>{\\raggedright\\arraybackslash}p{0.25\\textwidth}>{\\raggedright\\arraybackslash}p{0.31\\textwidth}}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Driver} & \\textbf{Affects} & \\textbf{Forecast note} & \\textbf{Sources and excerpts} \\\\
    \\midrule
    \\endfirsthead
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Driver} & \\textbf{Affects} & \\textbf{Forecast note} & \\textbf{Sources and excerpts} \\\\
    \\midrule
    \\endhead
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{longtable}`;
}

function renderDriverSeriesDetail(model: ReportModel): string {
  if (model.drivers.length === 0) {
    return "\\textit{No driver time-series data was generated.}";
  }
  const rows = model.drivers.map((d) => {
    const observed = d.series
      .filter((p) => p.v !== null)
      .map((p) => `${p.t}: ${formatDriverValue(p.v, d.unit)}`)
      .join("; ");
    const forecast = d.series
      .filter((p) => p.f !== null && p.f !== undefined)
      .map((p) => `${p.t}: ${formatDriverValue(p.f ?? null, d.unit)}`)
      .join("; ");
    const meta = `${d.impact} impact; ${d.priceLive ? "live" : "estimated"} price; ${d.trend} trend; current ${formatDriverValue(d.current, d.unit)}; forecast ${d.forecastPct > 0 ? "+" : ""}${d.forecastPct}%`;
    return `${escapeLatex(d.name)} & ${escapeLatex(meta)} & ${escapeLatex(observed || "Unavailable")} & ${escapeLatex(forecast || "Unavailable")} \\\\`;
  });
  return `\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.16\\textwidth}>{\\raggedright\\arraybackslash}p{0.22\\textwidth}>{\\raggedright\\arraybackslash}p{0.31\\textwidth}>{\\raggedright\\arraybackslash}p{0.21\\textwidth}}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Driver} & \\textbf{Status} & \\textbf{Observed history} & \\textbf{Forecast points} \\\\
    \\midrule
    \\endfirsthead
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Driver} & \\textbf{Status} & \\textbf{Observed history} & \\textbf{Forecast points} \\\\
    \\midrule
    \\endhead
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{longtable}`;
}

function formatDriverValue(value: number | null, unit: string): string {
  if (value === null) return "Unavailable";
  return `${value.toLocaleString("en-US")} ${unit}`;
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
    GENERATED_TIMESTAMP: escapeLatex(model.generatedAt),
    GENERATED_DATE: escapeLatex(model.generatedAt.slice(0, 10)),
    SHIPMENT_LANE: `${escapeLatex(model.shipment.origin)} -> ${escapeLatex(model.shipment.destination)}`,
    DECISION_PANEL: renderDecisionPanel(model),
    KPI_CARDS: renderKpiCards(model),
    RISK_SNAPSHOT: renderRiskSnapshot(model),
    EXECUTIVE_ACTIONS_SECTION: renderExecutiveActions(model),
    ALERTS_SECTION: renderAlertsSection(model),
    ACTION_PLAN_SECTION: renderActionPlan(model),
    ESTIMATED_COST: fmtUsd(recommendedRoute?.cost ?? 0),
    ESTIMATED_TRANSIT: String(recommendedRoute?.transitDays ?? "N/A"),
    SHIPMENT_TABLE: renderShipmentTable(model),
    ASSUMPTIONS_LIST: renderAssumptionsList(model),
    LIMITATIONS_LIST: renderLimitationsList(model),
    OPEN_QUESTIONS_LIST: renderOpenQuestionsList(model),
    DATA_QUALITY_SECTION: renderDataQualitySection(model),
    COMMODITY_TABLE: renderCommodityTable(model),
    MATERIAL_CHART_SECTION: renderMaterialExposureChart(model),
    ROUTE_MAP_SECTION: renderRouteMapSketch(model),
    TRANSIT_IMPACT_SECTION: renderTransitImpact(model),
    ROUTE_TABLE: renderRouteTable(model),
    ROUTE_CHART_SECTION: renderRouteComparisonChart(model),
    PORT_RECOMMENDATION_SECTION: renderPortRecommendationSection(model),
    LANDED_COST_TABLE: renderLandedCostTable(model),
    COST_EXPOSURE_PANEL: renderCostExposurePanel(model),
    LANDED_COST_CHART_SECTION: renderLandedCostBreakdownChart(model),
    COST_FORECAST_TABLE: renderCostForecastTable(model),
    TARIFF_SECTION: renderTariffSection(model),
    DOCUMENTS_TABLE: renderDocumentsTable(model),
    RISKS_TABLE: renderRisksTable(model),
    RISK_CHART_SECTION: renderRiskBarChart(model),
    RISK_DETAILS_SECTION: renderRiskDetails(model),
    COST_FORECAST_SECTION: renderCostForecastChart(model),
    DRIVER_TRENDS_SECTION: renderDriverCharts(model),
    DEPENDENCY_GRAPH_SECTION: renderDependencyGraph(model),
    DRIVER_SERIES_DETAIL_SECTION: renderDriverSeriesDetail(model),
    DRIVER_SOURCE_DETAIL_SECTION: renderDriverSourceDetail(model),
    PORT_COMPARISON_SECTION: renderPortComparison(model),
    NEWS_SECTION: renderNewsSection(model),
    SEARCH_LOG_SECTION: renderSearchLog(model),
    SOURCES_SECTION: renderSourcesSection(model),
    FINAL_DISCLAIMER: escapeLatex(model.disclaimer),
  };

  let result = template;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
}
