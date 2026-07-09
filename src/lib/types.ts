export interface ShipmentInput {
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
}

export interface IntakeResult {
  input: ShipmentInput;
  missing: string[];
  missingFields: string[];
  question: string | null;
  ready: boolean;
}

export type RiskCategory =
  | "commodity"
  | "freight"
  | "port"
  | "weather"
  | "geopolitical"
  | "supplier"
  | "regulatory";

export interface Source {
  title: string;
  url: string;
  snippet?: string;
}

export interface MaterialBreakdown {
  material: string;
  pct: number;
}

export interface RiskFactor {
  category: RiskCategory;
  score: number;
  label: string;
  detail: string;
  actionable: string;
  trend: "up" | "down" | "flat";
  keyFindings: string[];
  sources: Source[];
}

export interface CostForecast {
  horizonDays: 30 | 60 | 90;
  productCostPct: number;
  freightCostPct: number;
  landedCostPct: number;
}

export interface RouteOption {
  method: string;
  cost: number;
  transitDays: number;
  recommended: boolean;
  note: string;
}

export interface Alert {
  severity: "high" | "medium" | "low";
  title: string;
  impact: string;
}

export interface Recommendation {
  action: string;
  rationale: string;
}

export interface ActionItem {
  action: string;
  deadline: string;
  dueDate: string | null;
  category: RiskCategory | "general";
  urgency: "high" | "medium" | "low";
  why: string;
}

export interface DependencyNode {
  node: string;
  children: string[];
}

export interface DriverPoint {
  t: string;
  v: number | null;
  f?: number | null;
}

export interface DependencyDriver {
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
  series: DriverPoint[];
  sources: Source[];
}

export interface GeoPoint {
  name: string;
  lat: number;
  lng: number;
}

export interface RouteGeo {
  origin: GeoPoint;
  destination: GeoPoint;
  distanceKm: number;
}

export interface SearchRecord {
  agent: string;
  query: string;
  results: number;
  mode: "live" | "mock";
}

export interface TariffLine {
  name: string;
  ratePct: number;
}

export interface DocItem {
  name: string;
  url: string;
}

export interface TariffInfo {
  hsCode: string;
  originCountry: string;
  destinationCountry: string;
  baseDutyPct: number;
  additional: TariffLine[];
  totalDutyPct: number;
  documents: DocItem[];
  requirements: string[];
  goodsValueUsd: number;
  estimatedDutyUsd: number;
  notes: string;
  sources: Source[];
}

export interface PortOption {
  name: string;
  congestionScore: number;
  waitDays: number;
  freightCost: number;
  recommended: boolean;
  note: string;
  lat: number | null;
  lng: number | null;
  sources: Source[];
}

export interface PortRecommendation {
  recommended: string;
  rationale: string;
  options: PortOption[];
}

export interface AnalysisResult {
  input: ShipmentInput;
  productCategory: string;
  hsCodes: string[];
  materials: MaterialBreakdown[];
  dependencyGraph: DependencyNode[];
  drivers: DependencyDriver[];
  riskScore: number;
  riskFactors: RiskFactor[];
  costForecasts: CostForecast[];
  expectedCostIncreasePct: number;
  expectedDelayDays: [number, number];
  routes: RouteOption[];
  alerts: Alert[];
  recommendations: Recommendation[];
  actionPlan: ActionItem[];
  executiveSummary: string;
  news: Source[];
  geo: RouteGeo | null;
  tariff: TariffInfo | null;
  portRecommendation: PortRecommendation | null;
  searches: SearchRecord[];
  generatedAt: string;
  dataMode: "live" | "mock";
}
