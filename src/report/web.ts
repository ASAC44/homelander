import type { ReportModel } from "./model.js";

type Point = { x: number; y: number };

const CHART = {
  blue: "#2563eb",
  cyan: "#0891b2",
  purple: "#7c3aed",
  amber: "#d97706",
  red: "#dc2626",
  green: "#16a34a",
  slate: "#475569",
};

const MATERIAL_COLORS = [
  CHART.blue,
  CHART.cyan,
  CHART.purple,
  CHART.amber,
  CHART.red,
  CHART.green,
];

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value: unknown): string {
  return esc(value).replace(/`/g, "&#96;");
}

function fmtUsd(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(value: number | null | undefined, signed = false, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(fractionDigits)}%`;
}

function fmtDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value || "Unavailable";
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtShortDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function parseShipDate(value: string): Date | null {
  if (!value) return null;
  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) return new Date(direct);
  const monthYear = value.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!monthYear) return null;
  const parsed = Date.parse(`${monthYear[1]} 1, ${monthYear[2]}`);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function riskLevel(score: number): "high" | "medium" | "low" {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function riskLabel(score: number): string {
  const level = riskLevel(score);
  return level[0].toUpperCase() + level.slice(1);
}

function riskColor(score: number): string {
  if (score >= 70) return CHART.red;
  if (score >= 40) return CHART.amber;
  return CHART.green;
}

function trendMark(trend: "up" | "down" | "flat"): string {
  if (trend === "up") return "Rising";
  if (trend === "down") return "Falling";
  return "Flat";
}

function costExposure(model: ReportModel): { value: number; label: string; locked: boolean; note: string } {
  const locked = model.shipment.locked ?? [];
  const goodsLocked = locked.includes("Goods");
  const freightLocked = locked.includes("Freight");
  const lastForecast = model.costForecasts.at(-1);
  if (goodsLocked && freightLocked) {
    return {
      value: 0,
      label: "goods and freight locked",
      locked: true,
      note: "Goods and freight are recorded as locked; delivered cost is fixed for those components and the chart is market context.",
    };
  }
  if (goodsLocked) {
    return {
      value: lastForecast?.freightCostPct ?? model.expectedCostIncreasePct,
      label: "freight exposure, goods locked",
      locked: false,
      note: "Goods are recorded as locked; remaining exposure is shown against freight movement.",
    };
  }
  if (freightLocked) {
    return {
      value: lastForecast?.productCostPct ?? model.expectedCostIncreasePct,
      label: "goods exposure, freight locked",
      locked: false,
      note: "Freight is recorded as locked; remaining exposure is shown against product-cost movement.",
    };
  }
  return {
    value: model.expectedCostIncreasePct,
    label: "landed cost, full exposure",
    locked: false,
    note: "No locked cost components were recorded; exposure reflects total landed-cost movement.",
  };
}

function section(id: string, title: string, body: string, className = ""): string {
  return `<section id="${attr(id)}" class="section ${attr(className)}">
    <div class="section-title">
      <h2>${esc(title)}</h2>
    </div>
    ${body}
  </section>`;
}

function list(items: string[], empty = "None recorded."): string {
  if (items.length === 0) return `<p class="empty">${esc(empty)}</p>`;
  return `<ul class="plain-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function textList(items: string[], empty = "None recorded."): string {
  return list(items.map((item) => esc(item)), empty);
}

function sourceList(sources: Array<{ title: string; url: string; snippet?: string }>, empty = "No sources recorded."): string {
  if (sources.length === 0) return `<p class="empty">${esc(empty)}</p>`;
  return `<ol class="source-list">
    ${sources.map((source) => `<li>
      <a href="${attr(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)}</a>
      <div class="url">${esc(source.url)}</div>
      ${source.snippet ? `<p>${esc(source.snippet)}</p>` : ""}
    </li>`).join("")}
  </ol>`;
}

function dataTable(rows: Array<[string, string]>): string {
  return `<table class="data-table"><tbody>
    ${rows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`).join("")}
  </tbody></table>`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDegrees: number): Point {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRadians),
    y: cy + radius * Math.sin(angleRadians),
  };
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function ringSlicePath(cx: number, cy: number, outerRadius: number, innerRadius: number, startAngle: number, endAngle: number): string {
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function chartFrame(title: string, chart: string, note?: string): string {
  return `<figure class="chart-frame">
    <figcaption>${esc(title)}</figcaption>
    ${chart}
    ${note ? `<p class="chart-note">${esc(note)}</p>` : ""}
  </figure>`;
}

function fallbackChart(message: string): string {
  return `<div class="chart-empty">Insufficient data available: ${esc(message)}</div>`;
}

function riskGauge(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const endAngle = -120 + (clamped / 100) * 240;
  const bgPath = arcPath(110, 110, 76, -120, 120);
  const valuePath = arcPath(110, 110, 76, -120, endAngle);
  return chartFrame(
    "Global risk score",
    `<svg viewBox="0 0 220 160" role="img" aria-label="Risk score ${clamped} of 100">
      <path d="${bgPath}" fill="none" stroke="#d4d4d4" stroke-width="18" />
      <path d="${valuePath}" fill="none" stroke="${riskColor(clamped)}" stroke-width="18" />
      <text x="110" y="104" text-anchor="middle" class="chart-big">${fmtInt(clamped)}</text>
      <text x="110" y="126" text-anchor="middle" class="chart-small">/ 100 ${riskLabel(clamped)} risk</text>
    </svg>`,
  );
}

function materialDonut(model: ReportModel): string {
  const materials = model.commodity.materials.filter((item) => item.pct > 0);
  if (materials.length === 0) return fallbackChart("commodity material breakdown is missing.");
  const total = materials.reduce((sum, item) => sum + item.pct, 0);
  let angle = 0;
  const slices = materials.map((item, index) => {
    const start = angle;
    const end = angle + (item.pct / total) * 360;
    angle = end;
    return `<path d="${ringSlicePath(90, 90, 70, 42, start, end)}" fill="${MATERIAL_COLORS[index % MATERIAL_COLORS.length]}" />`;
  });
  const legend = materials.map((item, index) => `<li>
    <span class="legend-swatch" style="background:${MATERIAL_COLORS[index % MATERIAL_COLORS.length]}"></span>
    <span>${esc(item.material)}</span>
    <strong>${fmtPct(item.pct)}</strong>
  </li>`).join("");
  return chartFrame(
    "Commodity exposure",
    `<div class="chart-with-legend">
      <svg viewBox="0 0 180 180" role="img" aria-label="Material percentage breakdown">
        ${slices.join("")}
        <circle cx="90" cy="90" r="40" fill="#fff" />
        <text x="90" y="85" text-anchor="middle" class="chart-small">materials</text>
        <text x="90" y="105" text-anchor="middle" class="chart-med">${materials.length}</text>
      </svg>
      <ul class="legend-list">${legend}</ul>
    </div>`,
  );
}

function lineChart(
  title: string,
  series: Array<{ name: string; color: string; points: Array<{ label: string; value: number | null | undefined }> }>,
  unit: string,
  note?: string,
): string {
  const allValues = series.flatMap((line) => line.points.map((point) => point.value).filter((value): value is number => typeof value === "number"));
  const labels = series[0]?.points.map((point) => point.label) ?? [];
  if (labels.length < 2 || allValues.length < 2) return chartFrame(title, fallbackChart("at least two plotted values are required."), note);

  const width = 640;
  const height = 260;
  const left = 48;
  const right = 22;
  const top = 24;
  const bottom = 42;
  const minRaw = Math.min(...allValues, 0);
  const maxRaw = Math.max(...allValues, 1);
  const pad = Math.max((maxRaw - minRaw) * 0.12, 1);
  const min = minRaw - pad;
  const max = maxRaw + pad;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const x = (index: number) => left + (index * plotW) / Math.max(labels.length - 1, 1);
  const y = (value: number) => top + ((max - value) / Math.max(max - min, 1)) * plotH;

  const paths = series.map((line) => {
    const commands: string[] = [];
    line.points.forEach((point, index) => {
      if (typeof point.value !== "number") return;
      commands.push(`${commands.length === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`);
    });
    if (commands.length < 2) return "";
    return `<path d="${commands.join(" ")}" fill="none" stroke="${line.color}" stroke-width="2.5" />`;
  }).join("");

  const dots = series.flatMap((line) => line.points.map((point, index) => {
    if (typeof point.value !== "number") return "";
    return `<circle cx="${x(index).toFixed(2)}" cy="${y(point.value).toFixed(2)}" r="3.5" fill="${line.color}" />`;
  })).join("");

  const legend = series.map((line) => `<span><i style="background:${line.color}"></i>${esc(line.name)}</span>`).join("");
  const axis = `<line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" stroke="#a3a3a3" />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}" stroke="#a3a3a3" />
    ${labels.map((label, index) => `<text x="${x(index).toFixed(2)}" y="${height - 16}" text-anchor="middle" class="chart-small">${esc(label)}</text>`).join("")}
    <text x="${left - 8}" y="${top + 4}" text-anchor="end" class="chart-small">${fmtPct(maxRaw, true)}</text>
    <text x="${left - 8}" y="${top + plotH}" text-anchor="end" class="chart-small">${fmtPct(minRaw, true)}</text>`;

  return chartFrame(title, `<div class="chart-legend">${legend}</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(title)}">${axis}${paths}${dots}<text x="${width - 24}" y="18" text-anchor="end" class="chart-small">${esc(unit)}</text></svg>`, note);
}

function costForecastChart(model: ReportModel): string {
  const analysisDate = parseShipDate(model.generatedAt);
  const exposure = costExposure(model);
  const locked = model.shipment.locked ?? [];
  const freightLabel = locked.includes("Freight") ? "Freight (locked)" : "Freight";
  const productLabel = locked.includes("Goods") ? "Product (locked)" : "Product";
  const points = [
    {
      label: analysisDate ? `Today (${fmtShortDate(analysisDate)})` : "Today",
      product: 0,
      freight: 0,
      landed: 0,
    },
    ...model.costForecasts.map((item) => ({
      label: analysisDate ? fmtShortDate(addDays(analysisDate, item.horizonDays)) : `${item.horizonDays}d`,
      product: item.productCostPct,
      freight: item.freightCostPct,
      landed: item.landedCostPct,
    })),
  ];
  return lineChart(
    "Cost forecast by component",
    [
      { name: "Landed", color: CHART.blue, points: points.map((point) => ({ label: point.label, value: point.landed })) },
      { name: freightLabel, color: CHART.cyan, points: points.map((point) => ({ label: point.label, value: point.freight })) },
      { name: productLabel, color: CHART.purple, points: points.map((point) => ({ label: point.label, value: point.product })) },
    ],
    "change vs today",
    `Product, freight, and total landed cost are shown as percentage movement from the analysis date. Cost exposure: ${exposure.label}. ${exposure.note}`,
  );
}

function barChart(
  title: string,
  rows: Array<{ label: string; value: number; color: string; suffix?: string }>,
  maxValue?: number,
  note?: string,
): string {
  if (rows.length === 0) return chartFrame(title, fallbackChart("no rows are available."), note);
  const width = 680;
  const rowH = 36;
  const height = 42 + rows.length * rowH;
  const left = 168;
  const right = 70;
  const max = Math.max(maxValue ?? 0, ...rows.map((row) => row.value), 1);
  const bars = rows.map((row, index) => {
    const y = 30 + index * rowH;
    const barW = ((width - left - right) * row.value) / max;
    return `<g>
      <text x="${left - 10}" y="${y + 15}" text-anchor="end" class="chart-label">${esc(row.label)}</text>
      <rect x="${left}" y="${y}" width="${Math.max(1, barW).toFixed(2)}" height="18" fill="${row.color}" />
      <text x="${left + barW + 8}" y="${y + 14}" class="chart-small">${esc(row.suffix ?? fmtInt(row.value))}</text>
    </g>`;
  }).join("");
  return chartFrame(title, `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(title)}">
    <line x1="${left}" y1="24" x2="${left}" y2="${height - 16}" stroke="#a3a3a3" />
    ${bars}
  </svg>`, note);
}

function routeComparisonChart(model: ReportModel): string {
  if (model.routes.length === 0) return chartFrame("Route cost and transit comparison", fallbackChart("no route options were returned."));
  const maxCost = Math.max(...model.routes.map((route) => route.cost), 1);
  const maxDays = Math.max(...model.routes.map((route) => route.transitDays), 1);
  const width = 720;
  const height = 90 + model.routes.length * 52;
  const left = 152;
  const barW = 420;
  const rows = model.routes.map((route, index) => {
    const y = 50 + index * 52;
    const costW = (route.cost / maxCost) * barW;
    const dayW = (route.transitDays / maxDays) * barW;
    return `<g>
      <text x="${left - 12}" y="${y + 13}" text-anchor="end" class="chart-label">${esc(route.method)}</text>
      <rect x="${left}" y="${y}" width="${Math.max(1, costW).toFixed(2)}" height="15" fill="${CHART.blue}" />
      <rect x="${left}" y="${y + 20}" width="${Math.max(1, dayW).toFixed(2)}" height="15" fill="${CHART.amber}" />
      <text x="${left + costW + 8}" y="${y + 12}" class="chart-small">${esc(fmtUsd(route.cost))}</text>
      <text x="${left + dayW + 8}" y="${y + 32}" class="chart-small">${esc(`${route.transitDays}d`)}</text>
      ${route.recommended ? `<text x="${width - 36}" y="${y + 21}" text-anchor="end" class="chart-small">recommended</text>` : ""}
    </g>`;
  }).join("");
  return chartFrame(
    "Route cost and transit comparison",
    `<div class="chart-legend"><span><i style="background:${CHART.blue}"></i>Cost</span><span><i style="background:${CHART.amber}"></i>Transit days</span></div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Route cost and transit comparison">
      ${rows}
    </svg>`,
  );
}

function riskBarChart(model: ReportModel): string {
  const rows = [...model.risks]
    .sort((a, b) => b.score - a.score)
    .map((risk) => ({
      label: risk.label,
      value: risk.score,
      color: riskColor(risk.score),
      suffix: `${risk.score}/100`,
    }));
  return barChart("Risk factor score distribution", rows, 100, "Higher values indicate greater shipment decision risk.");
}

function portCongestionChart(model: ReportModel): string {
  const rows = [...model.portOptions]
    .sort((a, b) => b.congestionScore - a.congestionScore)
    .map((port) => ({
      label: port.name,
      value: port.congestionScore,
      color: riskColor(port.congestionScore),
      suffix: `${port.congestionScore}/100`,
    }));
  return barChart("Port congestion comparison", rows, 100, "Congestion score and waiting time are estimates from available port intelligence.");
}

function landedCostChart(model: ReportModel): string {
  const rows = [
    { label: "Goods value", value: model.landedCost.goodsValueUsd, color: CHART.blue, suffix: fmtUsd(model.landedCost.goodsValueUsd) },
    { label: "Freight", value: model.landedCost.estimatedFreightUsd, color: CHART.cyan, suffix: fmtUsd(model.landedCost.estimatedFreightUsd) },
    { label: "Duties", value: model.landedCost.estimatedDutyUsd, color: CHART.amber, suffix: fmtUsd(model.landedCost.estimatedDutyUsd) },
  ].filter((row) => row.value > 0);
  return barChart("Landed cost component scale", rows, undefined, "Amounts are deterministic calculations from the report model.");
}

function driverSparkline(driver: ReportModel["drivers"][number]): string {
  const history = driver.series.map((point) => ({ label: point.t, value: point.v }));
  const forecast = driver.series.map((point) => ({ label: point.t, value: point.f ?? null }));
  const values = [...history, ...forecast].map((point) => point.value).filter((value): value is number => typeof value === "number");
  if (values.length < 2) return fallbackChart("driver trend series has fewer than two plotted values.");

  const width = 320;
  const height = 110;
  const left = 24;
  const top = 14;
  const right = 12;
  const bottom = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const x = (index: number) => left + (index * plotW) / Math.max(driver.series.length - 1, 1);
  const y = (value: number) => top + ((max - value) / span) * plotH;
  const pathFor = (key: "v" | "f") => {
    const commands: string[] = [];
    driver.series.forEach((point, index) => {
      const value = point[key];
      if (typeof value !== "number") return;
      commands.push(`${commands.length === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`);
    });
    return commands.length >= 2 ? commands.join(" ") : "";
  };
  const historyPath = pathFor("v");
  const forecastPath = pathFor("f");
  const color = driver.trend === "down" ? CHART.green : driver.trend === "flat" ? CHART.slate : CHART.red;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(driver.name)} trend">
    <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" stroke="#d4d4d4" />
    ${historyPath ? `<path d="${historyPath}" fill="none" stroke="${color}" stroke-width="2.2" />` : ""}
    ${forecastPath ? `<path d="${forecastPath}" fill="none" stroke="${CHART.blue}" stroke-width="2" stroke-dasharray="5 4" />` : ""}
    <text x="${left}" y="${height - 5}" class="chart-small">${esc(driver.series[0]?.t ?? "")}</text>
    <text x="${width - right}" y="${height - 5}" text-anchor="end" class="chart-small">${esc(driver.series.at(-1)?.t ?? "")}</text>
  </svg>`;
}

function driverSparklineLegend(driver: ReportModel["drivers"][number]): string {
  const color = driver.trend === "down" ? CHART.green : driver.trend === "flat" ? CHART.slate : CHART.red;
  return `<div class="chart-legend sparkline-legend">
    <span><i style="background:${color}"></i>History</span>
    <span><i style="background:${CHART.blue}"></i>Forecast</span>
  </div>`;
}

function driverTracker(model: ReportModel): string {
  if (model.drivers.length === 0) return `<p class="empty">Insufficient data available: no commodity or input drivers were returned.</p>`;
  return `<div class="driver-grid">
    ${model.drivers.map((driver) => `<article class="driver-card">
      <div class="mini-heading">
        <h3>${esc(driver.name)}</h3>
        <span>${esc(driver.impact)} impact</span>
      </div>
      <div class="driver-metrics">
        <div><strong>${esc(fmtInt(driver.current))}</strong><span>${esc(driver.unit)} current${driver.priceLive ? " live" : " estimate"}</span></div>
        <div><strong>${esc(fmtPct(driver.changePct, true))}</strong><span>${esc(trendMark(driver.trend))}</span></div>
        <div><strong>${esc(fmtPct(driver.forecastPct, true))}</strong><span>60-day forecast</span></div>
      </div>
      ${driverSparkline(driver)}
      ${driverSparklineLegend(driver)}
      <p>${esc(driver.affects)}</p>
      ${driver.forecastNote ? `<p class="small-text">${esc(driver.forecastNote)}</p>` : ""}
      ${sourceList(driver.sources, "No driver sources recorded.")}
    </article>`).join("")}
  </div>`;
}

function dependencyGraph(model: ReportModel): string {
  const nodes = model.drivers.slice(0, 9);
  if (nodes.length === 0 && model.dependencyGraph.length === 0) {
    return `<p class="empty">Insufficient data available: no dependency graph or driver data was returned.</p>`;
  }
  const width = 760;
  const height = 420;
  const cx = width / 2;
  const cy = height / 2;
  const rx = 250;
  const ry = 135;
  const placed = nodes.map((driver, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      driver,
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
      lx: cx + (rx + 26) * Math.cos(angle),
      ly: cy + (ry + 26) * Math.sin(angle),
      anchor: Math.cos(angle) > 0.25 ? "start" : Math.cos(angle) < -0.25 ? "end" : "middle",
    };
  });
  const graphSvg = nodes.length
    ? `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Supply-chain dependency graph">
      ${placed.map((point) => `<line x1="${cx}" y1="${cy}" x2="${point.x.toFixed(2)}" y2="${point.y.toFixed(2)}" stroke="${point.driver.impact === "high" ? CHART.red : point.driver.impact === "medium" ? CHART.blue : CHART.slate}" stroke-width="${point.driver.impact === "high" ? 2.4 : 1.5}" />`).join("")}
      <rect x="${cx - 92}" y="${cy - 24}" width="184" height="48" fill="#fff" stroke="#111" />
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" class="chart-label">${esc(model.commodity.productCategory.slice(0, 26))}</text>
      ${placed.map((point) => {
        const color = point.driver.impact === "high" ? CHART.red : point.driver.impact === "medium" ? CHART.blue : CHART.slate;
        return `<g>
          <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${point.driver.impact === "high" ? 9 : 7}" fill="${color}" />
          <text x="${point.lx.toFixed(2)}" y="${(point.ly - 5).toFixed(2)}" text-anchor="${point.anchor}" class="chart-label">${esc(point.driver.name.slice(0, 22))}</text>
          <text x="${point.lx.toFixed(2)}" y="${(point.ly + 11).toFixed(2)}" text-anchor="${point.anchor}" class="chart-small">${esc(fmtPct(point.driver.changePct, true))}</text>
        </g>`;
      }).join("")}
    </svg>`
    : fallbackChart("driver nodes are not available.");
  const rows = model.dependencyGraph.flatMap((node) =>
    node.children.length
      ? node.children.map((child) => `<tr><td>${esc(node.node)}</td><td>${esc(child)}</td></tr>`)
      : [`<tr><td>${esc(node.node)}</td><td>No upstream dependencies identified</td></tr>`],
  ).join("");
  const table = rows
    ? `<table class="data-table dependency-table"><thead><tr><th>Product category</th><th>Cost and availability driver</th></tr></thead><tbody>${rows}</tbody></table>`
    : "";
  return `${chartFrame("Supply-chain dependency graph", graphSvg)}${table}`;
}

function unwrapLongitude(lng: number, reference: number): number {
  let adjusted = lng;
  while (adjusted - reference > 180) adjusted -= 360;
  while (adjusted - reference < -180) adjusted += 360;
  return adjusted;
}

function greatCirclePoints(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  steps = 48,
): Array<{ lat: number; lng: number }> {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const toDeg = (radians: number) => (radians * 180) / Math.PI;
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lng);
  const lat2 = toRad(destination.lat);
  const lon2 = toRad(destination.lng);
  const distance = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
  ));
  if (distance === 0) return [{ lat: origin.lat, lng: origin.lng }, { lat: destination.lat, lng: destination.lng }];

  const points: Array<{ lat: number; lng: number }> = [];
  let previousLng = origin.lng;
  for (let index = 0; index <= steps; index += 1) {
    const fraction = index / steps;
    const a = Math.sin((1 - fraction) * distance) / Math.sin(distance);
    const b = Math.sin(fraction * distance) / Math.sin(distance);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const rawLng = toDeg(Math.atan2(y, x));
    const lng = unwrapLongitude(rawLng, previousLng);
    previousLng = lng;
    points.push({ lat, lng });
  }
  return points;
}

function routeGeography(model: ReportModel): string {
  if (!model.geo) return `<p class="empty">Insufficient data available: origin or destination could not be geocoded.</p>`;
  const routePoints = greatCirclePoints(model.geo.origin, model.geo.destination);
  const unwrappedDestinationLng = routePoints.at(-1)?.lng ?? model.geo.destination.lng;
  const candidatePorts = model.portOptions
    .filter((port): port is ReportModel["portOptions"][number] & { lat: number; lng: number } => port.lat !== null && port.lng !== null)
    .map((port) => ({
      port,
      lat: port.lat,
      lng: unwrapLongitude(port.lng, unwrappedDestinationLng),
    }));
  const points = [
    ...routePoints,
    ...candidatePorts.map((port) => ({ lat: port.lat, lng: port.lng })),
  ];
  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLng = Math.min(...points.map((point) => point.lng));
  const maxLng = Math.max(...points.map((point) => point.lng));
  const width = 760;
  const height = 310;
  const pad = 42;
  const project = (lat: number, lng: number): Point => ({
    x: pad + ((lng - minLng) / Math.max(maxLng - minLng, 1)) * (width - pad * 2),
    y: pad + ((maxLat - lat) / Math.max(maxLat - minLat, 1)) * (height - pad * 2),
  });
  const origin = project(routePoints[0]?.lat ?? model.geo.origin.lat, routePoints[0]?.lng ?? model.geo.origin.lng);
  const lastPoint = routePoints.at(-1);
  const destination = project(lastPoint?.lat ?? model.geo.destination.lat, lastPoint?.lng ?? unwrappedDestinationLng);
  const routePolyline = routePoints.map((point) => {
    const projected = project(point.lat, point.lng);
    return `${projected.x.toFixed(2)},${projected.y.toFixed(2)}`;
  }).join(" ");
  const ports = candidatePorts.map((port) => ({ port: port.port, point: project(port.lat, port.lng) }));
  return chartFrame(
    "Route geography and candidate ports",
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Route geography diagram">
      <rect x="16" y="16" width="${width - 32}" height="${height - 32}" fill="#fff" stroke="#d4d4d4" />
      <polyline points="${routePolyline}" fill="none" stroke="${CHART.blue}" stroke-width="2.5" stroke-dasharray="8 6" />
      <circle cx="${origin.x.toFixed(2)}" cy="${origin.y.toFixed(2)}" r="8" fill="${CHART.green}" />
      <circle cx="${destination.x.toFixed(2)}" cy="${destination.y.toFixed(2)}" r="8" fill="${CHART.red}" />
      <text x="${origin.x.toFixed(2)}" y="${(origin.y - 14).toFixed(2)}" text-anchor="middle" class="chart-label">${esc(model.geo.origin.name)}</text>
      <text x="${destination.x.toFixed(2)}" y="${(destination.y - 14).toFixed(2)}" text-anchor="middle" class="chart-label">${esc(model.geo.destination.name)}</text>
      ${ports.map(({ port, point }) => `<g>
        <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${port.recommended ? 8 : 6}" fill="${riskColor(port.congestionScore)}" />
        <text x="${point.x.toFixed(2)}" y="${(point.y + 19).toFixed(2)}" text-anchor="middle" class="chart-small">${esc(port.name.slice(0, 20))}</text>
      </g>`).join("")}
      <text x="${width - 24}" y="${height - 18}" text-anchor="end" class="chart-small">approx. ${fmtInt(model.geo.distanceKm)} km</text>
    </svg>`,
    "Great-circle route approximation for the report; this is not a live map tile.",
  );
}

