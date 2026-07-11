# Homelander Slack PDF/Report Infrastructure Plan

## Summary

Add professional LaTeX-based PDF/report delivery as the next layer on top of the single Hono Slack bot, with no frontend and no Turborepo. Keep the first implementation local-first: generate reports from the existing `AnalysisResult`, compile a polished PDF from a LaTeX template, write temporary evidence `.txt` files under a local data directory, and upload the PDF directly into the originating Slack thread.

The implementation should not add PostgreSQL, S3/R2, queues, OAuth, monitoring, or proactive alerts yet. It should create clean interfaces so those can be added later without rewriting report generation.

## Key Changes

- Add report generation modules inside the single repo:
  - `src/report/model.ts`: converts `AnalysisResult` into one shared `ReportModel`.
  - `src/report/latex.ts`: renders escaped LaTeX source from `ReportModel`.
  - `src/report/charts.ts`: converts graph-ready analysis data into LaTeX `pgfplots`/TikZ chart blocks.
  - `src/report/pdf.ts`: compiles LaTeX into a PDF file.
  - `src/report/evidence.ts`: writes temporary plain-text evidence proof files.
  - `src/report/storage.ts`: local filesystem storage interface for reports/evidence.
  - `src/report/templates/homelander-report.tex`: professional report template.
- Add dependencies:
  - Use the `tectonic` CLI for LaTeX-to-PDF compilation.
  - Keep Slack delivery through `@slack/web-api`.
- Add a local prerequisite:
  - `tectonic` must be installed and available on `PATH`.
  - If the environment cannot install `tectonic`, use `latexmk -pdf` as the fallback compiler behind the same `compileLatexReport()` interface.
- Add environment variables:
  - `REPORT_STORAGE_DIR=./data/reports`
  - `EVIDENCE_STORAGE_DIR=./data/evidence`
  - `EVIDENCE_TTL_HOURS=72`
  - `LATEX_COMPILER=tectonic`
- Keep report storage local for v1:
  - PDFs are permanent local files under `data/reports/<shipment-slug>/<report-id>.pdf`.
  - Evidence files are temporary local files under `data/evidence/<unguessable-id>.txt`.
  - Use unguessable IDs from `crypto.randomUUID()`.
  - Add a cleanup function for expired evidence files, but do not add a scheduler yet.
- Do not expose public evidence URLs yet unless the app has a public base URL configured.
  - In Slack v1, include `Evidence proof file generated: <id>` in the message.
  - If `PUBLIC_BASE_URL` is later configured, serve `GET /evidence/:id` and make the Slack source label clickable.

## Report Behavior

- Build one `ReportModel` and use it for both Slack summary metadata and PDF content so numbers do not diverge.
- Report model must include:
  - Executive summary.
  - Shipment inputs.
  - Assumptions and missing fields.
  - Route/mode comparison.
  - Cost forecast series.
  - Risk score breakdown.
  - Commodity/input driver series.
  - Dependency graph.
  - Port comparison data.
  - Landed-cost estimate from current analysis outputs.
  - Tariff/customs analysis.
  - Documentation checklist.
  - Top risks and mitigations.
  - Sources with URLs and retrieval/generation timestamps where available.
  - Confidence/limitations.
  - Human-verification disclaimer.
- PDF layout must be professional, dense, and print-ready:
  - A4 pages with consistent margins, page numbers, and footer metadata.
  - Branded cover/header with report title, shipment lane, generated timestamp, report ID, and data mode.
  - Executive decision summary with recommendation, cost estimate, transit estimate, confidence, and verification warning.
  - Clean tables for route comparison, landed-cost figures, tariff lines, documents, risks, and sources.
  - LaTeX-native charts and graphs for cost forecasts, risk breakdowns, driver trends, route options, dependencies, and port comparisons.
  - Written analysis paragraphs explaining what each graph means for the shipment decision.
  - Section hierarchy using LaTeX headings, not oversized decorative blocks.
  - Source appendix with numbered citations and URLs.
  - Clear labels for user-provided facts, estimates, assumptions, inferences, and open questions.
  - Human-verification disclaimer on the first page and final page.
