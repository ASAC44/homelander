import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { renderBlocks } from "../src/slack/render.js";
import { verifySlackRequest } from "../src/slack/verify.js";
import { getEvidence, initStorage, saveEvidence, slugify } from "../src/report/storage.js";
import type { AnalysisResult } from "../src/lib/types.js";

function slackSignature(secret: string, timestamp: string, body: string): string {
  return `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}

test("Slack verification permits local mode only when no signing secret is configured", async () => {
  const body = JSON.stringify({ type: "event_callback" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = "test-secret";
  const headers = {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": slackSignature(secret, timestamp, body),
  };

  assert.equal(await verifySlackRequest(body, headers, secret), true);
  assert.equal(await verifySlackRequest(body, { ...headers, "x-slack-signature": "v0=bad" }, secret), false);
  assert.equal(
    await verifySlackRequest(
      body,
      {
        "x-slack-request-timestamp": "not-a-number",
        "x-slack-signature": slackSignature(secret, "not-a-number", body),
      },
      secret,
    ),
    false,
  );
  assert.equal(await verifySlackRequest(body, {}, ""), true);
});

test("Slack verification rejects stale signed requests", async () => {
  const body = JSON.stringify({ type: "event_callback" });
  const timestamp = String(Math.floor(Date.now() / 1000) - 301);
  const secret = "test-secret";

  assert.equal(
    await verifySlackRequest(
      body,
      {
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": slackSignature(secret, timestamp, body),
      },
      secret,
    ),
    false,
  );
});

test("evidence lookup rejects non-UUID ids and slugify never returns an empty slug", async () => {
  await initStorage();
  const saved = await saveEvidence("source: official customs test page");

  assert.equal(slugify("!!!"), "shipment");
  assert.equal(await getEvidence("../outside"), null);
  assert.equal(await getEvidence("not-a-uuid"), null);

  const evidence = await getEvidence(saved.evidenceId);
  assert.ok(evidence);
  assert.match(evidence.text, /official customs test page/);
});

test("Slack summary rendering does not reorder analysis risk factors in place", () => {
  const result: AnalysisResult = {
    input: {
      product: "Cotton shirts",
      origin: "Mumbai, India",
      destination: "New York, US",
      weightKg: 1000,
      shipDate: "2026-09-01",
    },
    productCategory: "Cotton shirts",
    hsCodes: [],
    materials: [],
    dependencyGraph: [],
    drivers: [],
    riskScore: 50,
    riskFactors: [
      {
        category: "weather",
        score: 20,
        label: "Low weather risk",
        detail: "Calm lane.",
        actionable: "Monitor weather before sailing.",
        trend: "flat",
        keyFindings: [],
        sources: [],
      },
      {
        category: "freight",
        score: 80,
        label: "High freight risk",
        detail: "Capacity is tight.",
        actionable: "Lock freight before booking.",
        trend: "up",
        keyFindings: [],
        sources: [],
      },
    ],
    costForecasts: [],
    expectedCostIncreasePct: 0,
    expectedDelayDays: [0, 0],
    routes: [
      {
        method: "Ocean Freight",
        cost: 1000,
        transitDays: 20,
        recommended: true,
        note: "Baseline route.",
      },
    ],
    alerts: [],
    recommendations: [],
    actionPlan: [],
    executiveSummary: "Use ocean freight with a booking buffer.",
    news: [],
    geo: null,
    tariff: null,
    portRecommendation: null,
    searches: [],
    generatedAt: new Date().toISOString(),
    dataMode: "mock",
  };

  renderBlocks(result);

  assert.deepEqual(
    result.riskFactors.map((risk) => risk.label),
    ["Low weather risk", "High freight risk"],
  );
});