function reportHeader(model: ReportModel): string {
  return `<header class="report-header">
    <div>
      <p class="kicker">Transitra Executive Trade Report</p>
      <h1>${esc(model.shipment.product)}</h1>
      <p class="subtitle">${esc(model.shipment.origin)} -&gt; ${esc(model.shipment.destination)}</p>
    </div>
    <dl class="report-meta">
      <div><dt>Report ID</dt><dd>${esc(model.reportId)}</dd></div>
      <div><dt>Version</dt><dd>${esc(model.version)}</dd></div>
      <div><dt>Generated</dt><dd>${esc(model.generatedAt)}</dd></div>
      <div><dt>Data mode</dt><dd>${esc(model.dataMode.toUpperCase())}</dd></div>
      <div><dt>Confidence</dt><dd>${esc(model.confidence)}</dd></div>
    </dl>
  </header>`;
}

function kpiGrid(model: ReportModel): string {
  const rec = model.recommendedRoute ?? model.routes[0] ?? null;
  const [delayLo, delayHi] = model.expectedDelayDays;
  const exposure = costExposure(model);
  return `<div class="kpi-grid">
    <div class="kpi"><span>Recommended route</span><strong>${esc(rec?.method ?? "Unavailable")}</strong><small>${esc(rec?.note ?? "No route recommendation returned.")}</small></div>
    <div class="kpi"><span>Total landed cost</span><strong>${esc(fmtUsd(model.landedCost.estimatedTotalUsd))}</strong><small>Goods, freight, and estimated duty</small></div>
    <div class="kpi"><span>Global risk score</span><strong>${esc(`${model.riskScore}/100`)}</strong><small>${esc(riskLabel(model.riskScore))} shipment risk</small></div>
    <div class="kpi"><span>Expected delay</span><strong>${esc(`${delayLo}-${delayHi} days`)}</strong><small>Added to baseline transit</small></div>
    <div class="kpi"><span>Cost exposure</span><strong>${exposure.locked ? "Locked" : esc(fmtPct(exposure.value, true))}</strong><small>${esc(exposure.label)}</small></div>
    <div class="kpi"><span>Effective duty</span><strong>${esc(fmtPct(model.landedCost.totalDutyPct, false, 2))}</strong><small>${esc(model.tariff?.hsCode ? `HS ${model.tariff.hsCode}` : "Tariff unavailable")}</small></div>
  </div>`;
}

