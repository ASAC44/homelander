import assert from "node:assert/strict";
import test from "node:test";
import { buildReportModel } from "../src/report/model.js";
import { renderReportWebPage } from "../src/report/web.js";
import type { AnalysisResult, DependencyDriver } from "../src/lib/types.js";

const source = {
  title: "Official customs guidance",
  url: "https://example.gov/customs",
  snippet: "Official customs source excerpt for synthetic test data.",
};

function driver(id: number): DependencyDriver {
  return {
    name: `Driver ${id}`,
    unit: "index",
    current: 100 + id,
    changePct: id,
    trend: id % 2 === 0 ? "down" : "up",
    impact: id <= 2 ? "high" : id <= 4 ? "medium" : "low",
    affects: `Cost input ${id}`,
    forecastPct: id + 1,
    forecastNote: `Forecast note ${id}`,
    priceLive: id % 2 === 1,
    series: [
      { t: "W-3", v: 90 + id },
      { t: "W-2", v: 95 + id },
      { t: "W-1", v: 100 + id },
      { t: "F+1", v: null, f: 103 + id },
    ],
    sources: [{ ...source, title: `Driver ${id} source`, url: `https://example.gov/driver-${id}` }],
  };
}

function completeAnalysis(): AnalysisResult {
  return {
    input: {
      product: "Synthetic cotton shirts",
      origin: "Mumbai, India",
      destination: "New York, United States",
      weightKg: 12000,
      quantity: 50000,
      shipDate: "2026-09-01",
      shippingMode: "Ocean Freight",
      containerSize: "40ft",
      pricePerKg: 8,
      specialRequirements: ["Standard ambient"],
      locked: ["Goods"],
    },
    productCategory: "Cotton apparel",
    hsCodes: ["6205.20"],
    materials: [
      { material: "Cotton", pct: 88 },
      { material: "Polyester", pct: 12 },
    ],
    dependencyGraph: [{ node: "Cotton apparel", children: ["Cotton fiber", "Ocean freight", "Dye chemicals"] }],
    drivers: [driver(1), driver(2), driver(3), driver(4), driver(5), driver(6)],
    riskScore: 72,
    riskFactors: [
      {
        category: "freight",
        score: 80,
        label: "Freight capacity",
        detail: "Capacity is tight around the sailing window.",
        actionable: "Lock freight before the cutoff date.",
        trend: "up",
        keyFindings: ["Space is constrained", "Rates are moving upward"],
        sources: [{ ...source, title: "Freight source", url: "https://example.gov/freight" }],
      },
      {
        category: "regulatory",
        score: 62,
        label: "Documentation checks",
        detail: "Product paperwork must be verified.",
        actionable: "Confirm certificate of origin requirements.",
        trend: "flat",
        keyFindings: ["Certificate may be required"],
        sources: [{ ...source, title: "Regulatory source", url: "https://example.gov/regulatory" }],
      },
    ],
    costForecasts: [
      { horizonDays: 30, productCostPct: 2.1, freightCostPct: 4.4, landedCostPct: 3.2 },
      { horizonDays: 60, productCostPct: 3.4, freightCostPct: 6.7, landedCostPct: 5.2 },
      { horizonDays: 90, productCostPct: 4.1, freightCostPct: 7.3, landedCostPct: 5.9 },
    ],
    expectedCostIncreasePct: 5.9,
    expectedDelayDays: [4, 9],
    routes: [
      { method: "Ocean Freight", cost: 8400, transitDays: 28, recommended: true, note: "Best cost and timing balance." },
      { method: "Air Freight", cost: 42000, transitDays: 6, recommended: false, note: "Fast but expensive." },
    ],
    alerts: [{ severity: "high", title: "Documentation deadline", impact: "Certificate of origin should be confirmed before booking." }],
    recommendations: [{ action: "Book ocean freight", rationale: "Ocean offers the best cost balance for the stated ship date." }],
    actionPlan: [
      {
        action: "Confirm HS classification",
        deadline: "By Aug 1, 2026",
        dueDate: "2026-08-01",
        category: "regulatory",
        urgency: "high",
        why: "Duty and documentation depend on classification.",
      },
    ],
    executiveSummary: "Use ocean freight and verify documents before booking.",
    news: [{ ...source, title: "Port authority update", url: "https://example.gov/port-news" }],
    geo: {
      origin: { name: "Mumbai", lat: 19.076, lng: 72.8777 },
      destination: { name: "New York", lat: 40.7128, lng: -74.006 },
      distanceKm: 12542,
    },
    tariff: {
      hsCode: "6205.20",
      originCountry: "India",
      destinationCountry: "United States",
      baseDutyPct: 19.7,
      additional: [{ name: "Merchandise processing fee", ratePct: 0.35 }],
      totalDutyPct: 20.05,
      documents: [{ name: "Certificate of Origin", url: "https://example.gov/certificate" }],
      requirements: ["Importer of record must retain origin documentation"],
      goodsValueUsd: 96000,
      estimatedDutyUsd: 19248,
      notes: "Synthetic duty note for report test.",
      sources: [{ ...source, title: "Tariff source", url: "https://example.gov/tariff" }],
    },
    portRecommendation: {
      recommended: "Port of New York and New Jersey",
      rationale: "Lowest total congestion for the destination lane.",
      options: [
        {
          name: "Port of New York and New Jersey",
          congestionScore: 44,
          waitDays: 2,
          freightCost: 8400,
          recommended: true,
          note: "Best fit for destination.",
          lat: 40.6681,
          lng: -74.0451,
          sources: [{ ...source, title: "Port source", url: "https://example.gov/port" }],
        },
      ],
    },
    searches: [{ agent: "Freight Agent", query: "synthetic port congestion", results: 3, mode: "live" }],
    generatedAt: "2026-07-13T10:00:00.000Z",
    dataMode: "live",
  };
}

