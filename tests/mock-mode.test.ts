import assert from "node:assert/strict";
import test from "node:test";
import { buildMockAnalysis } from "../src/lib/mock-analysis.js";
import { remainingMockDelayMs } from "../src/lib/mock-mode.js";
import { buildReportModel } from "../src/report/model.js";
import type { ShipmentInput } from "../src/lib/types.js";

const shipment: ShipmentInput = {
  product: "Lithium battery packs",
  origin: "Shenzhen, China",
  destination: "Los Angeles, United States",
  weightKg: 12_000,
  quantity: 2_400,
  shipDate: "2026-09-15",
  shippingMode: "Ocean (container)",
  containerSize: "40ft",
  pricePerKg: 18,
  specialRequirements: ["Hazardous", "Lithium batteries contained in equipment"],
};

test("mock analysis returns a complete synthetic report payload", () => {
  const result = buildMockAnalysis(shipment);

  assert.equal(result.dataMode, "mock");
  assert.equal(result.input, shipment);
  assert.ok(result.productCategory);
  assert.ok(result.hsCodes.length >= 1);
  assert.ok(result.materials.length >= 3);
  assert.ok(result.dependencyGraph.length >= 1);
  assert.ok(result.drivers.length >= 3);
  assert.ok(result.riskFactors.length >= 7);
  assert.ok(result.costForecasts.length === 3);
  assert.ok(result.routes.length >= 4);
  assert.ok(result.actionPlan.length >= 5);
  assert.ok(result.recommendations.length >= 3);
  assert.ok(result.news.length >= 5);
  assert.ok(result.searches.length >= 7);
  assert.ok(result.searches.every((search) => search.mode === "mock"));
  assert.ok(result.riskFactors.every((risk) => risk.sources.length > 0));
  assert.ok(result.tariff);
  assert.ok(result.tariff.documents.length >= 4);
  assert.ok(result.portRecommendation?.options.length);
});

test("mock analysis uses deterministic shipment value and duty figures", () => {
  const result = buildMockAnalysis(shipment);
  assert.ok(result.tariff);

  const expectedGoodsValue = shipment.weightKg * shipment.pricePerKg!;
  assert.equal(result.tariff.goodsValueUsd, expectedGoodsValue);
  assert.equal(
    result.tariff.estimatedDutyUsd,
    Math.round((expectedGoodsValue * result.tariff.totalDutyPct) / 100),
  );

  const report = buildReportModel(result);
  const recommendedRoute = result.routes.find((route) => route.recommended) ?? result.routes[0];
  assert.equal(report.landedCost.goodsValueUsd, expectedGoodsValue);
  assert.equal(report.landedCost.estimatedDutyUsd, result.tariff.estimatedDutyUsd);
  assert.equal(report.landedCost.estimatedFreightUsd, recommendedRoute.cost);
  assert.equal(
    report.landedCost.estimatedTotalUsd,
    expectedGoodsValue + result.tariff.estimatedDutyUsd + recommendedRoute.cost,
  );
});

test("mock delay helper returns remaining minimum duration without sleeping", () => {
  assert.equal(
    remainingMockDelayMs(1_000, { enabled: true, minDurationMs: 60_000, nowMs: 31_000 }),
    30_000,
  );
  assert.equal(
    remainingMockDelayMs(1_000, { enabled: true, minDurationMs: 60_000, nowMs: 70_000 }),
    0,
  );
  assert.equal(
    remainingMockDelayMs(1_000, { enabled: false, minDurationMs: 60_000, nowMs: 31_000 }),
    0,
  );
  assert.equal(
    remainingMockDelayMs(1_000, { enabled: true, minDurationMs: 0, nowMs: 31_000 }),
    0,
  );
});
