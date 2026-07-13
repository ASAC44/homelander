import { buildDrivers } from "./drivers.js";
import type {
  ActionItem,
  AnalysisResult,
  CostForecast,
  DependencyDriver,
  MaterialBreakdown,
  Recommendation,
  RiskCategory,
  RiskFactor,
  RouteOption,
  SearchRecord,
  ShipmentInput,
  Source,
  TariffInfo,
} from "./types.js";

const RISK_CATEGORIES: RiskCategory[] = [
  "commodity",
  "freight",
  "port",
  "weather",
  "geopolitical",
  "supplier",
  "regulatory",
];

interface MockProductProfile {
  productCategory: string;
  hsCodes: string[];
  materials: MaterialBreakdown[];
  dependencies: string[];
}

export function buildMockAnalysis(input: ShipmentInput): AnalysisResult {
  const profile = mockProductProfile(input.product);
  const sourcesByCategory = buildMockSources(input, profile);
  const riskFactors = buildRiskFactors(input, profile, sourcesByCategory);
  const riskScore = Math.round(riskFactors.reduce((sum, risk) => sum + risk.score, 0) / riskFactors.length);
  const routes = buildRoutes(input, riskScore);
  const tariff = buildTariff(input, profile, sourcesByCategory.regulatory);
  const drivers = withDriverSources(buildDrivers(profile.dependencies, profile.materials, riskFactors), sourcesByCategory);
  const costForecasts = buildCostForecasts(riskScore);
  const expectedDelayDays: [number, number] = [
    Math.max(1, Math.round(riskScore / 18)),
    Math.max(3, Math.round(riskScore / 9)),
  ];
  const expectedCostIncreasePct = costForecasts[2]?.landedCostPct ?? Math.round(riskScore / 10);
  const actionPlan = buildActionPlan(input, riskFactors);
  const recommendations = buildRecommendations(input, riskFactors, routes);
  const searches = buildSearchRecords(input, profile, sourcesByCategory);
  const news = dedupeSources(Object.values(sourcesByCategory).flat()).slice(0, 12);
  const portRecommendation = buildPortRecommendation(input, routes, sourcesByCategory.port);

  return {
    input,
    productCategory: profile.productCategory,
    hsCodes: profile.hsCodes,
    materials: profile.materials,
    dependencyGraph: [{ node: profile.productCategory, children: profile.dependencies }],
    drivers,
    riskScore,
    riskFactors,
    costForecasts,
    expectedCostIncreasePct,
    expectedDelayDays,
    routes,
    alerts: riskFactors
      .filter((risk) => risk.score >= 58)
      .slice(0, 3)
      .map((risk) => ({
        severity: risk.score >= 72 ? "high" : "medium",
        title: risk.label,
        impact: risk.detail,
      })),
    recommendations,
    actionPlan,
    executiveSummary:
      `This analysis flags ${topRiskLabels(riskFactors)} as the main constraints for ` +
      `${input.product} moving ${input.origin} to ${input.destination}. Expect roughly ` +
      `+${expectedCostIncreasePct}% landed-cost pressure and ${expectedDelayDays[0]}-${expectedDelayDays[1]} days of schedule buffer. ` +
      "Use this run as an illustrative planning draft and verify key figures before acting.",
    news,
    geo: null,
    tariff,
    portRecommendation,
    searches,
    generatedAt: new Date().toISOString(),
    dataMode: "mock",
  };
}

