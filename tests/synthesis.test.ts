import assert from "node:assert/strict";
import test from "node:test";
import { applyRequestedModeToRoutes } from "../src/lib/agents.js";
import type { RouteOption } from "../src/lib/types.js";

const routes: RouteOption[] = [
  { method: "Ocean Freight", cost: 2400, transitDays: 22, recommended: true, note: "Ocean option." },
  { method: "Air Freight", cost: 27600, transitDays: 3, recommended: false, note: "Air option." },
  { method: "Rail Freight", cost: 4100, transitDays: 18, recommended: false, note: "Rail option." },
  { method: "Truck Freight", cost: 5800, transitDays: 12, recommended: false, note: "Truck option." },
];

test("requested shipping mode overrides fallback route recommendation", () => {
  const adjusted = applyRequestedModeToRoutes(routes, "Air");

  assert.equal(adjusted.find((route) => route.recommended)?.method, "Air Freight");
  assert.equal(adjusted.filter((route) => route.recommended).length, 1);
});

test("route recommendation is preserved when no requested mode is supplied", () => {
  const adjusted = applyRequestedModeToRoutes(routes);

  assert.equal(adjusted.find((route) => route.recommended)?.method, "Ocean Freight");
  assert.equal(adjusted.filter((route) => route.recommended).length, 1);
});
