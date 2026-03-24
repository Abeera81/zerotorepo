# Project Brief

- **Product Vision:** Eliminate the Initialization Gap — turn Notion ideas into fully scaffolded, roadmap-loaded GitHub repositories in under 60 seconds.
- **Target Audience:** Developers and technical founders at hackathons who value speed over perfect configuration and use Notion for planning + GitHub for shipping.

## Conventions
- **Naming:** camelCase for files and functions, PascalCase for classes, UPPER_SNAKE_CASE for constants
- **File Structure:** One module per concern inside `src/` — do not combine unrelated logic in a single file
- **Prompts:** System prompts live in `prompts/*.txt` — keep them separate from code for easy tuning
- **Config:** All secrets in `.env`, validated at startup by `config.js`

## Key Principles
- Ship the simplest solution that satisfies the user story. This is a 48-hour hackathon MVP.
- Use existing SDKs (`@notionhq/client`, `@octokit/rest`, `groq-sdk`) rather than raw HTTP where possible.
- Ghost commits via GitHub Data API — never shell out to `git` locally.
- Every external API call must be wrapped in error handling with retry for transient failures.
- Notion is the UI — all user feedback happens via Status property updates and CLI spinners.
- If a simpler approach exists (fewer API calls, less code), prefer it.

## Quality Gates
- All required environment variables validated at startup (fail-fast).
- Groq JSON responses validated against expected schema before use.
- Idempotency: re-running the pipeline skips already-completed phases.
- CLI output must be demo-quality — use `@clack/prompts` spinners per phase.

## Key Commands
| Command | Purpose |
|---------|---------|
| `npm install` | Install all dependencies |
| `node src/index.js` | Run the pipeline (polls Notion) |
| `node src/index.js --mock` | Run offline with fixture data |
| `node scripts/reset-db.js` | Reset Notion DB for re-demo |

## Update Cadence
- Update `MEMORY.md` after every completed phase or major architectural decision.
- Update this brief if conventions, commands, or principles change.
