# Product Requirements Document: ZeroToRepo MVP

> *"Your idea has a GitHub repo before your coffee cools."*

---

## Executive Summary

| | |
| :--- | :--- |
| **Product** | ZeroToRepo |
| **Version** | Hackathon MVP (v1.0) |
| **Document Status** | Final (Sprint Ready) |
| **Last Updated** | 2026-03-24 |
| **Category** | AI Agents · Developer Productivity · MCP (Model Context Protocol) |

### Product Vision

Eliminate the **Initialization Gap** — the dead time between having an idea and pushing a first commit — by turning high-level ideas captured in Notion into fully scaffolded, roadmap-loaded GitHub repositories in under 60 seconds.

### Before vs After

| Metric | Before (Manual) | After (ZeroToRepo) |
| :--- | :---: | :---: |
| Time to First Commit | 60–120 min | **< 60 s** |
| Manual Steps | 15+ | **1** (checkbox toggle) |
| Context Switches | 4+ tools (browser, terminal, editor, GitHub) | **0** |
| Competitor Research | Ad-hoc Googling | **Automated gap analysis** |
| Roadmap Creation | Blank canvas | **7–10 labeled GitHub Issues** |

### Success Criteria

- **The "Wow" Factor:** A judge sees a GitHub repo, roadmap, and investor brief appear in real-time after a single Notion checkbox click.
- **Reliability:** The state machine handles API rate limits (Notion / Groq / GitHub) gracefully without losing state.

---

## Problem Statement

### Problem Definition

The friction between *having an idea* and *setting up the infrastructure* — competitor research, repository creation, boilerplate, task mapping — kills project momentum. Developers spend the first hour of a hackathon on setup instead of building.

### Impact Analysis

- **User Impact:** Reduces "Time to First Commit" from 60–120 minutes to < 60 seconds.
- **Market Impact:** Sits at the intersection of **AI Agents**, **Developer Productivity**, and **MCP (Model Context Protocol)** — three of the fastest-growing categories in dev tooling.

---

## Target Audience

### Primary Persona: "The Sprint Architect"

| Attribute | Detail |
| :--- | :--- |
| **Role** | Developer or technical founder at a hackathon |
| **Mindset** | Values speed over perfect configuration |
| **Tools** | Notion for planning, GitHub for shipping |
| **Frustration** | Loses momentum to boilerplate & setup |
| **Goal** | Go from napkin idea → shippable scaffold in seconds |

### Jobs to Be Done

1. **Validate** — Does a competing project already exist? (Research)
2. **Scaffold** — Set up the "Digital Workshop" (Repo + Tasks)
3. **Pitch** — Draft the initial investor brief (Synthesis)

---

## User Stories

### Epic: The Instant Scaffold

#### US-1: One-Click Repository Creation

> *"As a developer, I want to toggle a 'Trigger' checkbox in Notion so that a GitHub repository is created with a roadmap already populated in the Issues tab — without me touching the command line."*

**Acceptance Criteria:**

1. Script detects checkbox change within 5 seconds of polling.
2. Notion `Status` updates to reflect each phase: `Researching` → `Scaffolding` → `Generating Brief` → `Ready`.
3. GitHub repository contains a valid `package.json` and `README.md`.
4. 5–10 GitHub Issues are created based on LLM-generated roadmap tasks with priority labels.

#### US-2: Competitive Research

> *"As a developer, I want the system to automatically search for similar projects and surface competitive gaps so that I can position my idea before writing a single line of code."*

**Acceptance Criteria:**

1. Brave Search returns the top 5 results for the project domain.
2. Groq (Llama-3) synthesizes results into a concise Markdown "Competitive Gaps" section.
3. The analysis is written back to the Notion page body within the pipeline.

#### US-3: Investor Brief

> *"As a founder, I want an auto-generated investor brief written to my repo so that I have a pitch-ready document from day one."*

**Acceptance Criteria:**

1. Brief includes: Problem, Solution, Market Gap, Competitive Landscape, and Next Steps.
2. Brief is committed as `INVESTOR_BRIEF.md` in the repo root.
3. Content is project-specific (not generic LLM filler) — validated by including data from the competitive research phase.

---

## Functional Requirements

### Core Features (MVP — P0)

#### F1 · The Notion State Machine

- **Description:** A Node.js polling loop that watches for `Trigger: true` and `Status: Idea`.
- **Logic:** Transitions through `Researching` → `Scaffolding` → `Generating Brief` → `Ready`.
- **UI:** Provides visual feedback directly inside the Notion Database row via status updates.

#### F2 · Competitor Gap Research (Brave + Groq)

- **Description:** Queries Brave Search for similar projects, then uses Groq (Llama-3) to identify market gaps.
- **Output:** A concise Markdown string of "Competitive Gaps" written to the Notion page body.

#### F3 · GitHub "Ghost" Scaffolder (Octokit)

- **Description:** Uses the GitHub API to create a repo and commit files without a local `git clone`.
- **Output:** A private repository with `package.json`, `README.md`, and an empty `src/` folder.

#### F4 · JSON-to-Issue Roadmap

