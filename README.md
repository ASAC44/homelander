# Homelander

### Trade intelligence for the moment a shipment decision has to be made

Homelander is a Slack-native assistant for international trade and logistics. A team member can ask about a shipment in plain language and receive a practical decision packet covering routes, landed cost, customs, documents, and risk.

It turns a time-consuming research task into one focused conversation, with the evidence and assumptions needed for a human to make the final call.

## How Homelander works

![Homelander trade intelligence flow](docs/assets/homelander-flow.png)

The flowchart shows the journey from an initial Slack question to a reviewable trade decision:

1. **Intake:** A user sends a shipment question in a DM or with an explicit `@Homelander` mention. Homelander extracts details such as product, origin, destination, quantity, timing, value, and shipping mode.
2. **Clarification:** If an important detail is missing or ambiguous, Homelander asks a focused follow-up question before analysis continues.
3. **Research:** Specialist research agents investigate the product, tariffs, customs requirements, freight options, ports, weather, regulations, geopolitics, and other factors that could affect the shipment.
4. **Calculation:** Calculation engines compare routes and estimate landed cost, including available freight, duty, tax, handling, inland transport, storage, and other cost components.
5. **Synthesis:** Homelander combines the research and calculations into route recommendations, risk explanations, assumptions, confidence levels, and suggested next steps.
6. **Decision packet:** The user receives a concise Slack brief, an interactive report, and a formal PDF report with supporting evidence.
7. **Follow-up:** Users can continue asking practical questions about the completed analysis, such as why a route was recommended or what assumption matters most.

## Why we built it

Moving goods across borders is a high-stakes coordination problem. A single shipment decision can depend on product classification, tariff treatment, freight rates, port congestion, documentation, weather, regulations, and geopolitical events. The information exists, but it is scattered across websites, databases, carrier pages, government notices, and spreadsheets.

That fragmentation creates three problems:

- **Slow decisions:** Teams spend hours collecting information before they can compare options.
- **Hidden assumptions:** Cost estimates often leave out duties, handling, storage, inland transport, or risk.
- **Low confidence:** A recommendation is difficult to review when its sources and reasoning are not visible.

Homelander brings the research, calculation, and explanation together in the place teams already work: Slack. It helps answer questions like:

> What is the best way to move 10,000 metal office chairs from Shenzhen to Los Angeles in September, and what could make that decision go wrong?

## What Homelander delivers

- A simple Slack conversation instead of a complex form.
- Clarifying questions when shipment details are missing.
- Route and mode comparisons for practical alternatives.
- Landed-cost estimates with a transparent breakdown.
- Customs, tariff, and documentation research.
- Risk analysis across freight, ports, weather, regulation, and geopolitics.
- A concise Slack recommendation with supporting evidence.
- An interactive report for exploring the analysis.
- A formal PDF report for sharing and review.
- Follow-up answers grounded in the completed report.
- Clear separation between facts, estimates, assumptions, and open questions.

Homelander is designed to support human decisions. It does not make binding legal, customs, tax, or compliance decisions, and it does not book freight or file customs entries.

## Example prompts

- “Compare ocean and air freight for this shipment, including landed cost and transit risk.”
- “What customs documents should we verify before importing this product?”
- “Which route has the lowest expected cost if the destination port is congested?”
- “What are the biggest risks in shipping this product from India to Germany next month?”
- “Why did you recommend this route, and what assumption could change the answer?”

## What makes the approach trustworthy

- Research is returned with source URLs and retrieval times when available.
- Official government, tariff, port, carrier, and regulatory sources are preferred.
- Financial calculations are performed in code so the language model does not invent arithmetic.
- Weak or missing information is shown as `Unknown` or `Unavailable` instead of false precision.
- High-impact customs and compliance findings include a human-verification warning.
- Each response can include a temporary evidence file so users can check the claims themselves.
- Reports are retained as versioned records rather than silently overwritten.

## Hackathon scope

This submission focuses on the core workflow:

- Shipment intake through Slack.
- Clarification and structured extraction.
- Trade and logistics research.
- Deterministic landed-cost calculations.
- Risk analysis and route comparison.
- Interactive HTML and formal PDF reports.
- Cited Slack summaries and report-grounded follow-up questions.

Features such as supplier discovery, freight booking, customs filing, proactive alerts, and automatic route changes are intentionally outside the current scope.

## Try it locally

### Requirements

- Node.js 22 or newer
- npm

### Run

```bash
npm install
cp .env.example .env
npm run dev
```