function shipmentSection(model: ReportModel): string {
  const s = model.shipment;
  const goodsValue = s.pricePerKg ? s.weightKg * s.pricePerKg : 0;
  const rows: Array<[string, string]> = [
    ["Product", esc(s.product)],
    ["Origin", esc(s.origin)],
    ["Destination", esc(s.destination)],
    ["Weight", `${esc(fmtInt(s.weightKg))} kg`],
    ["Quantity", s.quantity !== undefined ? esc(fmtInt(s.quantity)) : "Unavailable"],
    ["Ship date", esc(s.shipDate || "Unavailable")],
    ["Mode", esc(s.shippingMode || "Unavailable")],
    ["Container", esc(s.containerSize || "Unavailable")],
    ["Price / kg", s.pricePerKg !== undefined ? esc(fmtUsd(s.pricePerKg, 2)) : "Unavailable"],
    ["Goods value", goodsValue > 0 ? esc(fmtUsd(goodsValue)) : "Unavailable"],
    ["Locked components", s.locked?.length ? esc(s.locked.join(", ")) : "None recorded"],
    ["Special handling", s.specialRequirements?.length ? esc(s.specialRequirements.join(", ")) : "None recorded"],
  ];
  return section("shipment", "Shipment Inputs", dataTable(rows));
}

