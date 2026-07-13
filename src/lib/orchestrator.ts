import {
  actionPlanAgent,
  buildIntelSpecs,
  enrichDriverPrices,
  executiveSummaryAgent,
  portRecommenderAgent,
  productAgent,
  synthesisAgent,
  tariffAgent,
  intelAgent,
} from "./agents.js";
import { env } from "../config.js";
import { brightDataMode, getSearchLog, resetSearchLog } from "./brightdata.js";
import { buildDrivers } from "./drivers.js";
import { geocode, haversineKm } from "./geo.js";
import { buildMockAnalysis } from "./mock-analysis.js";
import type {
  AnalysisResult,
  DependencyNode,
  RiskFactor,
  RouteGeo,
  SearchRecord,
  ShipmentInput,
  Source,
  TargetedDoubtKind,
  TargetedDoubtResult,
} from "./types.js";
import type { ProductProfile } from "./agents.js";

const CATEGORY_WEIGHTS: Record<string, number> = {
  commodity: 1.0,
  freight: 1.2,
  port: 1.0,
  weather: 0.8,
  geopolitical: 1.1,
  supplier: 0.9,
  regulatory: 0.7,
};

function weightedRiskScore(factors: RiskFactor[]): number {
  let num = 0;
  let den = 0;
  for (const f of factors) {
    const w = CATEGORY_WEIGHTS[f.category] ?? 1;
    num += f.score * w;
    den += w;
  }
  return den ? Math.round(num / den) : 50;
}

