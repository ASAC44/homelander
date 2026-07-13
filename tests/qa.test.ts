import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackTradeAnswer } from "../src/lib/qa.js";

test("fallback answers general document questions without requiring intake", () => {
  const answer = buildFallbackTradeAnswer({
    question: "what documents do I need for cotton shirts from India to the US?",
  });

  assert.match(answer, /commercial invoice/i);
  assert.match(answer, /packing list/i);
  assert.doesNotMatch(answer, /still need/i);
});

test("fallback uses prior context for duty questions", () => {
  const answer = buildFallbackTradeAnswer({
    question: "why is my duty estimate high?",
    inputContext: {
      product: "cotton shirts",
      origin: "India",
      destination: "US",
      pricePerKg: 8,
    },
  });

  assert.match(answer, /cotton shirts/i);
  assert.match(answer, /duty depends|estimate can be high/i);
  assert.match(answer, /qualified broker|advisor/i);
});
