# System Memory & Context 🧠
<!--
AGENTS: Update this file after every major milestone, structural change, or resolved bug.
DO NOT delete historical context if it is still relevant. Compress older completed items.
-->

## 🏗️ Active Phase & Goal
**Current Phase:** Phase 4 — Testing & Polish
**Current Task:** Full end-to-end test with real APIs (blocked on Groq daily rate limit reset & GitHub token permissions)
**Next Steps:**
1. Wait for Groq daily token limit to reset (~24 min TPD cooldown)
2. User must update GitHub fine-grained PAT: Administration, Contents, Issues → **Read & Write**
3. Run full end-to-end: trigger idea in Notion → agent orchestrates all 10 steps → repo + issues + brief created
4. Commit all changes to git
5. Demo prep: rehearse the flow, record backup video

## 📂 Architectural Decisions
- 2026-03-24 — Ghost commits via GitHub Data API (no local git clone).
- 2026-03-24 — Notion as both trigger and dashboard (no separate UI).
- 2026-03-24 — State machine: Idea → Researching → Scaffolding → Generating Brief → Ready (with Error recovery).
- 2026-03-25 — `@notionhq/client` v5.14.0 breaking change: `databases.query()` → `dataSources.query()`, `database_id` → `data_source_id`.
- 2026-03-25 — Groq model changed from retired `llama-3-70b-8192` to `llama-3.3-70b-versatile`.
- 2026-03-25 — Notion MCP integration (mandatory hackathon requirement): all Notion calls go through `@notionhq/notion-mcp-server` via MCP stdio transport.
- 2026-03-25 — ZeroToRepo is both MCP client (consumes Notion MCP) and MCP server (exposes 7 pipeline tools).
- 2026-03-26 — LLM-driven agent orchestrator (`agent.js`): Groq decides tool call order via function calling instead of hardcoded sequence. 10 tools registered, context injection for large payloads, phase reporting for CLI UX.
- 2026-03-26 — Deep research pipeline: 5-8 Brave searches per idea, keyword extraction for long descriptions, Groq gap analysis with competitors/gaps/market insights/tech recommendations.
- 2026-03-26 — Startup name generation: Groq creates creative name + tagline from research context.

## 🐛 Known Issues & Quirks
- Groq free tier: 100,000 tokens/day (TPD). A full pipeline run uses ~15-20k tokens. ~5 runs/day max.
- Brave Search free tier: 1 req/s, queries must be <100 chars. Long descriptions are auto-chunked into keywords.
- Notion API rate limit: 3 req/s average.
- GitHub fine-grained PAT currently has **Read-only** permissions — needs **Read & Write** on Administration, Contents, Issues.
- Notion MCP server is ESM; project is CommonJS. Solved by spawning MCP server as a child process.

## 📜 Completed Phases
- [x] Phase 1: Foundation (project init, config, notion polling, CLI)
- [x] Phase 2: Core Pipeline (research, scaffold, roadmap, brief)
- [x] Phase 3: Integration & MCP (Notion MCP client, MCP server, agent orchestrator, error handling, idempotency, mock mode)
- [ ] Phase 4: Testing & Polish (end-to-end test, prompt tuning, demo prep)
- [ ] Phase 5: Demo Prep (README finalized, backup video, rehearsal)

## 🔧 Key File Map
| File | Role |
|------|------|
| `src/index.js` | CLI entry point — polling loop, graceful MCP disconnect |
| `src/agent.js` | LLM-driven orchestrator — Groq function calling, 10 tools, context injection |
| `src/stateMachine.js` | Routes live mode → agent, mock mode → sequential pipeline |
| `src/mcp-client.js` | MCP client — spawns Notion MCP server, stdio transport |
| `src/mcp-server.js` | ZeroToRepo as MCP server — 7 tools for AI assistants |
| `src/notion.js` | All Notion ops via MCP (query, patch, post, delete blocks) |
| `src/research.js` | Deep multi-query Brave search + Groq analysis + name generation |
| `src/scaffold.js` | GitHub repo creation, ghost commits, rich README, issue creation |
| `src/roadmap.js` | Groq roadmap generation (feature-focused, no boilerplate) |
| `src/brief.js` | Investor brief synthesis from research + roadmap |
| `src/config.js` | Env validation, model config (`llama-3.3-70b-versatile`) |
