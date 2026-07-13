import type { AnalysisResult } from "../lib/types.js";
import crypto from "node:crypto";

export interface ReportSource {
  title: string;
  url: string;
  snippet?: string;
  category: string;
  retrievedAt: string;
}

export interface ReportModel {
  reportId: string;
  version: string;
  generatedAt: string;
  dataMode: "live" | "mock";
  executiveSummary: string;
  riskScore: number;
  expectedCostIncreasePct: number;
  expectedDelayDays: [number, number];
  commodity: {
    productCategory: string;
    hsCodes: string[];
    materials: Array<{ material: string; pct: number }>;
  };
  shipment: {
    product: string;
    origin: string;
    destination: string;
    weightKg: number;
    quantity?: number;
    shipDate: string;
    shippingMode?: string;
    containerSize?: string;
    pricePerKg?: number;
    specialRequirements?: string[];
    locked?: string[];
  };
  assumptions: string[];
  missingFields: string[];
  routes: Array<{
    method: string;
    cost: number;
    transitDays: number;
    recommended: boolean;
    note: string;
  }>;
  recommendedRoute: { method: string; cost: number; transitDays: number; note: string } | null;
  landedCost: {
    goodsValueUsd: number;
    estimatedDutyUsd: number;
    estimatedFreightUsd: number;
    estimatedTotalUsd: number;
    totalDutyPct: number;
  };
  tariff: {
    hsCode: string;
    originCountry: string;
    destinationCountry: string;
    baseDutyPct: number;
    additional: Array<{ name: string; ratePct: number }>;
    totalDutyPct: number;
    requirements: string[];
    goodsValueUsd: number;
    estimatedDutyUsd: number;
    notes: string;
    sources: ReportSource[];
  } | null;
  documents: Array<{ name: string; url: string }>;
  risks: Array<{
    category: string;
    score: number;
    label: string;
    detail: string;
    actionable: string;
    trend: "up" | "down" | "flat";
    keyFindings: string[];
    sources: ReportSource[];
  }>;
  costForecasts: Array<{
    horizonDays: number;
    productCostPct: number;
    freightCostPct: number;
    landedCostPct: number;
  }>;
  drivers: Array<{
    name: string;
    unit: string;
    current: number;
    changePct: number;
    trend: "up" | "down" | "flat";
    impact: "high" | "medium" | "low";
    affects: string;
    forecastPct: number;
    forecastNote: string;
    priceLive: boolean;
    series: Array<{ t: string; v: number | null; f?: number | null }>;
    sources: ReportSource[];
  }>;
  dependencyGraph: Array<{ node: string; children: string[] }>;
  geo: {
    origin: { name: string; lat: number; lng: number };
    destination: { name: string; lat: number; lng: number };
    distanceKm: number;
  } | null;
  portRecommendation: {
    recommended: string;
    rationale: string;
  } | null;
  portOptions: Array<{
    name: string;
    congestionScore: number;
    waitDays: number;
    freightCost: number;
    recommended: boolean;
    note: string;
    lat: number | null;
    lng: number | null;
    sources: ReportSource[];
  }>;
  alerts: Array<{ severity: "high" | "medium" | "low"; title: string; impact: string }>;
  recommendations: Array<{ action: string; rationale: string }>;
  actionPlan: Array<{
    action: string;
    deadline: string;
    dueDate: string | null;
    category: string;
    urgency: "high" | "medium" | "low";
    why: string;
  }>;
  news: ReportSource[];
  searches: Array<{
    agent: string;
    query: string;
    results: number;
    mode: "live" | "mock";
  }>;
  sources: ReportSource[];
  confidence: string;
  limitations: string[];
  openQuestions: string[];
  disclaimer: string;
}