function executiveSection(model: ReportModel): string {
  const recommendations = model.recommendations.length
    ? `<div class="callout-list">${model.recommendations.map((item) => `<article><h3>${esc(item.action)}</h3><p>${esc(item.rationale)}</p></article>`).join("")}</div>`
    : `<p class="empty">No recommendations returned.</p>`;
  const alerts = model.alerts.length
    ? `<table class="data-table"><thead><tr><th>Severity</th><th>Alert</th><th>Impact</th></tr></thead><tbody>
      ${model.alerts.map((alert) => `<tr><td>${esc(alert.severity)}</td><td>${esc(alert.title)}</td><td>${esc(alert.impact)}</td></tr>`).join("")}
    </tbody></table>`
    : `<p class="empty">No critical alerts returned.</p>`;
  return section("executive-summary", "Executive Summary", `<p class="lead">${esc(model.executiveSummary)}</p><h3 class="subhead">Recommendations</h3>${recommendations}<h3 class="subhead">Active Alerts</h3>${alerts}`);
}

function impactSection(model: ReportModel): string {
  const rec = model.recommendedRoute ?? model.routes[0] ?? null;
  const shipDate = parseShipDate(model.shipment.shipDate);
  const [delayLo, delayHi] = model.expectedDelayDays;
  const exposure = costExposure(model);
  const arrival = shipDate && rec
    ? `${fmtDate(addDays(shipDate, rec.transitDays + delayLo).toISOString())} to ${fmtDate(addDays(shipDate, rec.transitDays + delayHi).toISOString())}`
    : "Unavailable";
  return section("expected-impact", "Expected Impact", `<div class="two-column">
    ${riskGauge(model.riskScore)}
    <div>
      ${dataTable([
        ["Cost exposure", exposure.locked ? "Locked" : esc(fmtPct(exposure.value, true))],
        ["Exposure basis", esc(exposure.label)],
        ["Modeled landed-cost move", esc(fmtPct(model.expectedCostIncreasePct, true))],
        ["Expected delay", esc(`${delayLo}-${delayHi} days`)],
        ["Estimated arrival", esc(arrival)],
        ["Baseline route", esc(rec ? `${rec.method}, ${rec.transitDays} days` : "Unavailable")],
        ["Cost exposure note", esc(exposure.note)],
      ])}
    </div>
  </div><h3 class="subhead">Cost Forecast</h3>${costForecastChart(model)}`);
}

