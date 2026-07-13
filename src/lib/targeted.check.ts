import assert from "node:assert/strict";
import { classifyTargetedDoubt } from "./targeted.js";

assert.deepEqual(classifyTargetedDoubt("what's the tariff exposure?"), {
  type: "targeted_doubt",
  kind: "tariff",
});

assert.deepEqual(classifyTargetedDoubt("is LA port congested?"), {
  type: "targeted_doubt",
  kind: "port",
});

assert.deepEqual(classifyTargetedDoubt("are freight rates rising?"), {
  type: "targeted_doubt",
  kind: "freight",
});

assert.deepEqual(
  classifyTargetedDoubt("We need to ship 10,000 metal chairs from Shenzhen to Los Angeles by September in a 40ft container."),
  { type: "full_analysis" },
);

assert.equal(classifyTargetedDoubt("can you check this?").type, "unknown");

console.log("targeted doubt router checks passed");