- LaTeX template requirements:
  - Use `article` or `scrartcl` with `geometry`, `booktabs`, `longtable`, `array`, `xcolor`, `hyperref`, `enumitem`, `fancyhdr`, `tabularx`, `pgfplots`, and `tikz`.
  - Use `pgfplots` for line/bar charts and TikZ for compact dependency graphs.
  - Use a restrained business palette: black/gray text, one Transitra accent color, and light table shading only.
  - Use hyperlink-safe URLs in the source appendix.
  - Escape all user/model/source text before injecting into LaTeX.
  - Never let source text or user text become raw LaTeX commands.
- Required chart and graph sections:
  - Cost forecast line chart from `AnalysisResult.costForecasts`, showing product, freight, and landed-cost percentage movement across 30/60/90 days.
  - Risk breakdown bar chart from `AnalysisResult.riskFactors`, sorted by score and grouped by category.
  - Route comparison chart/table from `AnalysisResult.routes`, showing estimated cost and transit days per mode.
  - Driver trend mini charts from `AnalysisResult.drivers[].series`, limited to the top 3-5 highest-impact drivers.
  - Dependency graph from `AnalysisResult.dependencyGraph`, showing product category and upstream dependencies.
  - Port comparison table/chart from `AnalysisResult.portRecommendation.options` when available.
- Graph fallback behavior:
  - If a dataset is missing or too sparse, render a short `Insufficient data available` note for that section.
  - Never render blank axes, empty charts, or misleading zero-value graphs.
  - Keep all chart labels short and escaped for LaTeX.
  - Cap chart density so the PDF remains readable in Slack preview and printed form.
- Evidence `.txt` file must include:
  - Claims used in the Slack response.
  - Source titles and URLs.
  - Source snippets from `Source.snippet`.
  - User-provided inputs.
  - Assumptions/missing fields.
  - Calculation values shown in Slack/PDF.
  - Confidence/limitations.
  - Human-verification warnings.
  - It must not include hidden prompts, credentials, or unrelated Slack context.

## Slack Integration

- Update the successful analysis flow:
  1. Run `runAnalysis(input, emit)`.
  2. Build `ReportModel`.
  3. Generate evidence `.txt`.
  4. Generate PDF.
  5. Upload PDF to the same Slack thread using Slack Web API file upload.
  6. Post concise Slack summary with `Full PDF attached` and evidence file reference.
- Use file name format:
  - `homelander-report-<product-slug>-<YYYYMMDD-HHmm>.pdf`
- Slack scopes must include file upload permission:
  - Add `files:write` to the Slack app manifest/scopes.
- If PDF generation fails:
  - Still post the concise Slack summary.
  - Tell the user: `PDF generation failed; the analysis summary is still shown here.`
  - Log the error server-side.
- If Slack file upload fails:
  - Post the summary.
  - Tell the user the PDF was generated locally but upload failed.
  - Log the local PDF path and Slack error server-side.

## Implementation Steps

### 1. Add report/storage config

- Validate storage directories and TTL with Zod.
- Create directories on startup if missing.

### 2. Add local storage adapter

- `savePdf(buffer, metadata)` returns local file path, report ID, version label, and file name.
- `saveEvidence(text, metadata)` returns evidence ID, path, created time, and expiry time.

### 3. Add `ReportModel`

- Map from `AnalysisResult`.
- Normalize recommended route, tariff summary, documents, top risks, sources, assumptions, generated timestamp, and data mode.
- Normalize graph inputs from `costForecasts`, `riskFactors`, `routes`, `drivers`, `dependencyGraph`, and `portRecommendation`.
- Add report ID and version, with v1 using timestamp-based versioning.

### 4. Add chart helpers

