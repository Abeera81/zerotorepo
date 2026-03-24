# Product Requirements

> Source: PRD-ZeroToRepo.md

## Product
- **Name:** ZeroToRepo
- **Version:** Hackathon MVP (v1.0)
- **Category:** AI Agents · Developer Productivity · MCP (Model Context Protocol)

## One-Line Description
Turn high-level ideas captured in Notion into fully scaffolded, roadmap-loaded GitHub repositories in under 60 seconds.

## Primary User Story
> *"As a developer, I want to toggle a 'Trigger' checkbox in Notion so that a GitHub repository is created with a roadmap already populated in the Issues tab — without me touching the command line."*

## All User Stories

### US-1: One-Click Repository Creation
> *"As a developer, I want to toggle a 'Trigger' checkbox in Notion so that a GitHub repository is created with a roadmap already populated in the Issues tab — without me touching the command line."*

**Acceptance Criteria:**
1. Script detects checkbox change within 5 seconds of polling.
2. Notion `Status` updates to reflect each phase: `Researching` → `Scaffolding` → `Generating Brief` → `Ready`.
3. GitHub repository contains a valid `package.json` and `README.md`.
4. 5–10 GitHub Issues are created based on LLM-generated roadmap tasks with priority labels.

### US-2: Competitive Research
> *"As a developer, I want the system to automatically search for similar projects and surface competitive gaps so that I can position my idea before writing a single line of code."*

**Acceptance Criteria:**
1. Brave Search returns the top 5 results for the project domain.
2. Groq (Llama-3) synthesizes results into a concise Markdown "Competitive Gaps" section.
3. The analysis is written back to the Notion page body within the pipeline.

### US-3: Investor Brief
> *"As a founder, I want an auto-generated investor brief written to my repo so that I have a pitch-ready document from day one."*

**Acceptance Criteria:**
1. Brief includes: Problem, Solution, Market Gap, Competitive Landscape, and Next Steps.
2. Brief is committed as content in a Notion sub-page.
3. Content is project-specific (not generic LLM filler) — validated by including data from the competitive research phase.

## Must-Have Features (MVP — P0)

### F1 · The Notion State Machine
- Node.js polling loop watches for `Trigger: true` and `Status: Idea`
- Transitions through: `Researching` → `Scaffolding` → `Generating Brief` → `Ready`
- Visual feedback via Notion Status property updates

### F2 · Competitor Gap Research (Brave + Groq)
- Queries Brave Search for similar projects
- Groq (Llama-3) identifies market gaps
- Output: Markdown "Competitive Gaps" written to Notion sub-page

### F3 · GitHub "Ghost" Scaffolder (Octokit)
- Creates private repo via GitHub API (no local git)
- Commits: `package.json`, `README.md`, `.gitignore`, `src/index.js`

### F4 · JSON-to-Issue Roadmap
- Groq generates JSON array of 7–10 tasks
- Octokit creates GitHub Issues with `high`/`medium`/`low` priority labels

### F5 · Investor Brief Synthesis
- Groq generates structured investor brief from research + roadmap
- Sections: Problem, Market Gap, Solution, Roadmap, Why Now
- Written as Notion sub-page

## Nice-to-Have Features
- Mock mode (`--mock` flag) for offline demos
- Notion DB reset script for re-demo
- `@clack/prompts` CLI polish (spinners, colors, timing)
- Prompt engineering refinement for higher-quality output

## NOT in MVP
- Notion webhook listeners (polling only)
- Multi-language scaffolding (Node.js only)
- User authentication / multi-tenancy
- CI/CD pipeline generation
- Custom project templates

## Success Metrics
| Metric | Target |
|--------|--------|
| Time-to-Repo | < 60 seconds (checkbox click → GitHub URL in Notion) |
| Roadmap Depth | 7+ tasks with priority labels |
| Zero-Config | 100% — no manual `git` commands required |
| Recovery | < 10 seconds from Error → successful re-trigger |
| Judge Reaction | Live demo completes end-to-end without intervention |

## UI/UX Requirements

### Notion Schema (exact property names)
| Property | Type | Purpose |
|----------|------|---------|
| `Name` | Title | Project name (used for repo name) |
| `Description` | Rich Text | Optional — enhances LLM prompts |
| `Status` | Status | `Idea` → `Researching` → `Scaffolding` → `Generating Brief` → `Ready` · `Error` |
| `Trigger` | Checkbox | The start button |
| `GitHub URL` | URL | Populated after repo creation |

### CLI Output
- **Library:** `@clack/prompts`
- **Spinners:** One per phase (`Researching…`, `Scaffolding…`, `Generating Brief…`)
- **Final Summary:** Clickable links to GitHub repo and Notion page
- **Error Display:** Phase name + error message in red; suggestion to re-trigger

## Timeline
- **Build Window:** 48 hours (hackathon)
- **Total API Cost:** $0 (all free tiers)

## Constraints
- All API keys stored in `.env` and listed in `.gitignore`
- GitHub PAT scoped to `repo` and `workflow` only
- Idempotent: re-running skips completed phases
- On failure: set Status → `Error`, log phase, allow re-trigger
- Rate limits: exponential backoff (base 1s, max 30s, 3 retries) on HTTP 429