function mockProductProfile(product: string): MockProductProfile {
  const p = product.toLowerCase();
  const common = ["Oil Prices", "Freight Rates", "Port Congestion", "Tariffs", "Currency Exchange"];

  if (/battery|lithium|cell|power/.test(p)) {
    return {
      productCategory: "Lithium batteries",
      hsCodes: ["8507.60", "8507.90"],
      materials: [
        { material: "Lithium compounds", pct: 35 },
        { material: "Nickel/cobalt inputs", pct: 25 },
        { material: "Aluminum", pct: 20 },
        { material: "Plastic separator", pct: 20 },
      ],
      dependencies: ["Lithium Prices", "Nickel Prices", "Aluminum Prices", "Dangerous goods compliance", ...common],
    };
  }

  if (/shirt|cotton|apparel|garment|textile|cloth/.test(p)) {
    return {
      productCategory: "Cotton apparel",
      hsCodes: ["6205.20", "6109.10"],
      materials: [
        { material: "Cotton", pct: 88 },
        { material: "Polyester trim", pct: 7 },
        { material: "Packaging", pct: 5 },
      ],
      dependencies: ["Cotton Prices", "Origin Labor Cost", ...common],
    };
  }

  if (/chair|furniture|toy|bottle|crate|bin|plastic|polymer/.test(p)) {
    return {
      productCategory: "Plastic furniture",
      hsCodes: ["9401.80", "3926.90"],
      materials: [
        { material: "Plastic resin", pct: 78 },
        { material: "Steel fasteners", pct: 14 },
        { material: "Packaging", pct: 8 },
      ],
      dependencies: ["Plastic Resin Prices", "Steel Prices", ...common],
    };
  }

  if (/steel|metal|machine|tool|appliance/.test(p)) {
    return {
      productCategory: "Metal goods",
      hsCodes: ["7326.90", "8466.20"],
      materials: [
        { material: "Steel", pct: 68 },
        { material: "Aluminum", pct: 18 },
        { material: "Plastic", pct: 9 },
        { material: "Packaging", pct: 5 },
      ],
      dependencies: ["Steel Prices", "Aluminum Prices", ...common],
    };
  }

  if (/electronic|phone|laptop|chip|device|gadget/.test(p)) {
    return {
      productCategory: "Consumer electronics",
      hsCodes: ["8517.62", "8543.70"],
      materials: [
        { material: "Semiconductors", pct: 38 },
        { material: "Aluminum", pct: 24 },
        { material: "Copper", pct: 18 },
        { material: "Plastic", pct: 20 },
      ],
      dependencies: ["Semiconductor Supply", "Copper Prices", "Aluminum Prices", ...common],
    };
  }

  return {
    productCategory: product,
    hsCodes: ["9999.00"],
    materials: [
      { material: "Primary material", pct: 70 },
      { material: "Secondary material", pct: 20 },
      { material: "Packaging", pct: 10 },
    ],
    dependencies: ["Commodity Prices", ...common],
  };
}

function buildMockSources(
  input: ShipmentInput,
  profile: MockProductProfile,
): Record<RiskCategory, Source[]> {
  return {
    commodity: [
      mockSource("Illustrative commodity price monitor", "commodity", `${profile.materials[0]?.material ?? "input"} costs show moderate short-term pressure in the illustrative feed.`),
      mockSource("Illustrative materials procurement brief", "materials", `${profile.productCategory} depends on ${profile.dependencies.slice(0, 3).join(", ")}.`),
    ],
    freight: [
      mockSource("Illustrative ocean freight index", "freight", `${input.origin} to ${input.destination} spot capacity is modeled as tightening into the requested ship window.`),
      mockSource("Illustrative carrier capacity bulletin", "carrier", "Blank-sailing and equipment assumptions add cost pressure in this simulated run."),
    ],
    port: [
      mockSource("Illustrative port dwell dashboard", "port", `${input.destination} is modeled with elevated terminal dwell and gate appointment pressure.`),
      mockSource("Illustrative vessel queue sample", "queue", "Synthetic vessel queue observations support a modest schedule buffer."),
    ],
    weather: [
      mockSource("Illustrative seasonal weather outlook", "weather", "Seasonal storm exposure is included as a route-timing risk in the demo model."),
      mockSource("Illustrative marine disruption watch", "marine", "The route carries periodic weather disruption assumptions for planning purposes."),
    ],
    geopolitical: [
      mockSource("Illustrative trade policy watch", "policy", `${input.origin} to ${input.destination} is checked for tariff and trade-policy exposure in this planning run.`),
      mockSource("Illustrative route disruption note", "geopolitical", "Synthetic geopolitical disruption assumptions are included for workflow testing."),
    ],
    supplier: [
      mockSource("Illustrative supplier health index", "supplier", `${input.origin} supplier conditions are modeled as stable but sensitive to policy and freight changes.`),
      mockSource("Illustrative manufacturing PMI sample", "pmi", "Demo manufacturing indicators show mixed export-order momentum."),
    ],
    regulatory: [
      mockSource("Illustrative customs tariff table", "tariff", `Illustrative HS candidates for ${profile.productCategory}: ${profile.hsCodes.join(", ")}.`),
      mockSource("Illustrative import documentation checklist", "documents", "Commercial invoice, packing list, bill of lading, origin evidence, and product-specific documents are modeled."),
    ],
  };
}

