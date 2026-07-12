import { Hono } from "hono";
import { getSavedReport } from "../report/storage.js";

const reports = new Hono();

reports.get("/:slug/:file", async (c) => {
  const slug = c.req.param("slug");
  const fileName = c.req.param("file");
  const html = await getSavedReport(slug, fileName);
  if (!html) {
    return c.json({ error: "Report not found" }, 404);
  }
  c.header("content-type", "text/html; charset=utf-8");
  return c.body(html);
});

export { reports };