export function buildReportModel(result: AnalysisResult): ReportModel {
  const now = new Date();
  const reportId = crypto.randomUUID();
  const version = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const recommendedRoute = result.routes.find((r) => r.recommended) ?? result.routes[0] ?? null;

  const freightCost = recommendedRoute?.cost ?? 0;
  const goodsValue = result.input.weightKg * (result.input.pricePerKg ?? 0);
  const dutyAmount = result.tariff?.estimatedDutyUsd ?? 0;
  const total = goodsValue + freightCost + dutyAmount;

  return {
    reportId,
    version,
    generatedAt: result.generatedAt,
    dataMode: result.dataMode,
    executiveSummary: result.executiveSummary,
    commodity: {
      productCategory: result.productCategory,
      hsCodes: result.hsCodes,
      materials: result.materials,
    },
    shipment: {
      product: result.input.product,
      origin: result.input.origin,
      destination: result.input.destination,
      weightKg: result.input.weightKg,
      quantity: result.input.quantity,
      shipDate: result.input.shipDate,
      shippingMode: result.input.shippingMode,
      containerSize: result.input.containerSize,
      pricePerKg: result.input.pricePerKg,
      specialRequirements: result.input.specialRequirements,
      locked: result.input.locked,
    },
    assumptions: extractAssumptions(result),
    missingFields: [],
    routes: result.routes.map((r) => ({
      method: r.method,
      cost: r.cost,
      transitDays: r.transitDays,
      recommended: r.recommended,
      note: r.note,
    })),
    recommendedRoute: recommendedRoute
      ? { method: recommendedRoute.method, cost: recommendedRoute.cost, transitDays: recommendedRoute.transitDays, note: recommendedRoute.note }
      : null,
    landedCost: {
      goodsValueUsd: goodsValue,
      estimatedDutyUsd: dutyAmount,
      estimatedFreightUsd: freightCost,
      estimatedTotalUsd: total,
      totalDutyPct: result.tariff?.totalDutyPct ?? 0,
    },
    tariff: result.tariff
      ? {
          hsCode: result.tariff.hsCode,
          originCountry: result.tariff.originCountry,
          destinationCountry: result.tariff.destinationCountry,
          baseDutyPct: result.tariff.baseDutyPct,
          additional: result.tariff.additional,
          totalDutyPct: result.tariff.totalDutyPct,
          requirements: result.tariff.requirements,
          goodsValueUsd: result.tariff.goodsValueUsd,
          estimatedDutyUsd: result.tariff.estimatedDutyUsd,
          notes: result.tariff.notes,
          sources: result.tariff.sources.map((s) => sourceWithMeta(s, "Tariff and customs", result.generatedAt)),
        }
      : null,
    documents: result.tariff?.documents ?? [],
    risks: result.riskFactors.map((r) => ({
      category: r.category,
      score: r.score,
      label: r.label,
      detail: r.detail,
      actionable: r.actionable,
      trend: r.trend,
      keyFindings: r.keyFindings,
      sources: r.sources.map((s) => sourceWithMeta(s, "Risk intelligence", result.generatedAt)),
    })),
    costForecasts: result.costForecasts.map((c) => ({
      horizonDays: c.horizonDays,
      productCostPct: c.productCostPct,
      freightCostPct: c.freightCostPct,
      landedCostPct: c.landedCostPct,
    })),
    drivers: result.drivers.map((d) => ({
      name: d.name,
      unit: d.unit,
      current: d.current,
      changePct: d.changePct,
      trend: d.trend,
      impact: d.impact,
      affects: d.affects,
      forecastPct: d.forecastPct,
      forecastNote: d.forecastNote,
      priceLive: d.priceLive,
      series: buildDriverSeriesForReport(d.series, d.current, d.forecastPct),
      sources: d.sources.map((s) => sourceWithMeta(s, "Driver intelligence", result.generatedAt)),
    })),
    dependencyGraph: result.dependencyGraph.map((n) => ({
      node: n.node,
      children: n.children,
    })),
    geo: result.geo
      ? {
          origin: result.geo.origin,
          destination: result.geo.destination,
          distanceKm: result.geo.distanceKm,
        }
      : null,
    portRecommendation: result.portRecommendation
      ? {
          recommended: result.portRecommendation.recommended,
          rationale: result.portRecommendation.rationale,
        }
      : null,
    portOptions: result.portRecommendation?.options.map((o) => ({
      name: o.name,
      congestionScore: o.congestionScore,
      waitDays: o.waitDays,
      freightCost: o.freightCost,
      recommended: o.recommended,
      note: o.note,
      lat: o.lat,
      lng: o.lng,
      sources: o.sources.map((s) => sourceWithMeta(s, "Port intelligence", result.generatedAt)),
    })) ?? [],
    alerts: result.alerts.map((a) => ({ severity: a.severity, title: a.title, impact: a.impact })),
    recommendations: result.recommendations.map((r) => ({
      action: r.action,
      rationale: r.rationale,
    })),
    actionPlan: result.actionPlan.map((a) => ({
      action: a.action,
      deadline: a.deadline,
      dueDate: a.dueDate,
      category: a.category,
      urgency: a.urgency,
      why: a.why,
    })),
    news: result.news.map((s) => sourceWithMeta(s, "News intelligence", result.generatedAt)),
    searches: result.searches.map((s) => ({
      agent: s.agent,
      query: s.query,
      results: s.results,
      mode: s.mode,
    })),
    riskScore: result.riskScore,
    expectedCostIncreasePct: result.expectedCostIncreasePct,
    expectedDelayDays: result.expectedDelayDays,
    sources: collectSources(result),
    confidence: deriveConfidence(result),
    limitations: deriveLimitations(result),
    openQuestions: deriveOpenQuestions(result),
    disclaimer:
      "This report is generated by Transitra, an AI-powered trade intelligence tool. "
      + "It is for decision-support purposes only and does not constitute legal, customs, tax, "
      + "or freight-booking advice. All figures are estimates based on available data and "
      + "public sources. Verify all information with qualified professionals before acting.",
  };
}