function buildRiskFactors(
  input: ShipmentInput,
  profile: MockProductProfile,
  sources: Record<RiskCategory, Source[]>,
): RiskFactor[] {
  const special = (input.specialRequirements ?? []).join(" ").toLowerCase();
  const heavy = input.weightKg >= 15_000;
  const crossOcean = !sameRegion(input.origin, input.destination);

  const scores: Record<RiskCategory, number> = {
    commodity: 54 + (profile.materials[0]?.pct ?? 50) / 10,
    freight: 56 + (heavy ? 8 : 0) + (crossOcean ? 7 : 0),
    port: 55 + (crossOcean ? 6 : 0),
    weather: 45 + (/sep|aug|jul|storm|monsoon|hurricane|typhoon/i.test(input.shipDate) ? 10 : 0),
    geopolitical: 48 + (/china|russia|red sea|middle east/i.test(`${input.origin} ${input.destination}`) ? 10 : 0),
    supplier: 43 + (heavy ? 4 : 0),
    regulatory: 48 + (/hazard|lithium|battery|frozen|organic/.test(special + " " + input.product.toLowerCase()) ? 16 : 0),
  };

  const copy: Record<RiskCategory, { label: string; actionable: string; detail: string }> = {
    commodity: {
      label: "Input costs firming",
      actionable: "Lock supplier pricing before booking if the quote is valid for less than 30 days.",
      detail: `${profile.materials[0]?.material ?? "Primary input"} exposure is material to landed cost in this planning run.`,
    },
    freight: {
      label: "Freight capacity pressure",
      actionable: "Hold carrier space 2-3 weeks before cargo-ready date and keep an alternate service option.",
      detail: `${input.weightKg.toLocaleString()} kg moving by ${input.shippingMode || "unspecified mode"} is modeled with peak-window capacity pressure.`,
    },
    port: {
      label: "Destination dwell risk",
      actionable: "Build a 2-4 day destination buffer and re-check terminal dwell before final booking.",
      detail: `${input.destination} is modeled with moderate dwell-time risk and possible gate appointment delays.`,
    },
    weather: {
      label: "Seasonal disruption window",
      actionable: "Check marine weather again one week before departure and keep a later cutoff option.",
      detail: `The requested ship date, ${input.shipDate}, carries synthetic seasonal disruption assumptions.`,
    },
    geopolitical: {
      label: "Policy exposure watch",
      actionable: "Confirm tariff treatment and any origin-specific restrictions before releasing cargo.",
      detail: `${input.origin} to ${input.destination} is modeled with a trade-policy review requirement.`,
    },
    supplier: {
      label: "Supplier continuity stable",
      actionable: "Request a backup production and packing confirmation before paying final balance.",
      detail: "Supplier conditions are modeled as stable, but the shipment remains sensitive to freight and policy changes.",
    },
    regulatory: {
      label: "Documentation verification needed",
      actionable: "Send the HS classification, invoice, packing list, and special-handling notes to a broker before booking.",
      detail: "Customs and documentation fields are illustrative and require human verification before operational use.",
    },
  };

  return RISK_CATEGORIES.map((category) => ({
    category,
    score: clamp(Math.round(scores[category])),
    label: copy[category].label,
    detail: copy[category].detail,
    actionable: copy[category].actionable,
    trend: scores[category] >= 58 ? "up" : scores[category] <= 45 ? "flat" : "up",
    keyFindings: sources[category].map((source) => source.title),
    sources: sources[category],
  }));
}

function buildRoutes(input: ShipmentInput, riskScore: number): RouteOption[] {
  const w = input.weightKg || 20_000;
  const oceanCost = Math.round(2200 + w * 0.035 + riskScore * 12);
  const routes: RouteOption[] = [
    { method: "Ocean Freight", cost: oceanCost, transitDays: 24, recommended: false, note: "Lowest cost for heavy cargo; requires schedule buffer." },
    { method: "Air Freight", cost: Math.round(oceanCost * 9.8), transitDays: 4, recommended: false, note: "Fastest option; materially higher freight cost." },
    { method: "Rail Freight", cost: Math.round(oceanCost * 1.65), transitDays: 18, recommended: false, note: "Viable only where intermodal corridors exist." },
    { method: "Truck Freight", cost: Math.round(oceanCost * 2.25), transitDays: 10, recommended: false, note: "Useful for regional or final-leg movement." },
  ];
  const preferred = preferredRouteIndex(input.shippingMode);
  routes[preferred].recommended = true;
  return routes;
}

