# AGENTS.md — Master Plan for ZeroToRepo

## Project Overview & Stack
**App:** ZeroToRepo
**Overview:** A CLI-based AI agent that eliminates the "Initialization Gap" — the dead time between having an idea and pushing a first commit. It watches a Notion database (via MCP) for triggered ideas, uses an LLM agent orchestrator (Groq function calling) to autonomously run competitor research (Brave Search), scaffold a private GitHub repository with ghost commits, generate a labeled issue roadmap, and synthesize an investor brief — all driven by AI tool-use decisions, not hardcoded sequences.
**Stack:** Node.js v20+, `@modelcontextprotocol/sdk` (MCP client + server), `@notionhq/notion-mcp-server` (Notion MCP), Groq API (`llama-3.3-70b-versatile` with function calling), Brave Search API, Octokit (`@octokit/rest`), `@clack/prompts` (CLI UX), `dotenv`
**Critical Constraints:**
- 48-hour hackathon build window
- $0 total API cost (all free tiers)
- No local `git clone` — use GitHub Data API for ghost commits
- All secrets in `.env` (gitignored), never committed
- Notion is both the trigger and the dashboard (no separate UI)
- **MCP is mandatory** — Notion operations go through Notion MCP server; ZeroToRepo itself is exposed as an MCP server

## Setup & Commands
Execute these commands for standard development workflows. Do not invent new package manager commands.
- **Setup:** `npm install`
- **Development:** `node src/index.js`
- **Mock Mode:** `node src/index.js --mock` (offline demo without API calls)
- **MCP Server:** `node src/mcp-server.js` (expose ZeroToRepo tools to AI assistants)
- **Reset Notion DB:** `node scripts/reset-db.js`

## Protected Areas
Do NOT modify these areas without explicit human approval:
- **Environment Secrets:** `.env` file and any files containing API keys.
- **Prompt Templates:** `prompts/*.txt` — these are tuned for output quality; changes affect all generated content.
- **Notion Database Schema:** The Notion properties (`Name`, `Status`, `Trigger`, `GitHub URL`, `Description`) must match exactly.

## Coding Conventions
- **Language:** JavaScript (CommonJS — `require`/`module.exports`).
- **Formatting:** Use consistent indentation (2 spaces). No trailing whitespace.
- **Architecture:** One module per concern: `notion.js`, `research.js`, `scaffold.js`, `roadmap.js`, `brief.js`, `agent.js`, `mcp-client.js`, `mcp-server.js`, `stateMachine.js`, `config.js`.
- **Error Handling:** Every external API call must be wrapped in try/catch. Agent tool errors are caught and reported back to the LLM for recovery. Never swallow exceptions.
- **Naming:** camelCase for functions/variables, PascalCase for classes, UPPER_SNAKE for constants.
- **Type Safety:** Validate all Groq JSON responses against expected schemas before using them.

## How I Should Think
1. **Understand Intent First**: Before answering, identify what the user actually needs
2. **Ask If Unsure**: If critical information is missing, ask before proceeding
3. **Plan Before Coding**: Propose a plan, ask for approval, then implement
4. **Verify After Changes**: Run the app or manual checks after each change
5. **Explain Trade-offs**: When recommending something, mention alternatives

## Agent Behaviors
These rules apply across all AI coding assistants:
1. **Plan Before Execution:** ALWAYS propose a brief step-by-step plan before changing more than one file.
2. **Refactor Over Rewrite:** Prefer refactoring existing functions incrementally rather than completely rewriting large blocks of code.
3. **Context Compaction:** Write states to `MEMORY.md` instead of filling context history during long sessions.
4. **Iterative Verification:** Run the app or manual checks after each logical change. Fix errors before proceeding (See `REVIEW-CHECKLIST.md`).
5. **Incremental Build:** Build one phase at a time (Research → Scaffold → Roadmap → Brief). Test each before moving on.

## What NOT To Do
- Do NOT delete files without explicit confirmation
- Do NOT modify the Notion database schema without backup plan
- Do NOT add features not in the current phase
- Do NOT skip testing for "simple" changes
- Do NOT bypass failing checks
- Do NOT use deprecated libraries or patterns
- Do NOT commit secrets or API keys

## Current Phase
**Phase 4 — Testing & Polish**
See `MEMORY.md` for active task, known issues, and next steps.
See `agent_docs/` for detailed tech stack, testing, and requirements.