function buildDriverSeriesForReport(
  series: Array<{ t: string; v: number | null; f?: number | null }>,
  current: number,
  forecastPct: number,
): Array<{ t: string; v: number | null; f?: number | null }> {
  const mapped = series.map((p) => ({ t: p.t, v: p.v, f: p.f ?? null }));
  const hasForecastPoints = mapped.some((p) => p.f !== null && p.f !== undefined);
  if (hasForecastPoints || mapped.length === 0) return mapped;

  const last = mapped[mapped.length - 1];
  const base = last?.v ?? current;
  if (last) last.f = base;
  const target = current * (1 + forecastPct / 100);

  return [
    ...mapped,
    ...[1, 2, 3].map((k) => ({
      t: `+${k * 20}d`,
      v: null,
      f: roundDriverValue(base + (target - base) * (k / 3), current || base || 1),
    })),
  ];
}

function roundDriverValue(value: number, scale: number): number {
  const magnitude = Math.abs(scale);
  if (magnitude >= 1000) return Math.round(value);
  if (magnitude >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function sourceWithMeta(source: { title: string; url: string; snippet?: string }, category: string, retrievedAt: string): ReportSource {
  return {
    title: source.title,
    url: source.url,
    snippet: source.snippet,
    category,
    retrievedAt,
  };
}

function extractAssumptions(result: AnalysisResult): string[] {
  const assumptions: string[] = [];
  const input = result.input;
  if (!input.pricePerKg) {
    assumptions.push("Unit price not provided - landed-cost estimates use $0 goods value");
  }
  if (!input.shippingMode) {
    assumptions.push("Shipping mode not specified - all available modes compared");
  }
  if (result.dataMode === "mock") {
    assumptions.push("Analysis uses illustrative fallback data - verify with live official sources before operational use");
  }
  for (const r of result.riskFactors) {
    if (r.sources.length === 0) {
      assumptions.push(`Risk factor "${r.label}" has no supporting sources`);
    }
  }
  if (!result.tariff) {
    assumptions.push("Tariff analysis not available - customs figures are estimates");
  }
  return assumptions;
}

function collectSources(result: AnalysisResult): ReportModel["sources"] {
  const seen = new Set<string>();
  const sources: ReportModel["sources"] = [];

  const push = (s: { title: string; url: string; snippet?: string }, category: string) => {
    if (!s.url || seen.has(s.url)) return;
    seen.add(s.url);
    sources.push(sourceWithMeta(s, category, result.generatedAt));
  };

  for (const s of result.news) {
    push(s, "News intelligence");
  }
  for (const rf of result.riskFactors) {
    for (const s of rf.sources) {
      push(s, `${rf.category} risk`);
    }
  }
  if (result.tariff) {
    for (const s of result.tariff.sources) {
      push(s, "Tariff and customs");
    }
    for (const doc of result.tariff.documents) {
      if (doc.url) {
        push({ title: `Document reference: ${doc.name}`, url: doc.url }, "Documentation");
      }
    }
  }
  if (result.portRecommendation) {
    for (const opt of result.portRecommendation.options) {
      for (const s of opt.sources) {
        push(s, "Port intelligence");
      }
    }
  }
  for (const driver of result.drivers) {
    for (const s of driver.sources) {
      push(s, "Driver intelligence");
    }
  }
  return sources;
}

function deriveConfidence(result: AnalysisResult): string {
  if (result.dataMode === "mock") return "Low - analysis relies on illustrative fallback data";
  if (result.riskFactors.length === 0) return "Low - no risk factors identified";
  const sourcedFactors = result.riskFactors.filter((r) => r.sources.length > 0).length;
  const ratio = sourcedFactors / result.riskFactors.length;
  if (ratio > 0.7) return "Medium-High - most findings supported by sources";
  if (ratio > 0.4) return "Medium - mixed source coverage";
  return "Low - limited source support for findings";
}

function deriveLimitations(result: AnalysisResult): string[] {
  const limitations: string[] = [];
  if (result.dataMode === "mock") {
    limitations.push("Findings rely on illustrative fallback inputs and need live-source verification before use");
  }
  if (!result.tariff) {
    limitations.push("Tariff analysis was not completed");
  }
  if (result.riskFactors.some((r) => r.sources.length === 0)) {
    limitations.push("Some risk factors lack source citations");
  }
  if (result.searches.length === 0) {
    limitations.push("No web searches were performed");
  }
  limitations.push("All estimates are based on publicly available data as of the retrieval timestamp");
  return limitations;
}

function deriveOpenQuestions(result: AnalysisResult): string[] {
  const questions: string[] = [];
  if (!result.input.pricePerKg) {
    questions.push("Declared customs value or price per kg is still needed for a reliable duty and landed-cost estimate.");
  }
  if (!result.input.quantity) {
    questions.push("Unit count is not available, so per-unit landed cost cannot be shown.");
  }
  if (!result.input.containerSize) {
    questions.push("Container type or load plan should be confirmed before booking freight.");
  }
  if (!result.tariff?.hsCode) {
    questions.push("HS classification needs human verification before customs or duty decisions.");
  }
  if (result.dataMode === "mock") {
    questions.push("Refresh this analysis with live official-source retrieval before operational use.");
  }
  return questions;
}