function buildTariff(
  input: ShipmentInput,
  profile: MockProductProfile,
  sources: Source[],
): TariffInfo {
  const lower = `${profile.productCategory} ${input.product}`.toLowerCase();
  const baseDutyPct =
    /apparel|shirt|textile|cotton/.test(lower) ? 16.5
      : /furniture|chair/.test(lower) ? 0
        : /battery|lithium/.test(lower) ? 3.4
          : /electronic|device/.test(lower) ? 2.6
            : /food|organic|frozen/.test(lower) ? 5.5
              : 4.2;
  const additional = /china/i.test(input.origin) && /united states|usa|us|los angeles|new york/i.test(input.destination)
    ? [{ name: "Illustrative additional China-origin tariff", ratePct: 25 }]
    : [];
  const totalDutyPct = round1(baseDutyPct + additional.reduce((sum, item) => sum + item.ratePct, 0));
  const goodsValueUsd = Math.round(input.weightKg * (input.pricePerKg ?? 0));
  const estimatedDutyUsd = Math.round((goodsValueUsd * totalDutyPct) / 100);
  const special = input.specialRequirements ?? [];

  return {
    hsCode: profile.hsCodes[0] ?? "",
    originCountry: input.origin,
    destinationCountry: input.destination,
    baseDutyPct,
    additional,
    totalDutyPct,
    documents: [
      { name: "Commercial invoice", url: "" },
      { name: "Packing list", url: "" },
      { name: "Bill of lading / air waybill", url: "" },
      { name: "Certificate of origin", url: "" },
      ...(special.some((item) => /hazard|lithium|battery/i.test(item))
        ? [{ name: "Dangerous goods declaration / MSDS", url: "" }]
        : []),
      ...(special.some((item) => /organic/i.test(item))
        ? [{ name: "Organic certificate", url: "" }]
        : []),
    ].slice(0, 8),
    requirements: [
      "Broker verification of HS classification",
      "Importer record and customs entry data",
      "Declared value support for duty calculation",
      ...(special.length ? [`Special handling review: ${special.join(", ")}`] : []),
    ],
    goodsValueUsd,
    estimatedDutyUsd,
    notes: "Customs figures are illustrative only; verify classification, duty rate, and documentation with a licensed broker.",
    sources,
  };
}

function buildCostForecasts(riskScore: number): CostForecast[] {
  const base = Math.max(2.4, riskScore / 13);
  return [
    { horizonDays: 30, productCostPct: round1(base * 0.55), freightCostPct: round1(base * 0.8), landedCostPct: round1(base * 0.65) },
    { horizonDays: 60, productCostPct: round1(base * 0.85), freightCostPct: round1(base * 1.15), landedCostPct: round1(base) },
    { horizonDays: 90, productCostPct: round1(base * 1.08), freightCostPct: round1(base * 1.45), landedCostPct: round1(base * 1.22) },
  ];
}

function withDriverSources(
  drivers: DependencyDriver[],
  sourcesByCategory: Record<RiskCategory, Source[]>,
): DependencyDriver[] {
  const sourcePool = [
    ...sourcesByCategory.commodity,
    ...sourcesByCategory.freight,
    ...sourcesByCategory.port,
    ...sourcesByCategory.regulatory,
  ];
  return drivers.map((driver, index) => ({
    ...driver,
    forecastNote: driver.forecastNote || "Synthetic forecast for workflow testing.",
    sources: [sourcePool[index % sourcePool.length]].filter(Boolean),
  }));
}

function buildActionPlan(input: ShipmentInput, risks: RiskFactor[]): ActionItem[] {
  const sorted = [...risks].sort((a, b) => b.score - a.score);
  const date = parseShipDate(input.shipDate);
  return sorted.slice(0, 6).map((risk, index) => ({
    action: risk.actionable,
    deadline: index === 0 ? "Before booking" : "Before cargo release",
    dueDate: date ? daysBefore(date, 28 - index * 3) : null,
    category: risk.category,
    urgency: risk.score >= 70 ? "high" : risk.score >= 55 ? "medium" : "low",
    why: risk.label,
  }));
}

function buildRecommendations(
  input: ShipmentInput,
  risks: RiskFactor[],
  routes: RouteOption[],
): Recommendation[] {
  const top = [...risks].sort((a, b) => b.score - a.score).slice(0, 2);
  const route = routes.find((item) => item.recommended) ?? routes[0];
  return [
    { action: `Use ${route.method} with buffer`, rationale: `This planning run recommends ${route.transitDays} transit days plus risk buffer for ${input.destination}.` },
    { action: "Verify customs inputs", rationale: "Tariff and document outputs are illustrative and need broker confirmation." },
    ...top.map((risk) => ({ action: risk.actionable, rationale: risk.detail })),
  ].slice(0, 5);
}