test("report model retains Wayfinder-parity fields", () => {
  const model = buildReportModel(completeAnalysis());

  assert.equal(model.riskScore, 72);
  assert.deepEqual(model.expectedDelayDays, [4, 9]);
  assert.equal(model.expectedCostIncreasePct, 5.9);
  assert.deepEqual(model.shipment.locked, ["Goods"]);
  assert.equal(model.alerts[0].title, "Documentation deadline");
  assert.equal(model.recommendations[0].action, "Book ocean freight");
  assert.equal(model.actionPlan[0].action, "Confirm HS classification");
  assert.equal(model.tariff?.requirements[0], "Importer of record must retain origin documentation");
  assert.equal(model.tariff?.sources[0].title, "Tariff source");
  assert.equal(model.risks[0].trend, "up");
  assert.equal(model.risks[0].sources[0].title, "Freight source");
  assert.equal(model.drivers.length, 6);
  assert.equal(model.drivers[0].forecastNote, "Forecast note 1");
  assert.equal(model.drivers[0].priceLive, true);
  assert.equal(model.drivers[0].series[3].f, 104);
  assert.equal(model.portRecommendation?.recommended, "Port of New York and New Jersey");
  assert.equal(model.portOptions[0].lat, 40.6681);
  assert.equal(model.news[0].title, "Port authority update");
  assert.equal(model.searches[0].query, "synthetic port congestion");
  assert.ok(model.sources.some((item) => item.title === "Driver 6 source"));
  assert.ok(model.sources.some((item) => item.title === "Document reference: Certificate of Origin"));
});

test("HTML report renders rich formal sections and cited content without gradients", () => {
  const html = renderReportWebPage(buildReportModel(completeAnalysis()));

  for (const expected of [
    "Shipment Inputs",
    "Executive Summary",
    "Expected Impact",
    "Cost Forecast",
    "Commodity Exposure",
    "Action Plan",
    "Route Optimization",
    "Transit Timing",
    "Route Geography",
    "Port Recommendation",
    "Tariffs and Regulations",
    "Documentation Checklist",
    "Landed Cost Breakdown",
    "Risk Factors by Category",
    "Supply-Chain Driver Tracker",
    "Supply-Chain Dependency Graph",
    "News Intelligence Feed",
    "Bright Data Scraping Log",
    "Sources Appendix",
    "Assumptions, Limitations, and Disclaimer",
  ]) {
    assert.match(html, new RegExp(expected));
  }

  for (const expectedChart of [
    "Global risk score",
    "Cost forecast by component",
    "Commodity exposure",
    "Route cost and transit comparison",
    "Route geography and candidate ports",
    "Port congestion comparison",
    "Landed cost component scale",
    "Risk factor score distribution",
    "Supply-chain dependency graph",
  ]) {
    assert.match(html, new RegExp(expectedChart));
  }

  assert.match(html, /Importer of record must retain origin documentation/);
  assert.match(html, /freight exposure, goods locked/);
  assert.match(html, /Today \(Jul 13\)/);
  assert.match(html, /Aug 12/);
  assert.match(html, /Product \(locked\)/);
  assert.match(html, />History<\/span>/);
  assert.match(html, /\$8\.00/);
  assert.match(html, /20\.05%/);
  assert.match(html, /0\.35%/);
  assert.match(html, /Confirm HS classification/);
  assert.match(html, /Trend:<\/strong> Rising/);
  assert.match(html, /Forecast note 1/);
  assert.match(html, /Driver 6 source/);
  assert.match(html, /1 source/);
  assert.match(html, /Great-circle route approximation/);
  assert.match(html, /Document reference: Certificate of Origin/);
  assert.match(html, /Tariff source/);
  assert.match(html, /Port source/);
  assert.match(html, /synthetic port congestion/);
  assert.match(html, /Bright Data&#39;s search_engine tool/);
  assert.match(html, /Unit price not provided|Shipping mode not specified|All estimates are based on publicly available data|Goods/);
  assert.doesNotMatch(html, /gradient/i);
  assert.doesNotMatch(html, /border-radius/i);
  assert.doesNotMatch(html, /\srx="/i);
  assert.doesNotMatch(html, /stroke-linecap="round"/i);
  assert.doesNotMatch(html, /stroke-linejoin="round"/i);
});

test("HTML report renders explicit fallbacks for sparse analysis data", () => {
  const sparse = completeAnalysis();
  sparse.materials = [];
  sparse.drivers = [];
  sparse.riskFactors = [];
  sparse.costForecasts = [];
  sparse.routes = [];
  sparse.news = [];
  sparse.geo = null;
  sparse.tariff = null;
  sparse.portRecommendation = null;
  sparse.searches = [];

  const html = renderReportWebPage(buildReportModel(sparse));

  assert.match(html, /Insufficient data available/);
  assert.match(html, /Tariff analysis unavailable/);
  assert.match(html, /No searches recorded/);
  assert.match(html, /No sources recorded/);
  assert.doesNotMatch(html, /gradient/i);
  assert.doesNotMatch(html, /border-radius/i);
  assert.doesNotMatch(html, /\srx="/i);
  assert.doesNotMatch(html, /stroke-linecap="round"/i);
  assert.doesNotMatch(html, /stroke-linejoin="round"/i);
});
