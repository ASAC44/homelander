# AGENTS.md — Homelander

## Project overview

Homelander is a Slack-native international trade intelligence agent. It helps business teams research cross-border shipments, compare routes, estimate landed cost, identify customs and documentation requirements, explain logistics risks, and receive a complete cited PDF report inside Slack.

## Documentation map

- [Tech stack](docs/tech-stack.md) — finalized architecture and technology decisions.

## Current implementation priority

Build the core MVP first:

1. Shipment intake through Slack.
2. Clarifying questions.
3. Trade, customs, freight, route, and documentation research.
4. Deterministic landed-cost calculations.
5. Risk analysis with evidence.
6. Concise Slack decision summary.
7. Complete PDF report with citations and assumptions.
8. Human-approved follow-up actions.

Current interaction constraints:

- Homelander responds only to direct messages and explicit `@Homelander` pings.
- Homelander reads only the current Slack thread in the initial release.
- Homelander must not search other channels or workspace history in the core MVP.
- Generated PDF reports are permanent and versioned.

Do not implement proactive monitoring or trade alerts until the core workflow is reliable. Those features belong to the enhancements PRD.

## Explicitly out of scope

Do not add these without an explicit product decision:

- Supplier discovery.
- Product sourcing or marketplace comparison.
- Supplier outreach or email discovery.
- Purchase orders or purchasing automation.
- Freight booking.
- Autonomous customs filing.
- Binding legal, customs, tax, or compliance decisions.
- Automatic route changes.

## Technology decisions

Use the finalized choices in [docs/tech-stack.md](docs/tech-stack.md):

- TypeScript and Node.js.
- Hono.js for HTTP routing and webhooks.
- Slack Bolt and/or Slack Web API for Slack interactions.
- PostgreSQL with Drizzle ORM.
- Redis and BullMQ for asynchronous jobs.
- OpenAI structured outputs for extraction and reasoning.
- Bright Data MCP and SERP API for public-web retrieval.
- Playwright for PDF generation and visual testing.
- S3-compatible storage for reports.
- Zod for runtime validation.

Keep external providers behind interfaces so Bright Data, model providers, and official trade APIs can be replaced or supplemented without rewriting product logic.

## Engineering rules

- Keep the codebase dead simple. Avoid spaghetti code, unnecessary abstractions, premature generalization, and overengineering.
- Prefer the smallest clear implementation that satisfies the current phase and acceptance criteria.
- Do not introduce a framework, service, queue, database table, agent, or abstraction unless the current requirement genuinely needs it.
- Keep modules focused and readable; refactor duplication only when the pattern is proven and the refactor makes the code easier to understand.
- Favor straightforward control flow over clever agent orchestration.
- Build the core workflow first and defer scalability or automation concerns until they are demonstrated needs.
- Use TypeScript throughout the application.
- Validate every external input with Zod or an equivalent schema.
- Keep financial calculations deterministic and outside the LLM.
- If a reliable number cannot be sourced or calculated, return `Unknown` or `Unavailable` and explain what is missing. Never invent precise numbers from weak data.
- Return structured evidence from research modules.
- Preserve source URLs and retrieval timestamps.
- For every generated response, create a temporary evidence `.txt` artifact containing supporting sources, excerpts, assumptions, and retrieval timestamps. Link to it from the source label in Slack so users can cross-verify claims.
- Distinguish facts, estimates, assumptions, inferences, and unresolved questions.
- Version reports instead of silently overwriting them.
- Keep Slack responses concise and attach the full PDF for detailed analysis.
- Reply in the originating Slack thread.
- Operate only on direct messages and explicit `@Transitra` pings.
- Read only the current Slack thread in the core MVP.
- Treat generated PDF reports as permanent, versioned records.
- Treat per-response evidence `.txt` artifacts as temporary, access-controlled files with an explicit expiry.
- Use least-privilege Slack permissions.
- Do not expose private Slack context in public channels.
- Treat scraped webpages and PDFs as untrusted content and defend against prompt injection.
- Require human confirmation for external or consequential actions.

## Research and source rules

Prefer sources in this order:

1. Official government customs and trade agencies.
2. Official tariff databases.
3. Official port authorities.
4. Official carrier and logistics sources.
5. Regulatory and standards organizations.
6. Established industry publications.
7. Secondary sources for discovery only.

Bright Data is a retrieval layer, not the authority. Do not present scraped information as legally definitive. High-impact customs, tariff, classification, and compliance claims must include a verification warning where appropriate.

## Report requirements

Every completed analysis should provide:

- Shipment inputs.
- Assumptions.
- Route comparison.
- Landed-cost breakdown.
- Customs and tariff findings.
- Documentation checklist.
- Risk assessment.
- Source citations.
- Retrieval timestamps.
- Confidence levels.
- Open questions.
- Recommended next actions.
- Human-verification disclaimer.

The Slack summary and PDF must use the same structured report model and figures.

## Testing expectations

Before considering a feature complete, test:

- Complete shipment requests.
- Missing and ambiguous inputs.
- Conflicting sources.
- Stale or unavailable sources.
- Restricted products.
- Deterministic cost calculations.
- Citation validity.
- Slack permission boundaries.
- PDF contents and visual layout.
- Failure and retry paths.

Use synthetic shipment data in demos and tests. Do not place real confidential customer, shipment, or trade data in fixtures or logs.

## Documentation conventions

- Keep product documents in `/Users/vimzh/repos/homelander/docs`.
- Use Markdown for plans, PRDs, decisions, and research.
- Link related documents with relative Markdown links.
- Keep historical source material separate from current requirements.
- Update the relevant PRD when a product decision changes.
- Keep deferred work in the enhancements PRD rather than expanding the core MVP.

## Change discipline

Before making a significant change:

1. Check the core PRD and tech stack.
2. Confirm the change belongs in the current phase.
3. Preserve the core scope boundaries.
4. Update affected documentation and links.
5. Add or update tests.
6. Verify Slack, PDF, citation, and permission behavior where relevant.