function buildPortRecommendation(input: ShipmentInput, routes: RouteOption[], sources: Source[]): AnalysisResult["portRecommendation"] {
  const ports = candidatePorts(input.destination);
  const baseRoute = routes.find((route) => route.recommended) ?? routes[0];
  const options = ports.map((name, index) => {
    const congestionScore = [62, 48, 55, 58][index] ?? 52;
    const waitDays = Math.max(1, Math.round(congestionScore / 18));
    return {
      name,
      congestionScore,
      waitDays,
      freightCost: Math.round((baseRoute?.cost ?? 3000) * (1 + index * 0.08 + congestionScore / 700)),
      recommended: index === 1,
      note: index === 1 ? "Alternate with lower modeled dwell." : "Illustrative port option for comparison.",
      lat: null,
      lng: null,
      sources,
    };
  });
  const recommended = options.find((option) => option.recommended) ?? options[0];
  return {
    recommended: recommended.name,
    rationale: `${recommended.name} is preferred because modeled dwell is lower than the intended destination option.`,
    options,
  };
}

function buildSearchRecords(
  input: ShipmentInput,
  profile: MockProductProfile,
  sources: Record<RiskCategory, Source[]>,
): SearchRecord[] {
  const queries: Array<[string, RiskCategory, string]> = [
    ["Product & Material Agent", "commodity", `${input.product} materials composition HS code`],
    ["Tariff & Regulation Agent", "regulatory", `${input.destination} import duty ${profile.productCategory} ${profile.hsCodes[0]}`],
    ["Freight Intelligence Agent", "freight", `${input.origin} to ${input.destination} ${input.shippingMode || "freight"} rates`],
    ["Port Recommendation Agent", "port", `${input.destination} port congestion dwell time`],
    ["Weather Intelligence Agent", "weather", `${input.origin} ${input.destination} shipping weather ${input.shipDate}`],
    ["Geopolitical Intelligence Agent", "geopolitical", `${input.origin} ${input.destination} trade restrictions`],
    ["Supplier Intelligence Agent", "supplier", `${input.origin} ${profile.productCategory} supplier health`],
  ];
  return queries.map(([agent, category, query]) => ({
    agent,
    query,
    results: sources[category].length,
    mode: "mock",
  }));
}

function mockSource(title: string, slug: string, snippet: string): Source {
  return {
    title,
    url: `https://demo.homelander.local/${encodeURIComponent(slug)}`,
    snippet,
  };
}

function topRiskLabels(risks: RiskFactor[]): string {
  return [...risks]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((risk) => risk.label.toLowerCase())
    .join(", ");
}

function preferredRouteIndex(mode?: string): number {
  const m = (mode || "").toLowerCase();
  if (/air/.test(m)) return 1;
  if (/rail/.test(m)) return 2;
  if (/truck|road/.test(m)) return 3;
  return 0;
}

function candidatePorts(destination: string): string[] {
  const d = destination.toLowerCase();
  if (/los angeles|long beach|california/.test(d)) return ["Los Angeles, US", "Long Beach, US", "Oakland, US", "Seattle, US"];
  if (/new york|new jersey|east coast/.test(d)) return ["New York/New Jersey, US", "Savannah, US", "Charleston, US", "Norfolk, US"];
  if (/rotterdam|netherlands|europe/.test(d)) return ["Rotterdam, Netherlands", "Antwerp, Belgium", "Hamburg, Germany", "Bremerhaven, Germany"];
  if (/mumbai|india/.test(d)) return ["Nhava Sheva, India", "Mundra, India", "Chennai, India", "Cochin, India"];
  return [destination, `${destination} alternate port`, `${destination} inland gateway`, `${destination} secondary terminal`];
}

function sameRegion(origin: string, destination: string): boolean {
  const text = `${origin} ${destination}`.toLowerCase();
  const regions = [
    ["united states", "usa", "us", "canada", "mexico"],
    ["china", "shenzhen", "shanghai", "guangzhou", "hong kong", "vietnam", "japan", "korea"],
    ["india", "mumbai", "chennai", "delhi", "bangalore"],
    ["netherlands", "germany", "belgium", "france", "spain", "italy"],
  ];
  return regions.some((region) => {
    const hits = region.filter((term) => text.includes(term));
    return hits.length >= 2 && region.some((term) => origin.toLowerCase().includes(term)) && region.some((term) => destination.toLowerCase().includes(term));
  });
}

function parseShipDate(value: string): Date | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}

function daysBefore(date: Date, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
