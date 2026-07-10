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

// ---------------------------------------------------------------------------
// Cost forecast line chart - 30/60/90 day projections
// ---------------------------------------------------------------------------
export function renderCostForecastChart(model: ReportModel): string {
  const cf = model.costForecasts;
  if (cf.length < 2) {
    return "\\textbf{Insufficient data available} -- cost forecasts require at least two projection periods.";
  }

  const coords = (field: "productCostPct" | "freightCostPct" | "landedCostPct"): string =>
    cf.map((c) => `(${c.horizonDays},${c[field]})`).join(" ");

  return `\\begin{tikzpicture}
\\begin{axis}[
  xlabel={Horizon (days)},
  ylabel={Change (\\%)},
  legend pos=north west,
  ymajorgrids=true,
  grid style={gray!30},
  width=\\textwidth,
  height=6cm,
  /pgf/number format/.cd,use comma,precision=1,
]
\\addplot[color=accentblue,mark=*] coordinates {${coords("productCostPct")}};
\\addlegendentry{Product Cost}
\\addplot[color=red!70!black,mark=square] coordinates {${coords("freightCostPct")}};
\\addlegendentry{Freight Cost}
\\addplot[color=green!50!black,mark=triangle] coordinates {${coords("landedCostPct")}};
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

  const labels = sorted.map((r) => tickLabel(r.label.substring(0, 20))).join(",");

  return `\\begin{tikzpicture}
\\begin{axis}[
  xbar,
  xlabel={Risk Score},
  ylabel={Risk Factor},
  xmin=0, xmax=100,
  width=\\textwidth,
  height=${barWidth}cm,
  ytick={${sorted.map((_, i) => i + 1).join(",")}},
  yticklabels={${labels}},
  yticklabel style={font=\\normalsize},
  /pgf/number format/.cd,use comma,
  nodes near coords,
  nodes near coords align={horizontal},
]
\\addplot[fill=accentblue!60,draw=accentblue] coordinates {${coords}};
\\end{axis}
\\end{tikzpicture}

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

  return `\\begin{tikzpicture}
\\begin{axis}[
  ybar,
  xtick={${ticks}},
  xticklabels={${labels}},
  xticklabel style={font=\\normalsize,rotate=15,anchor=east},
  width=\\textwidth,
  height=6cm,
  legend pos=north west,
  ylabel={Cost (USD)},
  ymajorgrids=true,
  grid style={gray!30},
  /pgf/number format/.cd,use comma,
  bar width=8pt,
]
\\addplot[fill=accentblue!60,draw=accentblue] coordinates {${costs}};
\\addlegendentry{Cost}
\\end{axis}
\\end{tikzpicture}

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
  for (const d of model.drivers) {
    const points = d.series.filter((p) => p.v !== null);
    if (points.length < 2) {
      chunks.push(`${esc(d.name)}: \\textit{Insufficient data for trend chart.}`);
      continue;
    }
    const xticks = points.map((_, i) => i + 1).join(",");
    const xticklabels = points.map((p) => tickLabel(p.t)).join(",");
    const coords = points.map((p, i) => `(${i + 1},${p.v})`).join(" ");
    const trendLabel = d.trend === "up" ? "\\textcolor{red}{UP}" : d.trend === "down" ? "\\textcolor{green!60!black}{DOWN}" : "\\textcolor{gray}{FLAT}";

    chunks.push(`\\noindent\\textbf{${esc(d.name)}} \\hfill ${trendLabel} ${d.changePct > 0 ? "+" : ""}${fmtPct(d.changePct)}\\% (${esc(d.unit)}) \\\\
\\begin{tikzpicture}
\\begin{axis}[
  small,
  width=0.45\\textwidth,
  height=2.5cm,
  /pgf/number format/.cd,use comma,precision=0,
  xtick={${xticks}},
  xticklabels={${xticklabels}},
  xticklabel style={font=\\normalsize},
  yticklabel style={font=\\normalsize},
  grid style={gray!20},
  scale only axis,
]
\\addplot[color=accentblue] coordinates {${coords}};
\\end{axis}
\\end{tikzpicture}
\\hfill
\\begin{minipage}{0.45\\textwidth}
\\small ${esc(d.affects)} - Impact: ${d.impact}
\\end{minipage}
\\vspace{0.5em}
`);
  }

  return chunks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Dependency graph - TikZ tree
// ---------------------------------------------------------------------------
export function renderDependencyGraph(model: ReportModel): string {
  if (model.dependencyGraph.length === 0) {
    return "\\textbf{Insufficient data available} -- no dependency information.";
  }

  const nodes: string[] = [];
  const edges: string[] = [];
  let nodeIdx = 0;

  for (const dep of model.dependencyGraph) {
    const parentId = `n${nodeIdx++}`;
    nodes.push(`\\node[draw,rounded corners,fill=lightgray,inner sep=3pt] (${parentId}) {${esc(dep.node)}};`);
    for (const child of dep.children) {
      const childId = `n${nodeIdx++}`;
      nodes.push(`\\node[draw,rounded corners,fill=lightgray,inner sep=3pt] (${childId}) {${esc(child)}};`);
      edges.push(`\\draw[->,accentblue] (${parentId}) -- (${childId});`);
    }
  }

  return `\\begin{tikzpicture}[
  node distance=1.5cm and 2.5cm,
  every node/.style={font=\\normalsize},
  >=stealth,
]
${nodes.join("\n  ")}
${edges.join("\n  ")}
\\end{tikzpicture}

\\vspace{0.5em}
\\noindent\\textbf{Analysis:} ${esc(describeDependencies(model))}`;
}

function describeDependencies(model: ReportModel): string {
  if (model.dependencyGraph.length === 0) return "No dependency data.";
  const totalChildren = model.dependencyGraph.reduce((s, d) => s + d.children.length, 0);
  return `The product category ${model.dependencyGraph[0]?.node ?? "unknown"} has ${totalChildren} identified upstream dependencies that may affect supply, pricing, and availability.`;
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

  return `\\begin{tabularx}{\\textwidth}{lcrrX}
    \\toprule
    \\textbf{Port} & \\textbf{Congestion} & \\textbf{Wait (days)} & \\textbf{Freight} & \\textbf{Note} \\\\
    \\midrule
    ${rows.join("\n    ")}
    \\bottomrule
  \\end{tabularx}

  \\vspace{0.5em}
  \\noindent\\textbf{Analysis:} ${esc(describePortChoice(model))}`;
}

function describePortChoice(model: ReportModel): string {
  const ports = model.portOptions;
  if (ports.length === 0) return "No port data.";
  const rec = ports.find((p) => p.recommended);
  if (rec) {
    return `${rec.name} is recommended with a congestion score of ${rec.congestionScore}/100 and approximately ${rec.waitDays} day wait time.`;
  }
  const best = ports.sort((a, b) => a.congestionScore - b.congestionScore)[0];
  return `${best.name} has the lowest congestion at ${best.congestionScore}/100.`;
}