function commoditySection(model: ReportModel): string {
  return section("commodity-exposure", "Commodity Exposure", `<div class="two-column">
    ${materialDonut(model)}
    <div>
      ${dataTable([
        ["Product category", esc(model.commodity.productCategory || "Unavailable")],
        ["HS codes", model.commodity.hsCodes.length ? esc(model.commodity.hsCodes.join(", ")) : "Unavailable"],
        ["Material count", esc(fmtInt(model.commodity.materials.length))],
      ])}
    </div>
  </div>`);
}

function actionPlanSection(model: ReportModel): string {
  if (model.actionPlan.length === 0) return section("action-plan", "Action Plan", `<p class="empty">No action plan items returned.</p>`);
  return section("action-plan", "Action Plan", `<ol class="action-list">
    ${model.actionPlan.map((item) => `<li>
      <div class="action-head"><strong>${esc(item.action)}</strong><span>${esc(item.urgency)} urgency</span></div>
      <p>${esc(item.why)}</p>
      <dl><div><dt>Deadline</dt><dd>${esc(item.deadline)}</dd></div><div><dt>Due date</dt><dd>${esc(item.dueDate ?? "Unavailable")}</dd></div><div><dt>Category</dt><dd>${esc(item.category)}</dd></div></dl>
    </li>`).join("")}
  </ol>`);
}

