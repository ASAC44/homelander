import type { ReportModel } from "./model.js";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function renderEvidence(model: ReportModel): string {
  const lines: string[] = [];
  const rec = model.recommendedRoute ?? model.routes[0] ?? null;

  lines.push("=== TRANSTITRA ANALYSIS EVIDENCE ===");
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
  lines.push("");

  // Assumptions
  lines.push("--- ASSUMPTIONS ---");
  for (const a of model.assumptions) lines.push(`• ${a}`);
  lines.push("");

  // Calculations
  lines.push("--- FINANCIAL CALCULATIONS ---");
  lines.push(`Goods value: $${fmtUsd(model.landedCost.goodsValueUsd)}`);
  lines.push(`Freight cost: $${fmtUsd(model.landedCost.estimatedFreightUsd)} (${rec ? rec.method : "N/A"})`);
  lines.push(`Duty amount: $${fmtUsd(model.landedCost.estimatedDutyUsd)} (${model.landedCost.totalDutyPct}% rate)`);
  lines.push(`Total landed cost: $${fmtUsd(model.landedCost.estimatedTotalUsd)}`);
  lines.push("");

  // Route comparison
  lines.push("--- ROUTE COMPARISON ---");
  for (const r of model.routes) {
    const flag = r.recommended ? " ★RECOMMENDED" : "";
    lines.push(`  ${r.method}: $${fmtUsd(r.cost)}, ${r.transitDays} days transit${flag}`);
    if (r.note) lines.push(`    Note: ${r.note}`);
  }
  lines.push("");

  // Sources
  if (model.sources.length > 0) {
    lines.push("--- SOURCES ---");
    for (const s of model.sources) {
      lines.push(`  • ${s.title}`);
      lines.push(`    URL: ${s.url}`);
      if (s.snippet) lines.push(`    Snippet: ${s.snippet.slice(0, 300)}`);
    }
    lines.push("");
  }

  // Confidence / limitations
  lines.push("--- CONFIDENCE ---");
  lines.push(model.confidence);
  lines.push("");

  lines.push("--- LIMITATIONS ---");
  for (const l of model.limitations) lines.push(`• ${l}`);
  lines.push("");

  // Human-verification warning
  lines.push("=== HUMAN-VERIFICATION WARNING ===");
  lines.push(model.disclaimer);
  lines.push("");

  return lines.join("\n");
}
