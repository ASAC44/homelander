import type { ReportModel } from "./model.js";

function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function renderReportWebPage(model: ReportModel): string {
  const payload = jsonForScript(model);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Transitra Report - ${model.shipment.product}</title>
    <style>
      :root {
        --bg: #f7f2ea;
        --panel: #fffaf3;
        --panel-strong: #efe4d5;
        --ink: #26323a;
        --muted: #655f59;
        --line: #d9cbbb;
        --accent: #8b5539;
        --accent-strong: #34444f;
        --good: #476251;
        --warn: #9f6727;
        --bad: #983d31;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Inter", system-ui, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(139,85,57,0.08), transparent 30%),
          linear-gradient(180deg, #fbf7f1 0%, var(--bg) 100%);
        color: var(--ink);
      }
      a { color: var(--accent); }
      .page {
        max-width: 1240px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }
      .hero {
        background: linear-gradient(135deg, rgba(52,68,79,0.98), rgba(67,49,40,0.96));
        color: #f6eee4;
        border-radius: 28px;
        padding: 28px;
        box-shadow: 0 22px 50px rgba(52,68,79,0.22);
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 12px;
        color: #dac6b7;
      }
      .hero h1 {
        margin: 10px 0 14px;
        font-size: clamp(30px, 6vw, 52px);
        line-height: 1;
      }
      .hero p {
        margin: 0;
        max-width: 78ch;
        color: #f4e8db;
        font-size: 16px;
        line-height: 1.65;
      }
      .hero-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 22px;
      }
      .meta-chip, .card, .section, .source, .timeline-item {
        border: 1px solid var(--line);
        background: var(--panel);
      }
      .meta-chip {
        border-radius: 18px;
        padding: 14px 16px;
      }
      .meta-chip strong {
        display: block;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .content-grid {
        display: grid;
        grid-template-columns: 1.5fr 0.95fr;
        gap: 22px;
        margin-top: 22px;
      }
      .stack { display: grid; gap: 18px; }
      .section {
        border-radius: 24px;
        padding: 22px;
        box-shadow: 0 10px 30px rgba(91,73,56,0.06);
      }
      .section h2 {
        margin: 0 0 16px;
        font-size: 24px;
        color: var(--accent-strong);
      }
      .subtle {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
      }
      .metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 14px;
      }
      .card {
        border-radius: 20px;
        padding: 18px;
      }
      .card strong {
        display: block;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
        margin-bottom: 10px;
      }
      .value {
        font-size: 28px;
        font-weight: 700;
        color: var(--accent-strong);
      }
      .table {
        width: 100%;
        border-collapse: collapse;
      }
      .table th, .table td {
        padding: 12px 10px;
        text-align: left;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
        font-size: 14px;
      }
      .table th {
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 700;
      }
      .pill.high { background: rgba(152,61,49,0.13); color: var(--bad); }
      .pill.medium { background: rgba(159,103,39,0.13); color: var(--warn); }
      .pill.low { background: rgba(71,98,81,0.13); color: var(--good); }
      .risk-list, .source-list, .fact-list {
        display: grid;
        gap: 12px;
      }
      .source, .timeline-item {
        border-radius: 18px;
        padding: 14px 16px;
      }
      .chart-wrap {
        margin-top: 12px;
        border-radius: 18px;
        padding: 12px;
        background: linear-gradient(180deg, rgba(239,228,213,0.4), rgba(255,250,243,0.85));
        border: 1px solid var(--line);
      }
      .timeline {
        display: grid;
        gap: 10px;
      }
      .footer-note {
        margin-top: 22px;
        padding: 18px;
        border-radius: 18px;
        background: #f1e5d8;
        border: 1px solid var(--line);
        color: var(--muted);
        line-height: 1.65;
      }
      @media (max-width: 980px) {
        .content-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 640px) {
        .page { padding: 18px 12px 42px; }
        .hero { padding: 20px; border-radius: 22px; }
        .section { padding: 18px; border-radius: 20px; }
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script id="report-data" type="application/json">${payload}</script>
    <script type="module">
      import React from "https://esm.sh/react@18";
      import { createRoot } from "https://esm.sh/react-dom@18/client";
      import htm from "https://esm.sh/htm@3.1.1";

      const html = htm.bind(React.createElement);
      const report = JSON.parse(document.getElementById("report-data").textContent);

      const fmtUsd = (n) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
      const fmtPct = (n) => \`\${n > 0 ? "+" : ""}\${Number(n).toFixed(1)}%\`;
      const riskLevel = (score) => score >= 70 ? "high" : score >= 40 ? "medium" : "low";
      const topRisks = [...report.risks].sort((a, b) => b.score - a.score);

      function MiniBarChart({ items, valueKey, labelKey, color }) {
        const max = Math.max(...items.map((item) => Math.max(1, item[valueKey])), 1);
        return html\`
          <div className="chart-wrap">
            <svg viewBox="0 0 520 260" width="100%" role="img">
              <rect x="0" y="0" width="520" height="260" fill="transparent" />
              \${items.map((item, index) => {
                const barHeight = (item[valueKey] / max) * 150;
                const x = 32 + index * (440 / Math.max(items.length, 1));
                const y = 190 - barHeight;
                return html\`
                  <g key=\${item[labelKey] + index}>
                    <rect x=\${x} y=\${y} width="42" height=\${barHeight} rx="10" fill=\${color} opacity="0.85" />
                    <text x=\${x + 21} y="212" text-anchor="middle" font-size="11" fill="#655f59">\${String(item[labelKey]).slice(0, 12)}</text>
                    <text x=\${x + 21} y=\${y - 8} text-anchor="middle" font-size="11" fill="#26323a">\${Math.round(item[valueKey])}</text>
                  </g>
                \`;
              })}
            </svg>
          </div>
        \`;
      }

      function LineChart({ series, color, title, valueFormatter = (v) => v }) {
        const points = series.filter((p) => p.v !== null);
        if (points.length < 2) return html\`<div className="subtle">Insufficient chart data.</div>\`;
        const max = Math.max(...points.map((p) => p.v), 1);
        const min = Math.min(...points.map((p) => p.v), 0);
        const range = Math.max(max - min, 1);
        const plot = points.map((point, index) => {
          const x = 36 + (index * 420) / Math.max(points.length - 1, 1);
          const y = 170 - ((point.v - min) / range) * 120;
          return { ...point, x, y };
        });
        const path = plot.map((p, i) => \`\${i === 0 ? "M" : "L"} \${p.x} \${p.y}\`).join(" ");
        return html\`
          <div className="chart-wrap">
            <div className="subtle" style=\${{ marginBottom: "6px" }}>\${title}</div>
            <svg viewBox="0 0 520 220" width="100%" role="img">
              <path d=\${path} fill="none" stroke=\${color} stroke-width="4" stroke-linecap="round" />
              \${plot.map((p) => html\`
                <g key=\${p.t}>
                  <circle cx=\${p.x} cy=\${p.y} r="5" fill=\${color} />
                  <text x=\${p.x} y="200" text-anchor="middle" font-size="11" fill="#655f59">\${p.t}</text>
                  <text x=\${p.x} y=\${p.y - 10} text-anchor="middle" font-size="11" fill="#26323a">\${valueFormatter(p.v)}</text>
                </g>
              \`)}
            </svg>
          </div>
        \`;
      }

      function App() {
        return html\`
          <div className="page">
            <section className="hero">
              <div className="eyebrow">Transitra Executive Report</div>
              <h1>\${report.shipment.product}</h1>
              <p>\${report.executiveSummary}</p>
              <div className="hero-meta">
                <div className="meta-chip"><strong>Lane</strong><span>\${report.shipment.origin} -> \${report.shipment.destination}</span></div>
                <div className="meta-chip"><strong>Generated</strong><span>\${report.generatedAt}</span></div>
                <div className="meta-chip"><strong>Confidence</strong><span>\${report.confidence}</span></div>
                <div className="meta-chip"><strong>Data Mode</strong><span>\${report.dataMode.toUpperCase()}</span></div>
              </div>
            </section>

            <div className="content-grid">
              <div className="stack">
                <section className="section">
                  <h2>Decision Snapshot</h2>
                  <div className="metric-grid">
                    <div className="card"><strong>Recommended Route</strong><div className="value">\${report.recommendedRoute ? report.recommendedRoute.method : "N/A"}</div></div>
                    <div className="card"><strong>Landed Cost</strong><div className="value">$\${fmtUsd(report.landedCost.estimatedTotalUsd)}</div></div>
                    <div className="card"><strong>Transit Estimate</strong><div className="value">\${report.recommendedRoute ? report.recommendedRoute.transitDays : "N/A"} days</div></div>
                    <div className="card"><strong>Duty Estimate</strong><div className="value">\${report.landedCost.totalDutyPct}%</div></div>
                  </div>
                </section>

                <section className="section">
                  <h2>Route and Cost</h2>
                  <table className="table">
                    <thead><tr><th>Method</th><th>Cost</th><th>Transit</th><th>Note</th></tr></thead>
                    <tbody>
                      \${report.routes.map((route) => html\`<tr key=\${route.method}><td>\${route.method}\${route.recommended ? " (Recommended)" : ""}</td><td>$\${fmtUsd(route.cost)}</td><td>\${route.transitDays} days</td><td>\${route.note}</td></tr>\`)}
                    </tbody>
                  </table>
                  \${html\`<\${MiniBarChart} items=\${report.routes} valueKey="cost" labelKey="method" color="#8b5539" />\`}
                  \${html\`<\${LineChart}
                    title="Projected landed-cost movement"
                    series=\${report.costForecasts.map((p) => ({ t: \`\${p.horizonDays}d\`, v: p.landedCostPct }))}
                    color="#34444f"
                    valueFormatter=\${(v) => fmtPct(v)}
                  />\`}
                </section>

                <section className="section">
                  <h2>Customs and Documentation</h2>
                  <table className="table">
                    <tbody>
                      <tr><th>HS Code</th><td>\${report.tariff ? report.tariff.hsCode : "Unavailable"}</td></tr>
                      <tr><th>Base duty</th><td>\${report.tariff ? report.tariff.baseDutyPct : 0}%</td></tr>
                      <tr><th>Total duty</th><td>\${report.tariff ? report.tariff.totalDutyPct : 0}%</td></tr>
                      <tr><th>Notes</th><td>\${report.tariff ? report.tariff.notes : "Tariff analysis unavailable."}</td></tr>
                    </tbody>
                  </table>
                  <div className="source-list" style=\${{ marginTop: "14px" }}>
                    \${report.documents.map((doc) => html\`
                      <div className="source" key=\${doc.name}>
                        <strong>\${doc.name}</strong>
                        <div className="subtle">\${doc.url ? html\`<a href=\${doc.url} target="_blank" rel="noreferrer">\${doc.url}</a>\` : "Official source not available"}</div>
                      </div>
                    \`)}
                  </div>
                </section>

                <section className="section">
                  <h2>Sources</h2>
                  <div className="source-list">
                    \${report.sources.map((source) => html\`
                      <article className="source" key=\${source.url}>
                        <strong>\${source.title}</strong>
                        <div className="subtle"><a href=\${source.url} target="_blank" rel="noreferrer">\${source.url}</a></div>
                        \${source.snippet ? html\`<p className="subtle" style=\${{ marginBottom: 0 }}>\${source.snippet}</p>\` : null}
                      </article>
                    \`)}
                  </div>
                </section>
              </div>

              <div className="stack">
                <section className="section">
                  <h2>Risk Watchlist</h2>
                  <div className="risk-list">
                    \${topRisks.map((risk) => html\`
                      <div className="card" key=\${risk.label}>
                        <div style=\${{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                          <strong style=\${{ marginBottom: 0, color: "#26323a", fontSize: "16px", textTransform: "none", letterSpacing: "normal" }}>\${risk.label}</strong>
                          <span className=\${\`pill \${riskLevel(risk.score)}\`}>\${risk.score}/100</span>
                        </div>
                        <p className="subtle">\${risk.actionable}</p>
                        <div className="subtle">\${risk.keyFindings.join("; ") || risk.detail}</div>
                      </div>
                    \`)}
                  </div>
                  \${html\`<\${MiniBarChart} items=\${topRisks.slice(0, 5)} valueKey="score" labelKey="label" color="#34444f" />\`}
                </section>

                <section className="section">
                  <h2>Shipment Snapshot</h2>
                  <div className="fact-list">
                    <div className="card"><strong>Product</strong><div>\${report.shipment.product}</div></div>
                    <div className="card"><strong>Weight</strong><div>\${fmtUsd(report.shipment.weightKg)} kg</div></div>
                    <div className="card"><strong>Ship Date</strong><div>\${report.shipment.shipDate}</div></div>
                    <div className="card"><strong>Container</strong><div>\${report.shipment.containerSize || "Not specified"}</div></div>
                  </div>
                </section>

                <section className="section">
                  <h2>Driver Trends</h2>
                  <div className="timeline">
                    \${report.drivers.map((driver) => html\`
                      <div className="timeline-item" key=\${driver.name}>
                        <div style=\${{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <strong>\${driver.name}</strong>
                          <span className=\${\`pill \${driver.trend === "up" ? "high" : driver.trend === "down" ? "low" : "medium"}\`}>\${fmtPct(driver.changePct)}</span>
                        </div>
                        <div className="subtle">\${driver.affects} · \${driver.unit}</div>
                        \${html\`<\${LineChart} title="Trend" series=\${driver.series.filter((p) => p.v !== null)} color="#8b5539" valueFormatter=\${(v) => Math.round(v)} />\`}
                      </div>
                    \`)}
                  </div>
                </section>

                <section className="section">
                  <h2>Port Comparison</h2>
                  <table className="table">
                    <thead><tr><th>Port</th><th>Congestion</th><th>Wait</th><th>Freight</th></tr></thead>
                    <tbody>
                      \${report.portOptions.map((port) => html\`<tr key=\${port.name}><td>\${port.name}\${port.recommended ? " (Recommended)" : ""}</td><td>\${port.congestionScore}/100</td><td>\${port.waitDays} days</td><td>$\${fmtUsd(port.freightCost)}</td></tr>\`)}
                    </tbody>
                  </table>
                </section>
              </div>
            </div>

            <div className="footer-note">
              <strong>Assumptions:</strong> \${report.assumptions.join(" | ") || "None recorded."}<br />
              <strong>Limitations:</strong> \${report.limitations.join(" | ") || "None recorded."}<br />
              <strong>Disclaimer:</strong> \${report.disclaimer}
            </div>
          </div>
        \`;
      }

      createRoot(document.getElementById("root")).render(html\`<\${App} />\`);
    </script>
  </body>
</html>`;
}