function routesSection(model: ReportModel): string {
  const rows = model.routes.map((route) => `<tr>
    <td>${esc(route.method)}${route.recommended ? " <span class=\"tag\">Recommended</span>" : ""}</td>
    <td>${esc(fmtUsd(route.cost))}</td>
    <td>${esc(`${route.transitDays} days`)}</td>
    <td>${esc(route.note)}</td>
  </tr>`).join("");
  const table = model.routes.length
    ? `<table class="data-table"><thead><tr><th>Method</th><th>Cost</th><th>Transit</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="empty">No route options returned.</p>`;
  return section("route-optimization", "Route Optimization", `${table}${routeComparisonChart(model)}`);
}

function transitSection(model: ReportModel): string {
  const rec = model.recommendedRoute ?? model.routes[0] ?? null;
  const [delayLo, delayHi] = model.expectedDelayDays;
  return section("transit-timing", "Transit Timing", dataTable([
    ["Selected route", esc(rec?.method ?? "Unavailable")],
    ["Base transit", rec ? esc(`${rec.transitDays} days`) : "Unavailable"],
    ["Risk delay", esc(`+${delayLo}-${delayHi} days`)],
    ["Door-to-door range", rec ? esc(`${rec.transitDays + delayLo}-${rec.transitDays + delayHi} days`) : "Unavailable"],
    ["Route note", esc(rec?.note ?? "Unavailable")],
  ]));
}

function geographySection(model: ReportModel): string {
  return section("route-geography", "Route Geography", routeGeography(model));
}

function portSection(model: ReportModel): string {
  const recommendation = model.portRecommendation
    ? `<div class="report-note"><strong>Recommended entry port:</strong> ${esc(model.portRecommendation.recommended)}<br />${esc(model.portRecommendation.rationale)}</div>`
    : `<p class="empty">No port recommendation returned.</p>`;
  const comparisonPorts = [...model.portOptions].sort((a, b) => a.congestionScore - b.congestionScore);
  const rows = comparisonPorts.map((port) => `<tr>
    <td>${esc(port.name)}${port.recommended ? " <span class=\"tag\">Recommended</span>" : ""}</td>
    <td>${esc(`${port.congestionScore}/100`)}</td>
    <td>${esc(`${port.waitDays} days`)}</td>
    <td>${esc(fmtUsd(port.freightCost))}</td>
    <td>${esc(`${port.sources.length} source${port.sources.length === 1 ? "" : "s"}`)}</td>
    <td>${esc(port.note)}</td>
  </tr>`).join("");
  const table = model.portOptions.length
    ? `<table class="data-table"><thead><tr><th>Port</th><th>Congestion</th><th>Wait</th><th>Freight</th><th>Sources</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="empty">No candidate ports returned.</p>`;
  const sourceBlocks = model.portOptions.length
    ? `<h3 class="subhead">Port Sources</h3>${model.portOptions.map((port) => `<article class="source-block"><h4>${esc(port.name)}</h4>${sourceList(port.sources, "No port sources recorded.")}</article>`).join("")}`
    : "";
  return section("port-recommendation", "Port Recommendation", `${recommendation}${table}${portCongestionChart(model)}${sourceBlocks}`);
}

function tariffSection(model: ReportModel): string {
  if (!model.tariff) {
    return section("tariffs", "Tariffs and Regulations", `<p class="empty">Tariff analysis unavailable. Consult a customs broker before relying on customs figures.</p>`);
  }
  const addRows = model.tariff.additional.length
    ? model.tariff.additional.map((line) => `<tr><td>${esc(line.name)}</td><td>${esc(fmtPct(line.ratePct, false, 2))}</td></tr>`).join("")
    : `<tr><td>None recorded</td><td>Unavailable</td></tr>`;
  return section("tariffs", "Tariffs and Regulations", `<div class="two-column">
    <div>
      ${dataTable([
        ["HS code", esc(model.tariff.hsCode || "Unavailable")],
        ["Origin country", esc(model.tariff.originCountry)],
        ["Destination country", esc(model.tariff.destinationCountry)],
        ["Base duty", esc(fmtPct(model.tariff.baseDutyPct, false, 2))],
        ["Total effective duty", esc(fmtPct(model.tariff.totalDutyPct, false, 2))],
        ["Estimated duty", esc(fmtUsd(model.landedCost.estimatedDutyUsd))],
        ["Notes", esc(model.tariff.notes || "None recorded")],
      ])}
    </div>
    <div>
      <table class="data-table"><thead><tr><th>Additional line</th><th>Rate</th></tr></thead><tbody>${addRows}</tbody></table>
    </div>
  </div>
  <h3 class="subhead">Compliance Requirements</h3>
  ${textList(model.tariff.requirements, "No additional requirements returned.")}
  <h3 class="subhead">Documentation Checklist</h3>
  ${documentsTable(model)}
  <h3 class="subhead">Tariff Sources</h3>
  ${sourceList(model.tariff.sources, "No tariff sources recorded.")}`);
}