export async function runAnalysis(input: ShipmentInput): Promise<AnalysisResult> {
  if (env.HOMELANDER_MOCK_MODE) {
    console.log(`[orchestrator] HOMELANDER_MOCK_MODE=true; using full mock analysis for ${input.product}`);
    return buildMockAnalysis(input);
  }

  console.log(`[orchestrator] Analyzing ${input.product} · ${input.origin} → ${input.destination}`);
  resetSearchLog();

  const geoPromise: Promise<RouteGeo | null> = (async () => {
    const [o, d] = await Promise.all([geocode(input.origin), geocode(input.destination)]);
    if (!o || !d) return null;
    return { origin: o, destination: d, distanceKm: Math.round(haversineKm(o, d)) };
  })();

  console.log("[orchestrator] Running Product & Material Agent...");
  const profile = await productAgent(input);
  console.log(`[orchestrator] Product & Material Agent done: ${profile.productCategory}`);

  console.log("[orchestrator] Running Port Recommendation Agent...");
  const portPromise = portRecommenderAgent(input)
    .then(async (pr) => {
      if (!pr) {
        console.log("[orchestrator] Port Recommendation Agent done: no alternatives found");
        return null;
      }
      const located = await Promise.all(
        pr.options.map(async (o) => {
          const g = await geocode(o.name);
          return { ...o, lat: g?.lat ?? null, lng: g?.lng ?? null };
        }),
      );
      const out = { ...pr, options: located };
      console.log(`[orchestrator] Port Recommendation Agent done: recommend ${pr.recommended}`);
      return out;
    })
    .catch((err) => {
      console.error("[orchestrator] Port Recommendation Agent error:", err);
      return null;
    });

  console.log("[orchestrator] Running Tariff & Regulation Agent...");
  const tariffPromise = tariffAgent(input, profile)
    .then((t) => {
      console.log(`[orchestrator] Tariff & Regulation Agent done: ${t ? `~${t.totalDutyPct}% effective duty` : "no data"}`);
      return t;
    })
    .catch((err) => {
      console.error("[orchestrator] Tariff & Regulation Agent error:", err);
      return null;
    });

  const specs = buildIntelSpecs(input, profile);
  const context = `${input.product} (${profile.productCategory}), ${input.weightKg}kg, ${input.origin} -> ${input.destination}, ship date ${input.shipDate}`;

  specs.forEach((s) => console.log(`[orchestrator] Running ${s.name}...`));

  const factorResults = await Promise.all(
    specs.map(async (spec) => {
      try {
        const { factor } = await intelAgent(spec, context);
        console.log(`[orchestrator] ${spec.name} done: risk ${factor.score}/100 · ${factor.label}`);
        return factor;
      } catch (err) {
        console.error(`[orchestrator] ${spec.name} error:`, err);
        return null;
      }
    }),
  );
  const factors = factorResults.filter(Boolean) as RiskFactor[];

  const riskScore = weightedRiskScore(factors);

  console.log("[orchestrator] Running Commodity Price Agent...");
  const driversPromise = enrichDriverPrices(buildDrivers(profile.dependencies, profile.materials, factors)).then((d) => {
    console.log(`[orchestrator] Commodity Price Agent done: ${d.filter((x) => x.priceLive).length}/${d.length} live prices`);
    return d;
  });

  console.log("[orchestrator] Running Cost, Route & Alert Engine...");
  const synthesis = await synthesisAgent(input, profile, factors, riskScore);
  console.log(`[orchestrator] Cost, Route & Alert Engine done: +${synthesis.expectedCostIncreasePct}% cost · ${synthesis.expectedDelayDays[0]}–${synthesis.expectedDelayDays[1]}d delay`);

  console.log("[orchestrator] Running Executive Summary Agent & Action Plan Agent...");
  const [executiveSummary, actionPlan] = await Promise.all([
    executiveSummaryAgent(input, factors, riskScore, synthesis),
    actionPlanAgent(input, factors, synthesis),
  ]);
  console.log(`[orchestrator] Executive Summary done · Action Plan: ${actionPlan.length} prioritized actions`);

  const dependencyGraph: DependencyNode[] = [
    { node: profile.productCategory, children: profile.dependencies },
  ];

  const drivers = await driversPromise;

  const geo = await geoPromise;
  const portRecommendation = await portPromise;
  const tariff = await tariffPromise;

  if (tariff && input.pricePerKg && input.weightKg) {
    tariff.goodsValueUsd = Math.round(input.pricePerKg * input.weightKg);
    tariff.estimatedDutyUsd = Math.round((tariff.goodsValueUsd * tariff.totalDutyPct) / 100);
  }

  if (portRecommendation) {
    const base = (synthesis.routes.find((r) => r.recommended) ?? synthesis.routes[0])?.cost ?? 3000;
    portRecommendation.options = portRecommendation.options.map((p, i) => ({
      ...p,
      freightCost: Math.round(base * (1 + (p.congestionScore / 100) * 0.18) + p.waitDays * 180 + i * 35),
    }));
  }

  const queryToAgent = new Map<string, string>();
  specs.forEach((s) => s.queries.forEach((q) => queryToAgent.set(q, s.name)));
  const attribute = (q: string): string => {
    if (queryToAgent.has(q)) return queryToAgent.get(q)!;
    if (/spot price|current .*price|forecast 2026/i.test(q)) return "Commodity Price Agent";
    if (/port congestion|dwell|vessel queue/i.test(q)) return "Port Recommendation Agent";
    if (/duty|tariff|hts|section 301|customs/i.test(q)) return "Tariff & Regulation Agent";
    return "Product & Material Agent";
  };
  const searches: SearchRecord[] = getSearchLog().map((e) => ({
    agent: attribute(e.query),
    query: e.query,
    results: e.results,
    mode: e.mode,
  }));

  const news: Source[] = dedupe([
    ...factors.flatMap((f) => f.sources),
    ...profile.sources,
  ]).slice(0, 12);

  console.log("[orchestrator] Analysis complete");
  return {
    input,
    productCategory: profile.productCategory,
    hsCodes: profile.hsCodes,
    materials: profile.materials,
    dependencyGraph,
    drivers,
    riskScore,
    riskFactors: factors,
    costForecasts: synthesis.costForecasts,
    expectedCostIncreasePct: synthesis.expectedCostIncreasePct,
    expectedDelayDays: synthesis.expectedDelayDays,
    routes: synthesis.routes,
    alerts: synthesis.alerts,
    recommendations: synthesis.recommendations,
    actionPlan,
    executiveSummary,
    news,
    geo,
    tariff,
    portRecommendation,
    searches,
    generatedAt: new Date().toISOString(),
    dataMode: brightDataMode(),
  };
}