To connect Slack, create an app, subscribe it to direct messages and `app_mention` events, add the required credentials to `.env`, and send a DM to Homelander or mention `@Homelander`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | 3000 | HTTP server port |
| `HOMELANDER_MOCK_MODE` | No | false | Force the analysis/report loop to use complete synthetic mock data, even when API keys are configured |
| `HOMELANDER_MOCK_MIN_DURATION_MS` | No | 60000 | Minimum elapsed time for forced mock analysis/report responses |
| `SLACK_BOT_TOKEN` | No | — | Slack bot token |
| `SLACK_SIGNING_SECRET` | No | — | Slack signing secret |
| `OPENAI_API_KEY` | No | — | Any OpenAI-compatible API key |
| `BYOK_ENCRYPTION_SECRET` | No | falls back to `SLACK_SIGNING_SECRET` | Secret used to encrypt user-supplied OpenAI keys at rest |
| `OPENAI_KEY_STORAGE_DIR` | No | `./data/byok` | Local storage directory for encrypted user OpenAI keys |
| `OPENAI_MODEL` | No | gpt-4o-mini | Model name |
| `OPENAI_BASE_URL` | No | — | Any OpenAI-compatible endpoint |
| `OPENAI_MAX_CONCURRENCY` | No | 1 custom / 3 OpenAI | Maximum concurrent model requests |
| `OPENAI_MAX_RETRIES` | No | 3 | Retry attempts for rate limits and transient provider errors |
| `OPENAI_RETRY_BASE_MS` | No | 750 | Initial retry backoff in milliseconds |
| `OPENAI_RETRY_MAX_MS` | No | 8000 | Maximum computed retry backoff in milliseconds |
| `OPENAI_RATE_LIMIT_COOLDOWN_MS` | No | 60000 | Maximum delay honored for provider retry/cooldown signals |
| `BRIGHTDATA_API_TOKEN` | No | — | Bright Data API token |
| `BRIGHTDATA_PRO_MODE` | No | false | Bright Data pro mode |

Homelander is an MVP and hackathon prototype. The core analysis flow, Slack interaction, research modules, calculation logic, evidence artifacts, interactive report, formal PDF report, and report follow-ups are implemented in this repository.

## Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/analyze` | Direct analysis (JSON body) |
| `POST` | `/slack/events` | Slack Events API webhook |

## Usage

### Direct API

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"product":"Metal office chairs","origin":"Shenzhen","destination":"Los Angeles","weightKg":20000,"quantity":10000,"shipDate":"September 2026","shippingMode":"Ocean (container)","pricePerKg":35}'
```

### Slack

1. Create a Slack app at api.slack.com
2. Enable Events API with `POST /slack/events` as the Request URL
3. Subscribe to `message.im` and `app_mention` events
4. Set `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` in `.env`
5. Install the app to your workspace
6. DM `@Homelander` or mention `@Homelander` in a channel

### Slack BYOK

Users can provide their own OpenAI key in a DM. Supported commands:

- `set api key YOUR_KEY`
- `api key status`
- `remove api key`

Behavior:

- Keys are accepted only in Slack DMs.
- Keys are stored encrypted on the server.
- If a user has a saved key, that key is used for their requests.
- If no personal key is saved, the app falls back to the workspace `OPENAI_API_KEY` if configured.
- If a key is posted in a channel, the bot warns the user to rotate it and resend via DM.

## Docker

```bash
docker compose up --build
```

## Project structure

```
src/
  config.ts           # Zod-validated environment
  server.ts           # Hono HTTP server
  lib/
    types.ts          # Domain types
    openai.ts         # OpenAI wrapper
    brightdata.ts     # Bright Data MCP adapter + mock fallback
    agents.ts         # Intelligence agents
    orchestrator.ts   # Analysis pipeline
    drivers.ts        # Commodity price drivers
    geo.ts            # Geocoding
    utils.ts          # Risk labels, formatting
  slack/
    verify.ts         # Slack signature verification
    events.ts         # Slack event handler
    render.ts         # Slack message formatter
  routes/
    health.ts
    analyze.ts
    slack-events.ts
docs/                 # Product documentation
AGENTS.md             # Agent rules and conventions
```

## Data modes

- **LIVE** — Real web searches + LLM analysis (requires API keys)
- **MOCK fallback** — Heuristic fallbacks, realistic but not current (no API keys needed)
- **Forced mock loop** — `HOMELANDER_MOCK_MODE=true` bypasses live providers for shipment analysis and returns a complete synthetic report with mock evidence/source labels. Slack intake still collects shipment details, then the final summary waits until at least `HOMELANDER_MOCK_MIN_DURATION_MS` has elapsed so demos do not complete instantly.

## License

MIT
