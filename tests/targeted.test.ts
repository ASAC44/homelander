import assert from "node:assert/strict";
import test from "node:test";
import { classifyTargetedDoubt } from "../src/lib/targeted.js";

test("classifies singular tariff doubts as targeted doubts", () => {
  assert.deepEqual(classifyTargetedDoubt("why is my duty estimate high?"), {
    type: "targeted_doubt",
    kind: "tariff",
  });
});

test("keeps complete shipment requests on the full-analysis path", () => {
  assert.deepEqual(
    classifyTargetedDoubt("ship 10,000kg cotton shirts from India to New York by ocean"),
    { type: "full_analysis" },
  );
});
