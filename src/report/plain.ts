import type { ReportModel } from "./model.js";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function renderPlainReport(model: ReportModel): string {
  const rec = model.recommendedRoute ?? model.routes[0] ?? null;
  const topRisks = [...model.risks].sort((a, b) => b.score - a.score).slice(0, 5);
  const topSources = model.sources.slice(0, 6);

  const lines: string[] = [
    "# Executive Summary",
    model.executiveSummary,
    "",
    "# Decision Snapshot",
    `Recommendation: ${rec ? rec.method : "Unavailable"}`,
    `Estimated landed cost: $${fmtUsd(model.landedCost.estimatedTotalUsd)}`,
    `Estimated transit: ${rec ? `${rec.transitDays} days` : "N/A"}`,
    `Confidence: ${model.confidence}`,
    "",
    "# Shipment Snapshot",
    `Product: ${model.shipment.product}`,
    `Origin: ${model.shipment.origin}`,
    `Destination: ${model.shipment.destination}`,
    `Weight: ${model.shipment.weightKg} kg`,
    `Ship date: ${model.shipment.shipDate}`,
  ];

  if (model.shipment.quantity) lines.push(`Quantity: ${model.shipment.quantity}`);
  if (model.shipment.shippingMode) lines.push(`Shipping mode: ${model.shipment.shippingMode}`);
  if (model.shipment.containerSize) lines.push(`Container: ${model.shipment.containerSize}`);
  if (model.shipment.pricePerKg) lines.push(`Price per kg: $${fmtUsd(model.shipment.pricePerKg)}`);

  lines.push(
    "",
    "# Landed Cost",
    `Goods value: $${fmtUsd(model.landedCost.goodsValueUsd)}`,
    `Freight: $${fmtUsd(model.landedCost.estimatedFreightUsd)}`,
    `Duty: $${fmtUsd(model.landedCost.estimatedDutyUsd)} (${model.landedCost.totalDutyPct}%)`,
    `Total: $${fmtUsd(model.landedCost.estimatedTotalUsd)}`,
    "",
    "# Risk Watchlist",
  );

  if (topRisks.length === 0) {
    lines.push("No significant risks identified.");
  } else {
    for (const risk of topRisks) {
      lines.push(`- ${risk.label} (${risk.score}/100): ${risk.actionable}`);
    }
  }

  lines.push("", "# Assumptions");
  if (model.assumptions.length === 0) {
    lines.push("No material assumptions recorded.");
  } else {
    for (const assumption of model.assumptions) lines.push(`- ${assumption}`);
  }

  lines.push("", "# Sources");
  if (topSources.length === 0) {
    lines.push("No external sources cited.");
  } else {
    for (const source of topSources) {
      lines.push(`- ${source.title}`);
      lines.push(`  ${source.url}`);
    }
  }

  lines.push("", "# Disclaimer", model.disclaimer);
  return lines.join("\n");
}
