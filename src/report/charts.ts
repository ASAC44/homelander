import type { ReportModel } from "./model.js";
import { escapeLatex } from "./escape.js";

function fmtPct(n: number): string {
  return n.toFixed(1);
}

function esc(s: string): string {
  return escapeLatex(s);
}

function tickLabel(s: string): string {
  return `{${esc(s)}}`;
}

function shortLabel(s: string, max = 24): string {
  const normalized = s.replace(/\s+/g, " ").trim();
  return normalized.length > max ? normalized.slice(0, max - 2) + ".." : normalized;
}

function riskColorName(score: number): string {
  if (score >= 70) return "riskred";
  if (score >= 40) return "riskamber";
  return "riskgreen";
}

function trendColorName(trend: "up" | "down" | "flat"): string {
  if (trend === "up") return "riskred";
  if (trend === "down") return "riskgreen";
  return "metatext";
}

function fmtCoord(n: number | null): string {
  return n === null ? "Unavailable" : n.toFixed(4);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function reportDate(model: ReportModel): Date {
  const parsed = Date.parse(model.generatedAt);
  return Number.isNaN(parsed) ? new Date() : new Date(parsed);
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function driverAxisPrecision(driver: ReportModel["drivers"][number]): number {
  const values = driver.series
    .flatMap((point) => [point.v, point.f])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), Math.abs(driver.current));
  if (/rate|fx|index/i.test(driver.unit) && maxAbs < 100) return 2;
  if (maxAbs < 20) return 2;
  if (maxAbs < 100) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Executive risk score meter
// ---------------------------------------------------------------------------
export function renderRiskScoreMeter(model: ReportModel): string {
  const color = riskColorName(model.riskScore);
  return `\\begin{tikzpicture}
  \\draw[linegray, line width=8pt, rounded corners=4pt] (0,0) -- (10,0);
  \\draw[${color}, line width=8pt, rounded corners=4pt] (0,0) -- (${Math.max(0.1, model.riskScore / 10)},0);
  \\node[anchor=west,font=\\bfseries\\Large,text=${color}] at (10.35,0) {${model.riskScore}/100};
  \\node[anchor=west,font=\\small\\color{metatext}] at (0,-0.55) {Low};
  \\node[anchor=center,font=\\small\\color{metatext}] at (5,-0.55) {Medium};
  \\node[anchor=east,font=\\small\\color{metatext}] at (10,-0.55) {High};
\\end{tikzpicture}`;
}

// ---------------------------------------------------------------------------
// Material exposure chart
// ---------------------------------------------------------------------------
export function renderMaterialExposureChart(model: ReportModel): string {
  const materials = model.commodity.materials.filter((m) => m.pct > 0);
  if (materials.length === 0) {
    return "\\textbf{Insufficient data available} -- no material composition was identified.";
  }

  const labels = materials.map((m) => tickLabel(m.material)).join(",");
  const ticks = materials.map((_, i) => i + 1).join(",");
  const coords = materials.map((m, i) => `(${m.pct},${i + 1})`).join(" ");

  return `\\begin{tikzpicture}
\\begin{axis}[
  xbar,
  xmin=0, xmax=100,
  xlabel={Share by estimated weight (\\%)},
  ytick={${ticks}},
  yticklabels={${labels}},
  y dir=reverse,
  width=\\textwidth,
  height=${Math.max(4.2, materials.length * 0.65)}cm,
  yticklabel style={font=\\small},
  nodes near coords,
  nodes near coords align={horizontal},
  every node near coord/.append style={font=\\scriptsize},
  grid=major,
  grid style={gray!20},
]
\\addplot[fill=accentteal!70,draw=accentteal] coordinates {${coords}};
\\end{axis}
\\end{tikzpicture}`;
}

// ---------------------------------------------------------------------------
// Landed-cost breakdown chart
// ---------------------------------------------------------------------------
export function renderLandedCostBreakdownChart(model: ReportModel): string {
  const lc = model.landedCost;
  const components = [
    { label: "Goods", value: lc.goodsValueUsd },
    { label: "Freight", value: lc.estimatedFreightUsd },
    { label: "Duty/Tax", value: lc.estimatedDutyUsd },
  ].filter((c) => c.value > 0);

  if (components.length === 0) {
    return "\\textbf{Insufficient data available} -- no priced landed-cost components are available.";
  }

  const labels = components.map((c) => tickLabel(c.label)).join(",");
  const ticks = components.map((_, i) => i + 1).join(",");
  const coords = components.map((c, i) => `(${i + 1},${c.value})`).join(" ");

  return `\\begin{tikzpicture}
\\begin{axis}[
  ybar,
  width=\\textwidth,
  height=5.3cm,
  xtick={${ticks}},
  xticklabels={${labels}},
  ylabel={USD},
  ymajorgrids=true,
  grid style={gray!25},
  scaled y ticks=false,
  yticklabel style={/pgf/number format/fixed,/pgf/number format/precision=0,/pgf/number format/use comma,/pgf/number format/1000 sep={,}},
  bar width=18pt,
  nodes near coords={\\pgfmathprintnumber[fixed,precision=0,use comma,1000 sep={,}]{\\pgfplotspointmeta}},
  every node near coord/.append style={font=\\scriptsize,rotate=90,anchor=west},
]
\\addplot[fill=brandcopper!75,draw=brandcopper] coordinates {${coords}};
\\end{axis}
\\end{tikzpicture}`;
}

// ---------------------------------------------------------------------------
// Cost forecast line chart - 30/60/90 day projections
// ---------------------------------------------------------------------------
export function renderCostForecastChart(model: ReportModel): string {
  const cf = model.costForecasts;
  if (cf.length < 2) {
    return "\\textbf{Insufficient data available} -- cost forecasts require at least two projection periods.";
  }

  const forecast = [{ horizonDays: 0, productCostPct: 0, freightCostPct: 0, landedCostPct: 0 }, ...cf];
  const coords = (field: "productCostPct" | "freightCostPct" | "landedCostPct"): string =>
    forecast.map((c) => `(${c.horizonDays},${c[field]})`).join(" ");
  const anchor = reportDate(model);
  const xticks = forecast.map((c) => c.horizonDays).join(",");
  const xticklabels = forecast
    .map((c) => tickLabel(c.horizonDays === 0 ? `Today (${shortDate(anchor)})` : shortDate(addDays(anchor, c.horizonDays))))
    .join(",");

  return `\\begin{tikzpicture}
\\begin{axis}[
  xlabel={Forecast date},
  ylabel={Change (\\%)},
  legend pos=north west,
  ymajorgrids=true,
  grid style={gray!30},
  width=\\textwidth,
  height=6cm,
  xtick={${xticks}},
  xticklabels={${xticklabels}},
  xticklabel style={font=\\small},
  /pgf/number format/.cd,use comma,precision=1,
]
\\addplot[color=accentblue,mark=*] coordinates {${coords("productCostPct")}};
\\addlegendentry{Product Cost}
\\addplot[color=brandcopper,mark=square] coordinates {${coords("freightCostPct")}};
\\addlegendentry{Freight Cost}
\\addplot[color=riskgreen,mark=triangle] coordinates {${coords("landedCostPct")}};
\\addlegendentry{Landed Cost}
\\end{axis}
\\end{tikzpicture}

\\vspace{0.5em}
\\noindent\\textbf{Analysis:} ${esc(describeCostForecast(model))}`;
}

function describeCostForecast(model: ReportModel): string {
  const cf = model.costForecasts;
  if (cf.length === 0) return "No forecast data available.";
  const last = cf[cf.length - 1];
  const parts: string[] = [];
  if (last.landedCostPct > 0) {
    parts.push(`Landed costs are projected to rise approximately ${fmtPct(last.landedCostPct)}% over ${last.horizonDays} days`);
  } else if (last.landedCostPct < 0) {
    parts.push(`Landed costs are projected to decrease approximately ${fmtPct(Math.abs(last.landedCostPct))}% over ${last.horizonDays} days`);
  } else {
    parts.push(`Landed costs are projected to remain stable over ${last.horizonDays} days`);
  }
  if (last.productCostPct > last.freightCostPct) {
    parts.push(", driven primarily by product cost increases.");
  } else {
    parts.push(", driven primarily by freight cost changes.");
  }
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Risk breakdown bar chart - sorted by score
// ---------------------------------------------------------------------------
export function renderRiskBarChart(model: ReportModel): string {
  if (model.risks.length === 0) {
    return "\\textbf{Insufficient data available} -- no risk factors identified.";
  }

  const sorted = [...model.risks].sort((a, b) => b.score - a.score);
  const barWidth = Math.max(4, sorted.length * 1.2);

  const coords = sorted
    .map((r, i) => `(${r.score},${i + 1})`)
    .join(" ");

  const labels = sorted.map((r) => tickLabel(r.label)).join(",");

  return `\\begin{center}
\\begin{tikzpicture}
\\begin{axis}[
  xbar,
  xlabel={Risk Score},
  ylabel={Risk Factor},
  xmin=0, xmax=100,
  width=0.68\\textwidth,
  height=${barWidth}cm,
  ytick={${sorted.map((_, i) => i + 1).join(",")}},
  yticklabels={${labels}},
  yticklabel style={font=\\small,text width=3.1cm,align=right},
  /pgf/number format/.cd,use comma,
  nodes near coords,
  nodes near coords align={horizontal},
]
\\addplot[fill=accentblue!60,draw=accentblue] coordinates {${coords}};
\\end{axis}
\\end{tikzpicture}
\\end{center}

\\vspace{0.5em}
\\noindent\\textbf{Analysis:} ${esc(describeTopRisks(sorted))}`;
}

function describeTopRisks(risks: ReportModel["risks"]): string {
  const top = risks.slice(0, 3);
  if (top.length === 0) return "No significant risks identified.";
  const desc = top.map((r) => `${r.label} (score ${r.score}/100) - ${r.actionable}`);
  return `The highest-priority risks are: ${desc.join("; ")}.`;
}

// ---------------------------------------------------------------------------
// Route comparison chart - grouped bar (cost + transit)
// ---------------------------------------------------------------------------
export function renderRouteComparisonChart(model: ReportModel): string {
  if (model.routes.length < 2) {
    return "\\textbf{Insufficient data available} -- at least two route options needed for comparison.";
  }

  const ticks = model.routes.map((_, i) => i + 1).join(",");
  const labels = model.routes.map((r) => tickLabel(r.method)).join(",");
  const costs = model.routes.map((r, i) => `(${i + 1},${r.cost})`).join(" ");
  const transit = model.routes.map((r, i) => `(${i + 1},${r.transitDays})`).join(" ");

  return `\\begin{minipage}[t]{0.49\\textwidth}
\\begin{tikzpicture}
\\begin{axis}[
  ybar,
  xtick={${ticks}},
  xticklabels={${labels}},
  xticklabel style={font=\\normalsize,rotate=15,anchor=east},
  width=\\textwidth,
  height=5.4cm,
  ylabel={Cost (USD)},
  ymajorgrids=true,
  grid style={gray!30},
  scaled y ticks=false,
  yticklabel style={font=\\small,/pgf/number format/fixed,/pgf/number format/precision=0,/pgf/number format/use comma,/pgf/number format/1000 sep={,}},
  bar width=10pt,
]
\\addplot[fill=accentblue!65,draw=accentblue] coordinates {${costs}};
\\end{axis}
\\end{tikzpicture}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.49\\textwidth}
\\begin{tikzpicture}
\\begin{axis}[
  ybar,
  xtick={${ticks}},
  xticklabels={${labels}},
  xticklabel style={font=\\scriptsize,rotate=20,anchor=east},
  width=\\textwidth,
  height=5.4cm,
  ylabel={Transit (days)},
  ymajorgrids=true,
  grid style={gray!30},
  bar width=10pt,
]
\\addplot[fill=brandcopper!70,draw=brandcopper] coordinates {${transit}};
\\end{axis}
\\end{tikzpicture}
\\end{minipage}

\\vspace{0.5em}
\\noindent\\textbf{Analysis:} ${esc(describeRouteChoice(model))}`;
}

function describeRouteChoice(model: ReportModel): string {
  if (model.routes.length === 0) return "No routes available.";
  const cheapest = [...model.routes].sort((a, b) => a.cost - b.cost)[0];
  const fastest = [...model.routes].sort((a, b) => a.transitDays - b.transitDays)[0];
  const rec = model.recommendedRoute;
  const parts: string[] = [];
  if (rec) {
    parts.push(`The recommended option is ${rec.method} at $${rec.cost.toLocaleString()} with approximately ${rec.transitDays} days transit`);
  }
  if (cheapest && cheapest.method !== rec?.method) {
    parts.push(`The lowest-cost option is ${cheapest.method} at $${cheapest.cost.toLocaleString()}`);
  }
  if (fastest && fastest.method !== rec?.method && fastest.method !== cheapest?.method) {
    parts.push(`The fastest option is ${fastest.method} at ${fastest.transitDays} days`);
  }
  return parts.join(". ") + ".";
}

// ---------------------------------------------------------------------------
// Driver trend mini charts - top 3-5 drivers
// ---------------------------------------------------------------------------
export function renderDriverCharts(model: ReportModel): string {
  if (model.drivers.length === 0) {
    return "\\textbf{Insufficient data available} -- no commodity/input driver data.";
  }

  const chunks: string[] = [];
  for (const [idx, d] of model.drivers.entries()) {
    const points = d.series.filter((p) => p.v !== null || p.f !== null);
    if (points.length < 2) {
      chunks.push(`${esc(d.name)}: \\textit{Insufficient data for trend chart.}`);
      continue;
    }
    const tickPoints = points
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => points.length <= 8 || i % 3 === 0 || i === points.length - 1);
    const xticks = tickPoints.map(({ i }) => i + 1).join(",");
    const xticklabels = tickPoints.map(({ p }) => tickLabel(shortLabel(p.t, 8))).join(",");
    const historyCoords = points
      .map((p, i) => (p.v === null ? null : `(${i + 1},${p.v})`))
      .filter((p): p is string => Boolean(p))
      .join(" ");
    const forecastCoords = points
      .map((p, i) => (p.f === null || p.f === undefined ? null : `(${i + 1},${p.f})`))
      .filter((p): p is string => Boolean(p))
      .join(" ");
    const trendLabel = d.trend === "up" ? "\\textcolor{riskred}{UP}" : d.trend === "down" ? "\\textcolor{riskgreen}{DOWN}" : "\\textcolor{metatext}{FLAT}";
    const lineColor = trendColorName(d.trend);
    const sourceLabel = d.priceLive ? "live" : "estimated";
    const forecastPlot = forecastCoords
      ? `\\addplot[color=accentblue,dashed,mark=none,line width=0.9pt] coordinates {${forecastCoords}};`
      : "";
    const axisPrecision = driverAxisPrecision(d);
    const ytickNumberFormat = axisPrecision === 0
      ? "/pgf/number format/fixed,/pgf/number format/precision=0,/pgf/number format/use comma,/pgf/number format/1000 sep={,}"
      : `/pgf/number format/fixed,/pgf/number format/precision=${axisPrecision}`;

    chunks.push(`\\begin{minipage}[t]{0.49\\textwidth}
\\driverpanel{${esc(d.name)}}{${esc(d.impact)}}{${sourceLabel}}{
${trendLabel} ${d.changePct > 0 ? "+" : ""}${fmtPct(d.changePct)}\\% \\quad Current: ${d.current.toLocaleString("en-US")} ${esc(d.unit)}

\\begin{tikzpicture}
\\begin{axis}[
  small,
  width=0.88\\linewidth,
  height=3.1cm,
  scaled y ticks=false,
  xtick={${xticks}},
  xticklabels={${xticklabels}},
  xticklabel style={font=\\scriptsize},
  yticklabel style={font=\\scriptsize,${ytickNumberFormat}},
  grid style={gray!20},
  scale only axis,
]
${historyCoords ? `\\addplot[color=${lineColor},mark=*] coordinates {${historyCoords}};` : ""}
${forecastPlot}
\\end{axis}
\\end{tikzpicture}

\\small ${esc(d.affects)}\\\\
\\textcolor{metatext}{Solid line is observed history; dashed blue line is forecast.}\\\\
\\textcolor{metatext}{60-day forecast: ${d.forecastPct > 0 ? "+" : ""}${fmtPct(d.forecastPct)}\\%. ${esc(d.forecastNote || "Forecast rationale unavailable.")}}
}
\\end{minipage}${idx % 2 === 0 ? "\\hfill" : "\\\\[0.8em]"}`);
  }

  return chunks.join("\n");
}

// ---------------------------------------------------------------------------
// Dependency graph - TikZ tree
// ---------------------------------------------------------------------------
export function renderDependencyGraph(model: ReportModel): string {
  const drivers = model.drivers;
  if (drivers.length > 0) {
    const nodes = drivers.map((d, i) => {
      const angle = Math.round((i / drivers.length) * 360 - 90);
      const color = d.impact === "high" ? "riskred" : d.impact === "medium" ? "brandcopper" : "metatext";
      return `\\node[depnode,draw=${color},text=${color}] (d${i}) at (${angle}:3.2cm) {${esc(d.name)}\\\\[-1pt]{\\scriptsize ${d.changePct > 0 ? "+" : ""}${fmtPct(d.changePct)}\\%}};`;
    });
    const edges = drivers.map((d, i) => {
      const color = d.impact === "high" ? "riskred" : d.impact === "medium" ? "brandcopper" : "metatext";
      return `\\draw[${color},line width=${d.impact === "high" ? "1.2pt" : "0.8pt"},opacity=0.65] (center) -- (d${i});`;
    });

    return `\\begin{center}
\\begin{tikzpicture}[
  depnode/.style={rounded corners=4pt,fill=white,align=center,font=\\scriptsize,inner sep=4pt,text width=2.35cm},
]
\\node[rounded corners=10pt,fill=accentteal!15,draw=accentteal,text=brandsteel,align=center,font=\\bfseries,text width=3.1cm,inner sep=7pt] (center) at (0,0) {${esc(model.commodity.productCategory)}};
${nodes.join("\n")}
${edges.join("\n")}
\\end{tikzpicture}
\\end{center}

\\noindent\\textbf{Analysis:} ${esc(describeDriverDependencies(model))}`;
  }

  if (model.dependencyGraph.length === 0) {
    return "\\textbf{Insufficient data available} -- no dependency information.";
  }

  const dep = model.dependencyGraph[0];
  const children = dep.children;
  const nodes = children.map((child, i) => {
    const angle = Math.round((i / children.length) * 360 - 90);
    return `\\node[depnode] (c${i}) at (${angle}:3cm) {${esc(child)}};`;
  });
  const edges = children.map((_, i) => `\\draw[accentblue,opacity=0.55] (center) -- (c${i});`);

  return `\\begin{center}
\\begin{tikzpicture}[
  depnode/.style={rounded corners=4pt,draw=linegray,fill=white,align=center,font=\\scriptsize,inner sep=4pt,text width=2.2cm},
]
\\node[rounded corners=8pt,fill=accentteal!15,draw=accentteal,align=center,font=\\bfseries,text width=3cm,inner sep=7pt] (center) at (0,0) {${esc(dep.node)}};
${nodes.join("\n")}
${edges.join("\n")}
\\end{tikzpicture}
\\end{center}

\\vspace{0.5em}
\\noindent\\textbf{Analysis:} ${esc(describeDependencies(model))}`;
}

function describeDriverDependencies(model: ReportModel): string {
  const highImpact = model.drivers.filter((d) => d.impact === "high").map((d) => d.name);
  if (highImpact.length > 0) {
    return `High-impact dependencies for this shipment include ${highImpact.join(", ")}. These drivers should be re-checked before locking price or freight.`;
  }
  return `The dependency map shows ${model.drivers.length} tracked cost and logistics drivers for this shipment.`;
}

function describeDependencies(model: ReportModel): string {
  if (model.dependencyGraph.length === 0) return "No dependency data.";
  const totalChildren = model.dependencyGraph.reduce((s, d) => s + d.children.length, 0);
  return `The product category ${model.dependencyGraph[0]?.node ?? "unknown"} has ${totalChildren} identified upstream dependencies that may affect supply, pricing, and availability.`;
}

// ---------------------------------------------------------------------------
// Route map sketch
// ---------------------------------------------------------------------------
export function renderRouteMapSketch(model: ReportModel): string {
  if (!model.geo) {
    return "\\textbf{Route geography unavailable} -- origin and destination could not be geocoded.";
  }

  const ports = model.portOptions;
  const portMarks = ports.map((p, i) => {
    const x = ports.length === 1 ? 4.5 : 2.2 + i * (4.6 / Math.max(1, ports.length - 1));
    const color = p.recommended ? "accentteal" : riskColorName(p.congestionScore);
    return `\\node[portnode,draw=${color},text=${color}] at (${x},0.9) {${esc(p.name)}\\\\{\\scriptsize ${p.congestionScore}/100}};`;
  });

  return `\\begin{center}
\\begin{tikzpicture}[
  endpoint/.style={rounded corners=5pt,fill=white,draw=accentblue,align=center,text width=2.3cm,inner sep=5pt,font=\\small},
  portnode/.style={rounded corners=4pt,fill=white,align=center,text width=1.55cm,inner sep=3pt,font=\\scriptsize},
]
\\node[endpoint] (origin) at (0,0) {\\textbf{Origin}\\\\${esc(model.geo.origin.name)}};
\\node[endpoint,draw=brandcopper] (dest) at (9,0) {\\textbf{Destination}\\\\${esc(model.geo.destination.name)}};
\\draw[accentblue,line width=1.5pt,dashed,->] (origin) -- (dest);
${portMarks.join("\n")}
\\node[font=\\small\\color{metatext}] at (4.5,-0.7) {Approx. great-circle distance: ${model.geo.distanceKm.toLocaleString("en-US")} km};
\\end{tikzpicture}
\\end{center}

\\vspace{0.45em}
${renderGeoDetailTable(model)}`;
}

function renderGeoDetailTable(model: ReportModel): string {
  if (!model.geo) return "";
  const rows = [
    `Origin & ${esc(model.geo.origin.name)} & ${fmtCoord(model.geo.origin.lat)} & ${fmtCoord(model.geo.origin.lng)} & Shipment origin \\\\`,
    `Destination & ${esc(model.geo.destination.name)} & ${fmtCoord(model.geo.destination.lat)} & ${fmtCoord(model.geo.destination.lng)} & Shipment destination \\\\`,
    ...model.portOptions.map((p) =>
      `Candidate port & ${esc(p.name)} & ${fmtCoord(p.lat)} & ${fmtCoord(p.lng)} & ${p.recommended ? "Recommended; " : ""}congestion ${p.congestionScore}/100, wait ${p.waitDays}d \\\\`,
    ),
  ];
  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.17\\textwidth}>{\\raggedright\\arraybackslash}p{0.24\\textwidth}rr>{\\raggedright\\arraybackslash}X}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Point} & \\textbf{Name} & \\textbf{Lat} & \\textbf{Lng} & \\textbf{Detail} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}`;
}

// ---------------------------------------------------------------------------
// Port comparison table/chart
// ---------------------------------------------------------------------------
export function renderPortComparison(model: ReportModel): string {
  const ports = model.portOptions;
  if (ports.length === 0) {
    return "\\textbf{Insufficient data available} -- no port comparison data.";
  }

  const rows = ports.map((p) => {
    const flag = p.recommended ? " (Recommended)" : "";
    return `${esc(p.name)}${flag} & ${p.congestionScore}/100 & ${p.waitDays} & \\$${p.freightCost.toLocaleString()} & ${esc(p.note)} \\\\`;
  });

  const labels = ports.map((p) => tickLabel(p.name)).join(",");
  const ticks = ports.map((_, i) => i + 1).join(",");
  const congestion = ports.map((p, i) => `(${p.congestionScore},${i + 1})`).join(" ");

  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.23\\textwidth}ccrX}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Port} & \\textbf{Congestion} & \\textbf{Wait} & \\textbf{Freight} & \\textbf{Note} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}

  \\vspace{0.7em}
  \\begin{tikzpicture}
  \\begin{axis}[
    xbar,
    xmin=0, xmax=100,
    xlabel={Congestion score},
    ytick={${ticks}},
    yticklabels={${labels}},
    y dir=reverse,
    width=\\textwidth,
    height=${Math.max(4, ports.length * 0.75)}cm,
    yticklabel style={font=\\small},
    nodes near coords,
    grid=major,
    grid style={gray!20},
  ]
  \\addplot[fill=brandcopper!65,draw=brandcopper] coordinates {${congestion}};
  \\end{axis}
  \\end{tikzpicture}

  \\vspace{0.5em}
  \\noindent\\textbf{Analysis:} ${esc(describePortChoice(model))} ${esc(describePortPriceContext(model))}

  \\vspace{0.8em}
  \\noindent\\textbf{Port intelligence sources}

  ${renderPortSourcesTable(model)}`;
}

