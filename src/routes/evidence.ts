import { Hono } from "hono";
import { env } from "../config.js";
import { getEvidence } from "../report/storage.js";

const evidence = new Hono();

// GET /evidence/:id
evidence.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getEvidence(id);

  if (!result) {
    return c.json({ error: "Evidence not found or expired" }, 404);
  }

  return c.text(result.text);
});

export { evidence };