export async function runTargetedDoubt(
  input: ShipmentInput,
  kind: TargetedDoubtKind,
  question: string,
  opts?: { analysisContext?: AnalysisResult },
): Promise<TargetedDoubtResult> {
  console.log(`[orchestrator] Running targeted ${kind} doubt for ${input.product}`);
  resetSearchLog();

  const profile = opts?.analysisContext ? profileFromAnalysis(opts.analysisContext) : await productAgent(input);
  const context =
    `${input.product} (${profile.productCategory}), ${input.weightKg}kg, ` +
    `${input.origin} -> ${input.destination}, ship date ${input.shipDate}. ` +
    `User question: ${question}`;

  if (kind === "tariff") {
    console.log("[orchestrator] Running targeted Tariff & Regulation Agent...");
    const tariff = await tariffAgent(input, profile);
    if (tariff && input.pricePerKg && input.weightKg) {
      tariff.goodsValueUsd = Math.round(input.pricePerKg * input.weightKg);
      tariff.estimatedDutyUsd = Math.round((tariff.goodsValueUsd * tariff.totalDutyPct) / 100);
    }
    const additional = tariff?.additional.length
      ? ` Additional: ${tariff.additional.map((a) => `${a.name} ${a.ratePct}%`).join(", ")}.`
      : "";
    return buildTargetedResult(input, kind, "Tariff & Regulation Agent", {
      headline: tariff
        ? `HS ${tariff.hsCode || "unconfirmed"} · ~${tariff.totalDutyPct}% estimated duty`
        : "Tariff data unavailable",
      detail: tariff
        ? `${tariff.notes}${additional} Required documents: ${tariff.documents.map((d) => d.name).slice(0, 5).join(", ") || "standard import packet"}.`
        : "I could not produce a reliable tariff estimate from the available sources.",
      actionable: "Verify the HS classification and duty treatment with a licensed customs broker before booking.",
      score: null,
      sources: tariff?.sources ?? [],
    });
  }

  if (kind === "port") {
    console.log("[orchestrator] Running targeted Port Recommendation Agent...");
    const recommendation = await portRecommenderAgent(input);
    const options = recommendation?.options ?? [];
    const best = options.find((o) => o.recommended) ?? options[0];
    return buildTargetedResult(input, kind, "Port Recommendation Agent", {
      headline: best ? `Prefer ${best.name} · congestion ${best.congestionScore}/100` : "Port recommendation unavailable",
      detail: recommendation
        ? `${recommendation.rationale} Options checked: ${options.map((o) => `${o.name} ~${o.waitDays}d wait`).join("; ")}.`
        : "I could not identify reliable alternate port options from the available sources.",
      actionable: best
        ? `Plan around roughly ${best.waitDays} days of port wait at ${best.name}, and re-check queues before booking.`
        : "Re-check intended-port dwell time and vessel queues before booking.",
      score: best?.congestionScore ?? null,
      sources: dedupe(options.flatMap((o) => o.sources)).slice(0, 6),
    });
  }

  const specs = buildIntelSpecs(input, profile);
  const spec = specs.find((s) => s.category === kind);
  if (!spec) {
    throw new Error(`No targeted agent configured for ${kind}`);
  }

  console.log(`[orchestrator] Running targeted ${spec.name}...`);
  const { factor } = await intelAgent(spec, context);
  return buildTargetedResult(input, kind, spec.name, {
    headline: `${factor.label} · risk ${factor.score}/100`,
    detail: factor.detail,
    actionable: factor.actionable,
    score: factor.score,
    sources: factor.sources,
  });
}

function profileFromAnalysis(result: AnalysisResult): ProductProfile {
  return {
    productCategory: result.productCategory,
    hsCodes: result.hsCodes,
    materials: result.materials,
    dependencies: result.dependencyGraph.flatMap((node) => node.children),
    sources: result.news,
  };
}

function buildTargetedResult(
  input: ShipmentInput,
  kind: TargetedDoubtKind,
  agentName: string,
  data: {
    headline: string;
    detail: string;
    actionable: string;
    score: number | null;
    sources: Source[];
  },
): TargetedDoubtResult {
  const searches: SearchRecord[] = getSearchLog().map((e) => ({
    agent: attributeTargetedSearch(e.query, agentName),
    query: e.query,
    results: e.results,
    mode: e.mode,
  }));

  return {
    input,
    kind,
    agentName,
    headline: data.headline,
    detail: data.detail,
    actionable: data.actionable,
    score: data.score,
    sources: dedupe(data.sources).slice(0, 6),
    searches,
    generatedAt: new Date().toISOString(),
    dataMode: brightDataMode(),
  };
}

function attributeTargetedSearch(query: string, targetAgentName: string): string {
  if (/materials composition manufacturing HS code/i.test(query)) return "Product & Material Agent";
  return targetAgentName;
}

function dedupe(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (!s?.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}
