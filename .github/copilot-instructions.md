# GitHub Copilot Instructions for ZeroToRepo

## Project Context
**App:** ZeroToRepo
**Stack:** Node.js v20+, Notion API, Groq (Llama-3-70B), Brave Search, Octokit, @clack/prompts
**Stage:** MVP Development (48-hour hackathon)
**User Level:** Learning while building (explain concepts when helpful)

## Directives
1. **Master Plan:** Read `AGENTS.md` first — it contains the current phase, tasks, and constraints.
2. **Documentation:** Refer to `agent_docs/` for tech stack details, code patterns, testing guides, and full requirements.
3. **Memory:** Check `MEMORY.md` for the active task, architectural decisions, and known issues.
4. **Plan-First:** Propose a brief plan and wait for approval before making multi-file changes.
5. **Incremental Build:** Build one small feature at a time. Verify after each change.
6. **Error Handling:** Every external API call must have try/catch with retry for transient errors (429, 5xx).
7. **No Secrets:** Never hardcode API keys. All secrets come from `.env` via `config.js`.
8. **Communication:** Be concise. Explain concepts simply. Ask clarifying questions when needed.

## What NOT To Do
- Do NOT delete files without explicit confirmation
- Do NOT modify prompt templates (`prompts/`) without asking
- Do NOT add features not in the current phase
- Do NOT skip verification for "simple" changes
- Do NOT use deprecated libraries or patterns
- Do NOT commit secrets or API keys

## Commands
- `npm install` — Install dependencies
- `node src/index.js` — Run the pipeline
- `node src/index.js --mock` — Offline demo mode
- `node scripts/reset-db.js` — Reset Notion DB

## Key Architecture
- **Entry:** `src/index.js` — polling loop + CLI
- **Orchestrator:** `src/stateMachine.js` — drives phases in sequence
- **Modules:** `notion.js`, `research.js`, `scaffold.js`, `roadmap.js`, `brief.js`, `config.js`
- **Prompts:** `prompts/gap-analysis.txt`, `roadmap.txt`, `brief.txt`