function documentsTable(model: ReportModel): string {
  if (model.documents.length === 0) {
    return `<p class="empty">No specific documents identified. Recommended baseline: commercial invoice, packing list, bill of lading or air waybill, certificate of origin, and product-specific permits.</p>`;
  }
  return `<table class="data-table"><thead><tr><th>Document</th><th>Reference</th></tr></thead><tbody>
    ${model.documents.map((doc) => `<tr><td>${esc(doc.name)}</td><td>${doc.url ? `<a href="${attr(doc.url)}" target="_blank" rel="noreferrer">${esc(doc.url)}</a>` : "Official source not available"}</td></tr>`).join("")}
  </tbody></table>`;
}

function landedCostSection(model: ReportModel): string {
  return section("landed-cost", "Landed Cost Breakdown", `<div class="two-column">
    ${landedCostChart(model)}
    <div>
      ${dataTable([
        ["Goods value", esc(fmtUsd(model.landedCost.goodsValueUsd))],
        ["Freight", esc(fmtUsd(model.landedCost.estimatedFreightUsd))],
        ["Duties and taxes", esc(fmtUsd(model.landedCost.estimatedDutyUsd))],
        ["Total landed cost", `<strong>${esc(fmtUsd(model.landedCost.estimatedTotalUsd))}</strong>`],
        ["Duty rate", esc(fmtPct(model.landedCost.totalDutyPct, false, 2))],
      ])}
    </div>
  </div>`);
}

function risksSection(model: ReportModel): string {
  const riskCards = model.risks.length
    ? `<div class="risk-grid">${[...model.risks].sort((a, b) => b.score - a.score).map((risk) => `<article>
      <div class="mini-heading"><h3>${esc(risk.label)}</h3><span>${esc(`${risk.score}/100 ${riskLevel(risk.score)}`)}</span></div>
      <p class="small-text"><strong>Trend:</strong> ${esc(trendMark(risk.trend))}</p>
      <p><strong>${esc(risk.category)}</strong> - ${esc(risk.actionable)}</p>
      <p>${esc(risk.detail)}</p>
      ${textList(risk.keyFindings, "No key findings recorded.")}
      ${sourceList(risk.sources, "No risk sources recorded.")}
    </article>`).join("")}</div>`
    : `<p class="empty">No risk factors returned.</p>`;
  return section("risk-factors", "Risk Factors by Category", `${riskBarChart(model)}${riskCards}`);
}

function driverSection(model: ReportModel): string {
  return section("driver-tracker", "Supply-Chain Driver Tracker", driverTracker(model));
}

function dependencySection(model: ReportModel): string {
  return section("dependency-graph", "Supply-Chain Dependency Graph", dependencyGraph(model));
}

function newsSection(model: ReportModel): string {
  return section("news", "News Intelligence Feed", sourceList(model.news, "No news intelligence returned."));
}

function searchLogSection(model: ReportModel): string {
  const totalSources = model.searches.reduce((sum, search) => sum + search.results, 0);
  const rows = model.searches.map((search) => `<tr>
    <td>${esc(search.agent)}</td>
    <td>${esc(search.query)}</td>
    <td>${esc(fmtInt(search.results))}</td>
    <td>${esc(search.mode.toUpperCase())}</td>
  </tr>`).join("");
  const body = model.searches.length
    ? `<p class="small-text">Every live web search the agents ran via Bright Data&#39;s search_engine tool. Each row records the query, agent, data mode, and number of source references returned.</p><p class="small-text">${esc(`${model.searches.length} searches returned ${totalSources} source references.`)}</p><table class="data-table"><thead><tr><th>Agent</th><th>Query</th><th>Results</th><th>Mode</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="empty">No searches recorded.</p>`;
  return section("search-log", "Bright Data Scraping Log", body);
}

function sourceAppendix(model: ReportModel): string {
  return section("sources", "Sources Appendix", sourceList(model.sources));
}

function closingSection(model: ReportModel): string {
  return section("assumptions", "Assumptions, Limitations, and Disclaimer", `<div class="three-column">
    <div><h3 class="subhead">Assumptions</h3>${textList(model.assumptions)}</div>
    <div><h3 class="subhead">Limitations</h3>${textList(model.limitations)}</div>
    <div><h3 class="subhead">Human Verification</h3><p>${esc(model.disclaimer)}</p></div>
  </div>`);
}

