# n8n-nodes-helve

[![CI](https://github.com/helve-dev/n8n-nodes-helve/actions/workflows/ci.yml/badge.svg)](https://github.com/helve-dev/n8n-nodes-helve/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/n8n-nodes-helve.svg)](https://www.npmjs.com/package/n8n-nodes-helve)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Community node for [n8n](https://n8n.io) that connects your self-hosted workflows and AI Agents to **330+ third-party APIs** (web search, page extraction, audio transcription, SEC EDGAR filings, GitHub, LLMs, and more) through **one `HELVE_API_KEY`** at **0% per-call markup**.

- **$1.00 free starter credit + 1:1 first top-up credit match (up to +$10 bonus)** at [helve.dev/signup](https://helve.dev/signup) (`≈ 1,000 Serper searches` or `1,000 Exa scrapes` at 0% markup; non-expiring top-up packs from $5 — add $5 to get $10, or add $10 to get $20).
- **Deterministic budget caps (`spend_limit_usd`):** server-side per-key caps (HTTP 402 before overspend) plus optional per-execution caps directly inside the n8n node.
- **$0.00 failed-call escrow:** upstream timeouts or errors never debit your balance.
- **AI Agent Tool ready (`usableAsTool: true`):** drop the Helve node directly into n8n's AI Agent node as a tool, or run it in standard workflows.
- **Zero runtime dependencies:** uses n8n's built-in `httpRequest` helper only.

## Install in Self-Hosted n8n

### Via n8n UI (Recommended)

1. Open **Settings -> Community Nodes**.
2. Click **Install a community node**.
3. Enter `n8n-nodes-helve`, acknowledge the risk checkbox, and click **Install**.

### Via Docker / CLI

```bash
npm install n8n-nodes-helve
```

## Credentials

1. Create a free account at [helve.dev/signup](https://helve.dev/signup) and copy your `sk_live_...` API key ($1.00 free credit included).
2. In n8n, create a new **Helve API** credential and paste your API key (Base URL defaults to `https://helve.dev`).

## Operations

| Operation | Underlying Endpoint / Tool | What It Does |
| --- | --- | --- |
| **Web Search** | `helve.web_search` | Search across 11 engines (`auto`, `fusion`, `exa`, `tavily`, `brave`, `serper`, `firecrawl`, `perplexity`, `parallel`, `linkup`, `valyu`, `jina`, `octen`) with domain & date filters |
| **Page Extract** | `helve.web_extract` | Extract clean Markdown, summaries, or focused excerpts from 1–20 URLs |
| **Audio Transcribe** | `helve.audio_transcribe` | Transcribe audio/video URLs via AssemblyAI, Deepgram, or ElevenLabs Scribe with speaker diarization and optional auto-polling |
| **Get Job Status** | `GET /v1/jobs/{id}` | Poll any async Helve job by ID |
| **Call Any Tool (330+ APIs)** | `POST /v1/tools/call` | Invoke any catalog `tool_id` (`exa.answer`, `sec_edgar.search_filings`, `openrouter.chat`, etc.) |
| **Search Catalog (Free)** | `POST /v1/tools/search` | Search 330+ APIs by intent or category to inspect schemas and upfront pricing |

Every execution item includes `_helve_execution` metadata (`cost_usd`, `cumulative_cost_usd`, `spend_limit_usd`) so downstream nodes can log or alert on spend.

## Ready-to-Import Self-Hosted Workflow Templates

Import any JSON file from [`templates/`](./templates) via **Workflows -> Import from File**:

1. **[`01-competitor-research-brief.json`](./templates/01-competitor-research-brief.json)** — Multi-engine web search (`fusion`) -> pick top 3 URLs -> extract clean Markdown & summaries (~$0.02/run).
2. **[`02-podcast-meeting-audio-brief.json`](./templates/02-podcast-meeting-audio-brief.json)** — Audio/video URL transcription with speaker diarization (`waitForCompletion`) -> LLM action-item summary via `openrouter.chat`.
3. **[`03-sec-company-monitor.json`](./templates/03-sec-company-monitor.json)** — Daily scheduled monitor pulling SEC EDGAR 10-K/10-Q/8-K filings ($0.00) alongside live Brave web news search.

## Links

- Docs: [docs.helve.dev](https://docs.helve.dev)
- MCP Server & SDKs: [helve-dev/helve-mcp](https://github.com/helve-dev/helve-mcp)
- Pricing: [helve.dev/pricing](https://helve.dev/pricing)
