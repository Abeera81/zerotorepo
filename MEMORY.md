# System Memory & Context 🧠
<!--
AGENTS: Update this file after every major milestone, structural change, or resolved bug.
DO NOT delete historical context if it is still relevant. Compress older completed items.
-->

## 🏗️ Active Phase & Goal
**Current Phase:** Phase 1 — Foundation (Hours 0–6)
**Current Task:** Initialize project scaffold — `npm init`, install dependencies, create folder structure
**Next Steps:**
1. Run `npm init` and install dependencies: `@notionhq/client`, `@octokit/rest`, `groq-sdk`, `dotenv`, `@clack/prompts`
2. Create `config.js` with environment variable validation (fail-fast on missing keys)
3. Create `notion.js` — polling loop + status update helpers
4. Wire up `index.js` entry point with `@clack/prompts` for CLI spinners
5. Test: verify polling detects a triggered Notion checkbox within 5 seconds

## 📂 Architectural Decisions
*(Log specific choices made during the build here so future agents respect them)*
- 2026-03-24 - Using ghost commits via GitHub Data API instead of local git clone for speed and zero filesystem footprint.
- 2026-03-24 - Notion acts as both trigger and dashboard — no separate UI needed.
- 2026-03-24 - Groq (Llama-3-70B) chosen for fastest free-tier LLM inference (~500 tok/s).
- 2026-03-24 - State machine pattern: Idea → Researching → Scaffolding → Generating Brief → Ready (with Error recovery).

## 🐛 Known Issues & Quirks
*(Log current bugs or weird workarounds here)*
- Groq free tier is limited to 30 RPM / 14,400 tokens/day — roughly 3 full pipeline runs per day.
- Brave Search free tier: 1 req/s, 2,000 queries/month.
- Notion API rate limit: 3 req/s average.

## 📜 Completed Phases
- [ ] Phase 1: Foundation (project init, config, notion polling, CLI)
- [ ] Phase 2: Core Pipeline (research, scaffold, roadmap, brief)
- [ ] Phase 3: Integration & State Machine (orchestration, error handling, idempotency, mock mode)
- [ ] Phase 4: Polish & Testing (smoke tests, CLI UX, prompt tuning, edge cases)
- [ ] Phase 5: Demo Prep (README, backup video, rehearsal)
