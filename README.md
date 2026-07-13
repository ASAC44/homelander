# Homelander

### Trade intelligence for the moment a shipment decision has to be made

Homelander is a Slack-native assistant for international trade and logistics. A team member can ask about a shipment in plain language and receive a practical decision brief covering routes, cost, customs, documents, and risk.

It turns a time-consuming research task into one focused conversation, with the evidence and assumptions needed for a human to make the final call.

## How Homelander works

![Homelander trade intelligence flow](docs/assets/homelander-flow.png)

The flowchart shows the journey from an initial Slack question to a reviewable trade decision:

1. **Intake:** A user sends a shipment question in a DM or with an explicit `@Homelander` mention. Homelander extracts the key details such as product, origin, destination, quantity, timing, value, and shipping mode.
2. **Clarification:** If an important detail is missing or ambiguous, Homelander asks a focused follow-up question before analysis continues.
3. **Research:** Specialist research agents investigate the product, tariffs, customs requirements, freight options, ports, weather, regulations, geopolitical conditions, and other factors that could affect the shipment.
4. **Calculation:** Deterministic calculation engines compare routes and estimate landed cost. This includes available freight, duty, tax, handling, inland transport, storage, and other cost components.
5. **Synthesis:** Homelander combines the research and calculations into route recommendations, risk explanations, assumptions, confidence levels, and suggested next steps.
6. **Decision packet:** The user receives a concise Slack brief with supporting evidence and a complete PDF report for sharing, review, and verification.

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
- A complete PDF report for sharing and review.
- Clear separation between facts, estimates, assumptions, and open questions.

Homelander is designed to support human decisions. It does not make binding legal, customs, tax, or compliance decisions, and it does not book freight or file customs entries.

## Example prompts

- “Compare ocean and air freight for this shipment, including landed cost and transit risk.”
- “What customs documents should we verify before importing this product?”
- “Which route has the lowest expected cost if the destination port is congested?”
- “What are the biggest risks in shipping this product from India to Germany next month?”

## What makes the approach trustworthy

- Research is returned with source URLs and retrieval times when available.
- Official government, tariff, port, carrier, and regulatory sources are preferred.
- Financial calculations are performed in code so the language model does not invent arithmetic.
- Weak or missing information is shown as `Unknown` or `Unavailable` instead of false precision.
- High-impact customs and compliance findings include a human-verification warning.
- Each response can include a temporary evidence file so users can check the claims themselves.

## Hackathon scope

This submission focuses on the core workflow:

- Shipment intake through Slack.
- Clarification and structured extraction.
- Trade and logistics research.
- Deterministic landed-cost calculations.
- Risk analysis and route comparison.
- Cited Slack summaries and PDF reports.

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

To connect Slack, create an app, subscribe it to direct messages and `app_mention` events, add the credentials to `.env`, and send a DM to Homelander or mention `@Homelander`.

## Project status

Homelander is an MVP and hackathon prototype. The core analysis flow, Slack interaction, research modules, calculation logic, evidence artifacts, and report generation are implemented in this repository.

The most important next steps are stronger source validation, broader official trade data coverage, production storage, and more end-to-end testing with real Slack interactions.

## License

MIT