- **Description:** Groq generates a JSON array of tasks; Octokit maps them to GitHub Issues.
- **Labels:** `high`, `medium`, `low` priority labels applied automatically.

#### F5 · Investor Brief Synthesis

- **Description:** Groq generates a structured investor brief using the project name, description, and competitive research output.
- **Output:** `INVESTOR_BRIEF.md` committed to the repo root, covering Problem, Solution, Market Gap, Competitive Landscape, and Next Steps.

### MCP Integration

> MCP (Model Context Protocol) servers are used **during development** to accelerate building and testing ZeroToRepo itself.

| MCP Server | Usage |
| :--- | :--- |
| **Notion MCP** | Introspect the Notion database schema, validate property types, and test page updates without manual API exploration. |
| **Brave MCP** | Test and refine competitive research queries interactively before hardcoding them into the pipeline. |
| **GitHub MCP** | Validate repo creation, file commits, and issue generation against the live GitHub API during development. |

---

## Non-Functional Requirements

### Performance

| Metric | Target | Notes |
| :--- | :---: | :--- |
| Polling Latency | ≤ 5 s | Check for Notion updates every 5 seconds |
| End-to-End Execution | < 90 s | Entire flow for demo purposes |
| Brave Search Response | < 3 s | Per query round-trip |
| LLM Generation (Groq) | < 10 s | Per prompt (research, roadmap, brief) |

### Security

- **Auth:** All keys (`GITHUB_TOKEN`, `NOTION_SECRET`, `GROQ_API_KEY`, `BRAVE_API_KEY`) stored in `.env` and listed in `.gitignore`.
- **Permissions:** GitHub PAT scoped to `repo` and `workflow` only.

### Reliability

- **Idempotency:** Re-running the script on an existing Project Name checks for an existing `GitHub URL` to prevent duplicate repos.
- **Error Recovery:** On any pipeline failure, set `Status` → `Error` and log the phase where failure occurred (e.g., `"Error at: Scaffolding"`). The user can re-trigger after fixing the issue.
- **Rate Limit Handling:** On HTTP `429` responses from any API, apply **exponential backoff** (base 1 s, max 30 s, 3 retries) before failing gracefully.

---

## Out of Scope (v1.0)

The following are explicitly **not** included in the hackathon MVP:

- Notion webhook listeners (polling only)
- Multi-language scaffolding (Node.js only)
- User authentication / multi-tenancy
- CI/CD pipeline generation
- Custom project templates

---

## Quality Standards (Anti-Vibe Rules)

- **Code Quality:** Strict error handling for API timeouts; no swallowed exceptions.
- **Content Quality:** The Investor Brief must contain project-specific insights derived from the competitive research — not generic LLM filler.
- **UX:** Use `@clack/prompts` for aesthetic CLI feedback during the hackathon demo.

---

## UI/UX Requirements

### Information Architecture (Notion Schema)

| Property | Type | Purpose |
| :--- | :--- | :--- |
| **Name** | Title | Project Name (used for repo name) |
| **Description** | Rich Text | *(Optional)* Enhances LLM prompts with user-provided context |
| **Status** | Status | `Idea` → `Researching` → `Scaffolding` → `Generating Brief` → `Ready` · `Error` |
| **Trigger** | Checkbox | The start button |
| **GitHub URL** | URL | Populated by Octokit after repo creation |

### CLI Output

| Element | Detail |
| :--- | :--- |
| **Library** | `@clack/prompts` |
| **Spinners** | One spinner per phase (`Researching…`, `Scaffolding…`, `Generating Brief…`) |
| **Final Summary** | Clickable links to the GitHub repo and Notion page |
| **Error Display** | Phase name + error message in red; suggestion to re-trigger |

---

## Success Metrics

| Metric | Target | Measurement |
| :--- | :--- | :--- |
| **Time-to-Repo** | < 60 s | Time from checkbox click to GitHub URL appearing in Notion |
| **Roadmap Depth** | 7+ tasks | Number of GitHub Issues created with priority labels |
| **Zero-Config** | 100% | No manual `git` commands required by the user |
| **Recovery** | < 10 s | Time from `Error` state to successful re-trigger |
| **Judge Reaction** | Wow | Live demo completes end-to-end without manual intervention |

---

## Risk Assessment

| # | Risk | Probability | Impact | Mitigation |
| :---: | :--- | :---: | :---: | :--- |
| R1 | **Notion / Groq rate limits** | High | High | Exponential backoff on 429s; cache Brave results; limit polling batch size |
| R2 | **GitHub API downtime** | Low | High | Local mock server fallback for demo environment |
| R3 | **LLM hallucination** (bad roadmap / brief) | Medium | Medium | Validate JSON schema before creating issues; include few-shot examples in prompts |
| R4 | **Wi-Fi failure at demo** | Medium | Critical | Pre-cache one successful run; record backup demo video |
| R5 | **Polling misses checkbox toggle** | Low | Medium | Reduce polling interval to 3 s during demo; add manual CLI trigger as backup |

---

**Document Owner:** Hackathon Lead