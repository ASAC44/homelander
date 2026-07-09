import { Hono } from "hono";
import { z } from "zod";
import { runAnalysis } from "../lib/orchestrator.js";
import type { ShipmentInput } from "../lib/types.js";

const shipmentInputSchema = z.object({
  product: z.string().min(1, "product is required"),
  origin: z.string().min(1, "origin is required"),
  destination: z.string().min(1, "destination is required"),
  weightKg: z.number().positive("weightKg must be positive"),
  quantity: z.number().int().positive().optional(),
  shipDate: z.string().min(1, "shipDate is required"),
  shippingMode: z.string().optional(),
  containerSize: z.string().optional(),
  pricePerKg: z.number().positive().optional(),
  specialRequirements: z.array(z.string()).optional(),
  locked: z.array(z.string()).optional(),
});

const analyze = new Hono();

analyze.post("/", async (c) => {
  try {
    const body = await c.req.json<ShipmentInput>();
    const parsed = shipmentInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const result = await runAnalysis(parsed.data as ShipmentInput);
    return c.json(result);
  } catch (err) {
    console.error("[analyze] error:", err);
    return c.json({ error: err instanceof Error ? err.message : "Analysis failed" }, 500);
  }
});

export { analyze };
