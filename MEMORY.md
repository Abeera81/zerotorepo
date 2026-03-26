# System Memory & Context 🧠
<!--
AGENTS: Update this file after every major milestone, structural change, or resolved bug.
DO NOT delete historical context if it is still relevant. Compress older completed items.
-->

## 🏗️ Active Phase & Goal
**Current Phase:** Phase 4 — Testing & Polish
**Current Task:** Final testing, hackathon post, and demo prep
**Next Steps:**
1. Run full end-to-end test with real APIs (all 4 phases)
2. Record demo video showing setup wizard → trigger → 4 phases complete
3. Submit hackathon post (HACKATHON-POST.md) to dev.to
4. Commit all changes to git

## 📂 Architectural Decisions
- 2026-03-24 — Ghost commits via GitHub Data API (no local git clone).
- 2026-03-24 — Notion as both trigger and dashboard (no separate UI).
- 2026-03-25 — Notion MCP integration (mandatory hackathon requirement): all Notion calls go through `@notionhq/notion-mcp-server` via MCP stdio transport.
- 2026-03-25 — ZeroToRepo is both MCP client (consumes Notion MCP) and MCP server (exposes 7 pipeline tools).
- 2026-03-26 — LLM-driven agent orchestrator (`agent.js`): Groq decides tool call order via function calling. 12 tools registered, 14-step workflow.
- 2026-03-26 — 4-phase pipeline: Research → Strategy → Execution → Synthesis (was 3 phases).
- 2026-03-26 — Status flow: 🔍 Researching → 📋 Planning → ⚙️ Building → ✅ Done.
- 2026-03-26 — Strategy generates 4-week gap-targeting roadmap tied to competitive gaps.
- 2026-03-26 — Project Brief replaces Investor Brief: includes repo link, issues, timestamp.
- 2026-03-26 — Notion markdown-to-blocks converter: proper headings, bullets, bold, links, quotes, dividers.
- 2026-03-26 — Interactive setup wizard (`scripts/setup.js`): 4-step key collection, connection testing, Notion DB verification.

## 🐛 Known Issues & Quirks
- Groq free tier: 100,000 tokens/day (TPD). A full pipeline run uses ~15-20k tokens. ~5 runs/day max.
- Brave Search free tier: 1 req/s, queries must be <100 chars. Long descriptions are auto-chunked into keywords.
- Notion API: 3 req/s average, 2000 chars per rich_text, 100 blocks per children array.
- GitHub fine-grained PAT needs **Read & Write** on Administration, Contents, Issues.
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
| `src/index.js` | CLI entry point — polling loop, @clack/prompts TUI |
| `src/agent.js` | LLM-driven orchestrator — Groq function calling, 12 tools, 14-step workflow |
| `src/stateMachine.js` | Routes live mode → agent, mock mode → sequential pipeline |
| `src/mcp-client.js` | MCP client — spawns Notion MCP server, stdio transport |
| `src/mcp-server.js` | ZeroToRepo as MCP server — 7 tools for AI assistants |
| `src/notion.js` | Notion ops via MCP + markdown-to-Notion-blocks converter |
| `src/research.js` | Deep multi-query Brave search + Groq analysis + market analysis format |
| `src/scaffold.js` | GitHub repo creation, ghost commits, rich README, issue creation |
| `src/roadmap.js` | 4-week gap-targeting strategy generation |
| `src/brief.js` | Project Brief synthesis (repo link, issues, timestamp) |
| `src/config.js` | Env validation, model config (`llama-3.3-70b-versatile`) |
| `scripts/setup.js` | Interactive setup wizard — key collection, connection testing |
