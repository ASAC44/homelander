# Homelander

Backend-only Slack bot for international trade intelligence. Accepts shipment details via DM or `@Homelander` mention, analyzes routes, costs, customs, documentation, and risks, and returns a concise summary.

## Prerequisites

- Node.js 22+
- npm

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | 3000 | HTTP server port |
| `SLACK_BOT_TOKEN` | No | — | Slack bot token |
| `SLACK_SIGNING_SECRET` | No | — | Slack signing secret |
| `OPENAI_API_KEY` | No | — | Any OpenAI-compatible API key |
| `OPENAI_MODEL` | No | gpt-4o-mini | Model name |
| `OPENAI_BASE_URL` | No | — | Any OpenAI-compatible endpoint |
| `BRIGHTDATA_API_TOKEN` | No | — | Bright Data API token |
| `BRIGHTDATA_PRO_MODE` | No | false | Bright Data pro mode |

Without API keys, runs fully offline with realistic mock data.

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
- **MOCK** — Heuristic fallbacks, realistic but not current (no API keys needed)

## License

MIT
