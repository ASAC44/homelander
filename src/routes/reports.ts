import { Hono } from "hono";
import { getSavedReportFile } from "../report/storage.js";

const reports = new Hono();

reports.get("/:slug/:file", async (c) => {
  const slug = c.req.param("slug");
  const fileName = c.req.param("file");
  const report = await getSavedReportFile(slug, fileName);
  if (!report) {
    return c.json({ error: "Report not found" }, 404);
  }
  return new Response(new Uint8Array(report.body), {
    headers: { "content-type": report.contentType },
  });
});

export { reports };
