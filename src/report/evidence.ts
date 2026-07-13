import type { ReportModel } from "./model.js";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function forecastDate(model: ReportModel, horizonDays: number): string {
  const parsed = Date.parse(model.generatedAt);
  const base = Number.isNaN(parsed) ? new Date() : new Date(parsed);
  const date = new Date(base);
  date.setDate(date.getDate() + horizonDays);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function renderEvidence(model: ReportModel): string {
  const lines: string[] = [];
  const rec = model.recommendedRoute ?? model.routes[0] ?? null;

  lines.push("=== HOMELANDER ANALYSIS EVIDENCE ===");
  lines.push("");

  // Claims
  lines.push("--- EXECUTIVE SUMMARY ---");
  lines.push(model.executiveSummary);
  lines.push("");

  // Shipment inputs
  lines.push("--- SHIPMENT INPUTS ---");
  lines.push(`Product: ${model.shipment.product}`);
  lines.push(`Origin: ${model.shipment.origin} -> Destination: ${model.shipment.destination}`);
  lines.push(`Weight: ${model.shipment.weightKg} kg`);
  if (model.shipment.quantity) lines.push(`Quantity: ${model.shipment.quantity}`);
  lines.push(`Ship date: ${model.shipment.shipDate}`);
  if (model.shipment.shippingMode) lines.push(`Shipping mode: ${model.shipment.shippingMode}`);
  if (model.shipment.pricePerKg) lines.push(`Price/kg: $${fmtUsd(model.shipment.pricePerKg)}`);
  lines.push(`Data mode: ${model.dataMode}`);
  if (model.shipment.containerSize) lines.push(`Container: ${model.shipment.containerSize}`);
  if (model.shipment.specialRequirements?.length) lines.push(`Special requirements: ${model.shipment.specialRequirements.join("; ")}`);
  if (model.shipment.locked?.length) lines.push(`Locked cost components: ${model.shipment.locked.join("; ")}`);
  lines.push("");

  // Assumptions
  lines.push("--- ASSUMPTIONS ---");
  for (const a of model.assumptions) lines.push(`- ${a}`);
  lines.push("");

  // Calculations
  lines.push("--- FINANCIAL CALCULATIONS ---");
  lines.push(`Goods value: $${fmtUsd(model.landedCost.goodsValueUsd)}`);
  lines.push(`Freight cost: $${fmtUsd(model.landedCost.estimatedFreightUsd)} (${rec ? rec.method : "N/A"})`);
  lines.push(`Duty amount: $${fmtUsd(model.landedCost.estimatedDutyUsd)} (${model.landedCost.totalDutyPct}% rate)`);
  lines.push(`Total landed cost: $${fmtUsd(model.landedCost.estimatedTotalUsd)}`);
  lines.push("");

  if (model.tariff) {
    lines.push("--- TARIFF, CUSTOMS, AND DOCUMENTS ---");
    lines.push(`HS code: ${model.tariff.hsCode || "Unconfirmed"}`);
    lines.push(`Origin/destination: ${model.tariff.originCountry} -> ${model.tariff.destinationCountry}`);
    lines.push(`Base duty: ${model.tariff.baseDutyPct}%`);
    for (const a of model.tariff.additional) lines.push(`Additional duty: ${a.name} ${a.ratePct}%`);
    lines.push(`Total duty: ${model.tariff.totalDutyPct}%`);
    lines.push(`Goods value basis: $${fmtUsd(model.tariff.goodsValueUsd)}`);
    lines.push(`Estimated duty: $${fmtUsd(model.tariff.estimatedDutyUsd)}`);
    if (model.tariff.notes) lines.push(`Notes: ${model.tariff.notes}`);
    for (const r of model.tariff.requirements) lines.push(`Requirement: ${r}`);
    for (const d of model.documents) lines.push(`Document: ${d.name}${d.url ? ` (${d.url})` : ""}`);
    lines.push("");
  }

  if (model.costForecasts.length > 0) {
    lines.push("--- COST FORECASTS ---");
    lines.push("Forecast dates are anchored to the report generation timestamp.");
    for (const c of model.costForecasts) {
      lines.push(
        `  ${c.horizonDays} days (${forecastDate(model, c.horizonDays)}): product ${c.productCostPct}%, freight ${c.freightCostPct}%, landed ${c.landedCostPct}%`,
      );
    }
    lines.push("");
  }

  // Route comparison
  lines.push("--- ROUTE COMPARISON ---");
  for (const r of model.routes) {
    const flag = r.recommended ? " [RECOMMENDED]" : "";
    lines.push(`  ${r.method}: $${fmtUsd(r.cost)}, ${r.transitDays} days transit${flag}`);
    if (r.note) lines.push(`    Note: ${r.note}`);
  }
  lines.push("");

  if (model.geo) {
    lines.push("--- ROUTE GEOGRAPHY ---");
    lines.push(`Origin: ${model.geo.origin.name} (${model.geo.origin.lat}, ${model.geo.origin.lng})`);
    lines.push(`Destination: ${model.geo.destination.name} (${model.geo.destination.lat}, ${model.geo.destination.lng})`);
    lines.push(`Distance: ${model.geo.distanceKm} km`);
    lines.push("");
  }

  if (model.portRecommendation || model.portOptions.length > 0) {
    lines.push("--- PORT RECOMMENDATION ---");
    lines.push(`Port price context: freight estimates shown for ${rec ? rec.method : "the selected route"}; congestion via Bright Data retrieval.`);
    if (model.portRecommendation) {
      lines.push(`Recommended: ${model.portRecommendation.recommended}`);
      lines.push(`Rationale: ${model.portRecommendation.rationale}`);
    }
    for (const p of model.portOptions) {
      lines.push(
        `  ${p.name}: congestion ${p.congestionScore}/100, wait ${p.waitDays}d, freight $${fmtUsd(p.freightCost)}${p.recommended ? " [RECOMMENDED]" : ""}`,
      );
      lines.push(`    Note: ${p.note}`);
      if (p.lat !== null && p.lng !== null) lines.push(`    Coordinates: ${p.lat}, ${p.lng}`);
      for (const s of p.sources) {
        lines.push(`    Source: ${s.title}`);
        if (s.snippet) lines.push(`      ${s.snippet}`);
      }
    }
    lines.push("");
  }

  if (model.risks.length > 0) {
    lines.push("--- RISKS ---");
    for (const r of model.risks) {
      lines.push(`  ${r.category} / ${r.label}: ${r.score}/100 (${r.trend})`);
      lines.push(`    Action: ${r.actionable}`);
      lines.push(`    Detail: ${r.detail}`);
      for (const finding of r.keyFindings) lines.push(`    Finding: ${finding}`);
      for (const s of r.sources) {
        lines.push(`    Source: ${s.title}`);
        lines.push(`      URL: ${s.url}`);
        if (s.snippet) lines.push(`      Snippet: ${s.snippet}`);
      }
    }
    lines.push("");
  }

  if (model.actionPlan.length > 0) {
    lines.push("--- ACTION PLAN ---");
    for (const a of model.actionPlan) {
      lines.push(`  ${a.urgency.toUpperCase()} | ${a.deadline} | ${a.dueDate ?? "No date"} | ${a.category}`);
      lines.push(`    Action: ${a.action}`);
      lines.push(`    Why: ${a.why}`);
    }
    lines.push("");
  }

  if (model.drivers.length > 0) {
    lines.push("--- SUPPLY-CHAIN DRIVERS ---");
    for (const d of model.drivers) {
      lines.push(
        `  ${d.name}: current ${formatDriverValue(d.current, d.unit)}, ${d.changePct}% change, ${d.impact} impact, ${d.priceLive ? "live" : "estimated"}`,
      );
      lines.push(`    Affects: ${d.affects}`);
      lines.push(`    Forecast: ${d.forecastPct}%${d.forecastNote ? ` - ${d.forecastNote}` : ""}`);
      const observed = d.series
        .filter((p) => p.v !== null)
        .map((p) => `${p.t}=${formatDriverValue(p.v, d.unit)}`)
        .join("; ");
      const forecast = d.series
        .filter((p) => p.f !== null && p.f !== undefined)
        .map((p) => `${p.t}=${formatDriverValue(p.f ?? null, d.unit)}`)
        .join("; ");
      lines.push(`    Observed history: ${observed || "Unavailable"}`);
      lines.push(`    Forecast points: ${forecast || "Unavailable"}`);
      for (const s of d.sources) {
        lines.push(`    Source: ${s.title}`);
        if (s.snippet) lines.push(`      ${s.snippet}`);
      }
    }
    lines.push("");
  }

  if (model.news.length > 0) {
    lines.push("--- NEWS INTELLIGENCE ---");
    for (const s of model.news) {
      lines.push(`  - ${s.title}`);
      lines.push(`    URL: ${s.url}`);
      if (s.snippet) lines.push(`    Snippet: ${s.snippet}`);
    }
    lines.push("");
  }

  if (model.searches.length > 0) {
    lines.push("--- SEARCH LOG ---");
    for (const s of model.searches) {
      lines.push(`  ${s.agent}: ${s.query} (${s.results} results, ${s.mode.toUpperCase()})`);
    }
    lines.push("");
  }

  // Sources
  if (model.sources.length > 0) {
    lines.push("--- SOURCES ---");
    for (const s of model.sources) {
      lines.push(`  - ${s.title}`);
      lines.push(`    Category: ${s.category}`);
      lines.push(`    Retrieved: ${s.retrievedAt}`);
      lines.push(`    URL: ${s.url}`);
      if (s.snippet) lines.push(`    Snippet: ${s.snippet}`);
    }
    lines.push("");
  }

  // Confidence / limitations
  lines.push("--- CONFIDENCE ---");
  lines.push(model.confidence);
  lines.push(`Data mode: ${model.dataMode.toUpperCase()}`);
  lines.push(`Generated at: ${model.generatedAt}`);
  lines.push(`Cited sources: ${model.sources.length}`);
  lines.push(`Searches: ${model.searches.length}`);
  lines.push(`Returned source records: ${model.searches.reduce((sum, s) => sum + s.results, 0)}`);
  lines.push(`Sourced risk factors: ${model.risks.filter((r) => r.sources.length > 0).length}/${model.risks.length}`);
  lines.push(`Live driver prices: ${model.drivers.filter((d) => d.priceLive).length}/${model.drivers.length}`);
  lines.push(`Tariff source records: ${model.tariff?.sources.length ?? 0}`);
  lines.push("");

  lines.push("--- LIMITATIONS ---");
  for (const l of model.limitations) lines.push(`- ${l}`);
  lines.push("");

  lines.push("--- OPEN QUESTIONS ---");
  for (const q of model.openQuestions) lines.push(`- ${q}`);
  lines.push("");

  // Human-verification warning
  lines.push("=== HUMAN-VERIFICATION WARNING ===");
  lines.push(model.disclaimer);
  lines.push("");

  return normalizeEvidenceText(lines.join("\n"));
}

function formatDriverValue(value: number | null, unit: string): string {
  if (value === null) return "Unavailable";
  return `${value.toLocaleString("en-US")} ${unit}`;
}

function normalizeEvidenceText(text: string): string {
  return text
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/↔/g, "<->")
    .replace(/[—–‑−]/g, "-")
    .replace(/•/g, "-")
    .replace(/★/g, "*")
    .replace(/…/g, "...")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\u00A0/g, " ");
}