- Implement chart helpers that return LaTeX-safe `pgfplots`/TikZ snippets from normalized `ReportModel` data.
- Generate:
  - Cost forecast line chart.
  - Risk score bar chart.
  - Route comparison chart.
  - Driver trend mini charts.
  - Dependency graph.
  - Port comparison chart/table.
- Keep chart helpers deterministic and independent of the LLM.
- Add fallback snippets for missing or sparse data.

### 5. Add LaTeX renderer

- Generate a complete standalone `.tex` document from `ReportModel`.
- Escape LaTeX special characters for every dynamic field: `\`, `{`, `}`, `$`, `&`, `%`, `#`, `_`, `^`, and `~`.
- Render route, tariff, document, risk, and source data with `booktabs`/`longtable` tables.
- Render chart snippets in dedicated analysis sections with a short explanatory paragraph for each chart.
- Render long URLs through `\url{}` or escaped hyperlink helpers.
- Include the disclaimer on the first page and final page.
- Write the `.tex` file next to the generated PDF for debugging unless `REPORT_KEEP_TEX=false`.

### 6. Add LaTeX PDF compiler

- Implement `compileLatexReport(texPath, outputDir)` using `child_process.spawn`.
- Default command: `tectonic --outdir <outputDir> <texPath>`.
- Fallback command when `LATEX_COMPILER=latexmk`: `latexmk -pdf -interaction=nonstopmode -halt-on-error -outdir=<outputDir> <texPath>`.
- Capture compiler stdout/stderr to `data/reports/<shipment-slug>/<report-id>.compile.log`.
- Treat any missing, empty, or invalid PDF as a generation failure.
- Enforce a compile timeout of 45 seconds.

### 7. Add evidence renderer

- Generate plain text from the same `ReportModel`.
- Keep source snippets short.
- Include expiry timestamp.
- Exclude prompts, raw model messages, tokens, secrets, and unrelated Slack text.

### 8. Add Slack file upload

- Add `uploadReportPdf(channel, threadTs, filePath, fileName, title)`.
- Upload after summary generation.
- Keep final Slack response concise and mention the uploaded PDF.

### 9. Add optional evidence route only if `PUBLIC_BASE_URL` is configured

- `GET /evidence/:id` reads non-expired local evidence file.
- Return `404` for missing/expired files.
- Do not list evidence files.

## Test Plan

- Unit tests:
  - `AnalysisResult -> ReportModel` mapping with a synthetic shipment.
  - Chart helpers generate LaTeX snippets for cost, risk, route, driver, dependency, and port data.
  - Chart helpers render fallback text for missing/sparse datasets.
  - Evidence text excludes secrets/prompts and includes sources/assumptions.
  - Storage creates report/evidence paths with unguessable IDs.
  - Evidence expiry returns expired status after TTL.
- PDF tests:
  - Generate a PDF from a synthetic complete analysis.
  - Verify PDF file exists and is non-empty.
  - Verify generated `.tex` includes required sections.
  - Verify generated `.tex` includes `pgfplots`/TikZ chart sections when data exists.
  - Verify LaTeX escaping prevents raw user/source text from becoming commands.
  - Verify compiler failures produce a readable error path and still allow Slack summary posting.
- Slack behavior tests with mocked Slack client:
  - Successful analysis uploads a PDF to the originating thread.
  - PDF generation failure still posts summary.
  - Slack upload failure logs error and posts summary.
- Manual smoke test:
  - Run `/analyze` locally and confirm a PDF/evidence file appears under `data/`.
  - Trigger Slack DM/app mention and confirm the PDF is uploaded in-thread.

## Assumptions

- The simple Hono Slack bot plan is implemented first.
- No frontend is added.
- No Turborepo is added.
- Storage is local-first for this phase.
- PDF rendering uses LaTeX, not HTML/Playwright.
- `tectonic` is the default LaTeX compiler.
- Slack PDF delivery uses direct file upload.
- PDF reports are permanent local files for v1.
- Evidence files are temporary local files with a 72-hour default TTL.
- S3/R2, signed URLs, database report history, queues, and full report versioning are deferred to a later production-hardening phase.