function styles(): string {
  return `<style>
    :root {
      --page: #ffffff;
      --paper: #ffffff;
      --ink: #111111;
      --muted: #555555;
      --soft: #f5f5f5;
      --line: #d4d4d4;
      --line-strong: #111111;
    }
    * { box-sizing: border-box; }
    html { background: var(--page); color: var(--ink); }
    body {
      margin: 0;
      font-family: "Times New Roman", Times, serif;
      background: var(--page);
      color: var(--ink);
      font-size: 15px;
      line-height: 1.48;
    }
    a { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }
    .report {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 56px;
    }
    .report-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 420px;
      gap: 24px;
      border: 2px solid var(--line-strong);
      padding: 20px;
      margin-bottom: 14px;
      background: var(--paper);
    }
    .kicker,
    .subtitle,
    .report-meta,
    .section-title,
    .kpi,
    .data-table,
    .tag,
    .subhead,
    .chart-frame,
    .chart-empty,
    .chart-note,
    .small-text,
    .empty,
    .action-list dl,
    .driver-metrics,
    .url {
      font-family: Arial, Helvetica, sans-serif;
    }
    .kicker {
      margin: 0 0 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--muted);
    }
    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.05;
      font-weight: 700;
      letter-spacing: 0;
    }
    .subtitle {
      margin: 10px 0 0;
      font-size: 13px;
      color: var(--muted);
    }
    .report-meta {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin: 0;
      font-size: 12px;
    }
    .report-meta div {
      display: grid;
      grid-template-columns: 96px 1fr;
      gap: 8px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 6px;
      min-width: 0;
    }
    dt {
      margin: 0;
      color: var(--muted);
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.08em;
    }
    dd { margin: 0; overflow-wrap: anywhere; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 14px;
    }
    .kpi {
      border: 1px solid var(--line-strong);
      padding: 10px;
      min-height: 104px;
      background: var(--paper);
      overflow: hidden;
    }
    .kpi span,
    .kpi small {
      display: block;
      color: var(--muted);
      font-size: 10px;
      line-height: 1.35;
      text-transform: uppercase;
      letter-spacing: 0.07em;
    }
    .kpi strong {
      display: block;
      margin: 7px 0;
      font-size: 22px;
      line-height: 1.05;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .section {
      border: 1px solid var(--line-strong);
      background: var(--paper);
      margin: 12px 0;
      overflow: hidden;
    }
    .section-title {
      border-bottom: 1px solid var(--line-strong);
      background: var(--soft);
      padding: 8px 12px;
    }
    .section h2 {
      margin: 0;
      font-size: 14px;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
    }
    .section > :not(.section-title) {
      margin: 12px;
      max-width: calc(100% - 24px);
    }
    .lead {
      margin-top: 0;
      font-size: 18px;
      line-height: 1.45;
    }
    .subhead {
      margin: 16px 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .two-column {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 0.78fr);
      gap: 12px;
      align-items: start;
    }
    .three-column {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      align-items: start;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      table-layout: fixed;
    }
    .data-table th,
    .data-table td {
      border: 1px solid var(--line);
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    .data-table th {
      width: 28%;
      color: var(--muted);
      background: var(--soft);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 10px;
      font-weight: 700;
    }
    .dependency-table th { width: auto; }
    .plain-list {
      margin: 0;
      padding-left: 18px;
    }
    .plain-list li { margin: 4px 0; }
    .tag {
      display: inline-block;
      border: 1px solid var(--line-strong);
      padding: 1px 4px;
      margin-left: 4px;
      font-size: 9px;
      line-height: 1.4;
      text-transform: uppercase;
      white-space: normal;
    }
    .callout-list,
    .risk-grid,
    .driver-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .callout-list article,
    .risk-grid article,
    .driver-card,
    .source-block,
    .action-list li,
    .report-note {
      border: 1px solid var(--line);
      padding: 10px;
      background: var(--paper);
    }
    .callout-list h3,
    .risk-grid h3,
    .driver-card h3,
    .source-block h4 {
      margin: 0 0 4px;
      font-size: 14px;
      line-height: 1.25;
    }
    .callout-list p,
    .risk-grid p,
    .driver-card p,
    .source-block p,
    .report-note {
      margin: 6px 0 0;
    }
    .action-list {
      margin: 0;
      padding-left: 22px;
    }
    .action-list li { margin: 8px 0; }
    .action-head,
    .mini-heading {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
    }
    .action-head span,
    .mini-heading span {
      flex: 0 0 auto;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.07em;
    }
    .action-list dl,
    .driver-metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 8px 0 0;
      font-size: 11px;
    }
    .action-list dl div,
    .driver-metrics div {
      border-top: 1px solid var(--line);
      padding-top: 6px;
      min-width: 0;
    }
    .driver-metrics strong {
      display: block;
      font-size: 16px;
      line-height: 1.1;
      overflow-wrap: anywhere;
    }
    .driver-metrics span {
      display: block;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .chart-frame {
      margin: 0 0 12px;
      border: 1px solid var(--line);
      padding: 10px;
      background: var(--paper);
      overflow: hidden;
    }
    .chart-frame figcaption {
      margin-bottom: 8px;
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
    }
    .chart-frame svg {
      display: block;
      width: 100%;
      height: auto;
      max-height: 380px;
    }
    .chart-empty {
      border: 1px dashed var(--line);
      padding: 16px;
      color: var(--muted);
      background: var(--soft);
      font-size: 12px;
    }
    .chart-note,
    .small-text,
    .empty {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .chart-note { margin: 8px 0 0; }
    .chart-label {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      fill: var(--ink);
    }
    .chart-small {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      fill: var(--muted);
    }
    .chart-med {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 18px;
      font-weight: 700;
      fill: var(--ink);
    }
    .chart-big {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 40px;
      font-weight: 700;
      fill: var(--ink);
    }
    .chart-legend,
    .legend-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin: 0 0 8px;
      padding: 0;
      list-style: none;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: var(--muted);
    }
    .chart-legend span,
    .legend-list li {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .chart-legend i,
    .legend-swatch {
      display: inline-block;
      width: 10px;
      height: 10px;
      flex: 0 0 auto;
    }
    .legend-list strong { margin-left: auto; color: var(--ink); }
    .chart-with-legend {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 12px;
      align-items: center;
    }
    .chart-with-legend svg { max-height: 180px; }
    .source-list {
      margin: 0;
      padding-left: 22px;
    }
    .source-list li {
      margin: 8px 0;
      overflow-wrap: anywhere;
    }
    .source-list p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .url {
      margin-top: 2px;
      color: var(--muted);
      font-size: 10px;
    }
    @media (max-width: 980px) {
      .report-header,
      .two-column,
      .three-column {
        grid-template-columns: 1fr;
      }
      .kpi-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .callout-list,
      .risk-grid,
      .driver-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 640px) {
      .report {
        width: min(100vw - 16px, 1180px);
        padding-top: 8px;
      }
      .report-header {
        padding: 12px;
      }
      h1 { font-size: 26px; }
      .kpi-grid { grid-template-columns: 1fr; }
      .report-meta div { grid-template-columns: 1fr; }
      .section > :not(.section-title) { margin: 10px; }
      .section > :not(.section-title) { max-width: calc(100% - 20px); }
      .chart-with-legend { grid-template-columns: 1fr; }
      .data-table { font-size: 11px; }
      .data-table th,
      .data-table td { padding: 6px; }
    }
    @media print {
      .report {
        width: auto;
        padding: 0;
      }
      .section {
        break-inside: avoid;
      }
      a { color: var(--ink); }
    }
  </style>`;
}

export function renderReportWebPage(model: ReportModel): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Transitra Report - ${esc(model.shipment.product)}</title>
    ${styles()}
  </head>
  <body>
    <main class="report">
      ${reportHeader(model)}
      ${kpiGrid(model)}
      ${shipmentSection(model)}
      ${executiveSection(model)}
      ${impactSection(model)}
      ${commoditySection(model)}
      ${actionPlanSection(model)}
      ${routesSection(model)}
      ${transitSection(model)}
      ${geographySection(model)}
      ${portSection(model)}
      ${tariffSection(model)}
      ${landedCostSection(model)}
      ${risksSection(model)}
      ${driverSection(model)}
      ${dependencySection(model)}
      ${newsSection(model)}
      ${searchLogSection(model)}
      ${sourceAppendix(model)}
      ${closingSection(model)}
    </main>
  </body>
</html>`;
}