function describePortPriceContext(model: ReportModel): string {
  const route = model.recommendedRoute ?? model.routes.find((r) => r.recommended) ?? model.routes[0] ?? null;
  const method = route?.method ?? "the selected route";
  return `Freight estimates are shown for ${method}; congestion values are sourced through Bright Data retrieval.`;
}

function describePortChoice(model: ReportModel): string {
  const ports = model.portOptions;
  if (ports.length === 0) return "No port data.";
  const rec = ports.find((p) => p.recommended);
  if (rec) {
    return `${rec.name} is recommended with a congestion score of ${rec.congestionScore}/100 and approximately ${rec.waitDays} day wait time.`;
  }
  const best = [...ports].sort((a, b) => a.congestionScore - b.congestionScore)[0];
  return `${best.name} has the lowest congestion at ${best.congestionScore}/100.`;
}

function renderPortSourcesTable(model: ReportModel): string {
  const rows = model.portOptions.flatMap((port) =>
    port.sources.map((source) =>
      `${esc(port.name)} & ${esc(source.title)} & ${esc(source.snippet ?? "No excerpt available.")} \\\\`,
    ),
  );
  if (rows.length === 0) {
    return "\\textit{No port source excerpts were attached.}";
  }
  return `\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.22\\textwidth}>{\\raggedright\\arraybackslash}p{0.28\\textwidth}X}
    \\arrayrulecolor{linegray}
    \\toprule
    \\rowcolor{warmpanel}\\textbf{Port} & \\textbf{Source} & \\textbf{Excerpt} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}`;
}
