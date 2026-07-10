import type { AnalysisResult } from "../lib/types.js";
import crypto from "node:crypto";

export interface ReportModel {
  reportId: string;
  version: string;
  generatedAt: string;
  dataMode: "live" | "mock";
  executiveSummary: string;
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
    notes: string;
  } | null;
  documents: Array<{ name: string; url: string }>;
  risks: Array<{
    category: string;
    score: number;
    label: string;
    detail: string;
    actionable: string;
    keyFindings: string[];
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
    series: Array<{ t: string; v: number | null }>;
  }>;
  dependencyGraph: Array<{ node: string; children: string[] }>;
  portOptions: Array<{
    name: string;
    congestionScore: number;
    waitDays: number;
    freightCost: number;
    recommended: boolean;
    note: string;
  }>;
  sources: Array<{
    title: string;
    url: string;
    snippet?: string;
  }>;
  confidence: string;
  limitations: string[];
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
          notes: result.tariff.notes,
        }
      : null,
    documents: result.tariff?.documents ?? [],
    risks: result.riskFactors.map((r) => ({
      category: r.category,
      score: r.score,
      label: r.label,
      detail: r.detail,
      actionable: r.actionable,
      keyFindings: r.keyFindings,
    })),
    costForecasts: result.costForecasts.map((c) => ({
      horizonDays: c.horizonDays,
      productCostPct: c.productCostPct,
      freightCostPct: c.freightCostPct,
      landedCostPct: c.landedCostPct,
    })),
    drivers: result.drivers.slice(0, 5).map((d) => ({
      name: d.name,
      unit: d.unit,
      current: d.current,
      changePct: d.changePct,
      trend: d.trend,
      impact: d.impact,
      affects: d.affects,
      forecastPct: d.forecastPct,
      series: d.series.map((p) => ({ t: p.t, v: p.v })),
    })),
    dependencyGraph: result.dependencyGraph.map((n) => ({
      node: n.node,
      children: n.children,
    })),
    portOptions: result.portRecommendation?.options.map((o) => ({
      name: o.name,
      congestionScore: o.congestionScore,
      waitDays: o.waitDays,
      freightCost: o.freightCost,
      recommended: o.recommended,
      note: o.note,
    })) ?? [],
    sources: collectSources(result),
    confidence: deriveConfidence(result),
    limitations: deriveLimitations(result),
    disclaimer:
      "This report is generated by Transitra, an AI-powered trade intelligence tool. "
      + "It is for decision-support purposes only and does not constitute legal, customs, tax, "
      + "or freight-booking advice. All figures are estimates based on available data and "
      + "public sources. Verify all information with qualified professionals before acting.",
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
    assumptions.push("Analysis uses simulated (mock) data - findings are illustrative only");
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

  for (const rf of result.riskFactors) {
    for (const s of rf.sources) {
      if (!seen.has(s.url)) {
        seen.add(s.url);
        sources.push({ title: s.title, url: s.url, snippet: s.snippet });
      }
    }
  }
  if (result.tariff) {
    for (const s of result.tariff.sources) {
      if (!seen.has(s.url)) {
        seen.add(s.url);
        sources.push({ title: s.title, url: s.url, snippet: s.snippet });
      }
    }
  }
  if (result.portRecommendation) {
    for (const opt of result.portRecommendation.options) {
      for (const s of opt.sources) {
        if (!seen.has(s.url)) {
          seen.add(s.url);
          sources.push({ title: s.title, url: s.url, snippet: s.snippet });
        }
      }
    }
  }
  for (const news of result.news) {
    if (!seen.has(news.url)) {
      seen.add(news.url);
      sources.push({ title: news.title, url: news.url, snippet: news.snippet });
    }
  }
  return sources;
}

function deriveConfidence(result: AnalysisResult): string {
  if (result.dataMode === "mock") return "Low - analysis uses simulated data";
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
    limitations.push("All data is simulated - do not use for real decisions");
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
