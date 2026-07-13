import assert from "node:assert/strict";
import test from "node:test";
import { routeMessage } from "../src/slack/router.js";

test("routes document questions to direct Q&A", async () => {
  const decision = await routeMessage("what documents do I need for cotton shirts from India to the US?");
  assert.equal(decision.route, "question");
});

test("routes duty-estimate questions to direct Q&A with prior context", async () => {
  const decision = await routeMessage("why is my duty estimate high?", {
    hasLastAnalysis: true,
  });
  assert.equal(decision.route, "question");
});

test("routes explicit shipment analysis requests to intake", async () => {
  const decision = await routeMessage("analyze 10,000kg cotton shirts from India to New York by September");
  assert.equal(decision.route, "analysis_request");
});

test("routes active intake field answers back to intake", async () => {
  const decision = await routeMessage("40ft container, $3/kg, no special handling", {
    awaitingIntake: true,
    input: {
      product: "cotton shirts",
      origin: "India",
      destination: "New York",
    },
  });
  assert.equal(decision.route, "analysis_request");
});
