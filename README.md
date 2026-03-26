# ZeroToRepo 🚀

> *Idea → Research → Strategy → GitHub repo — before your coffee cools.*

**ZeroToRepo** is an AI-powered CLI agent that watches your Notion database for new ideas. When you check a trigger, it autonomously performs deep competitor research, generates a 4-week gap-targeting roadmap, scaffolds a private GitHub repo with issues, and writes a project brief — all back to Notion.

**100% MCP-native.** Notion operations go through the Notion MCP Server. ZeroToRepo itself is exposed as an MCP server for AI assistants.

---

## ⚡ Quickstart

```bash
git clone https://github.com/Abeera81/zerotorepo.git
cd zerotorepo
npm install
npm run setup    # Interactive wizard — collects keys, tests connections
npm start        # Watches Notion for triggered ideas
```

That's it. Two commands after install.

---

## 🔄 The Pipeline

When you check ☑️ **Trigger** on any idea in your Notion database:

```
Phase 1 — Research (🔍 Researching)
  ├─ Runs 5-8 Brave Search queries for competitive intelligence
  ├─ AI analyzes competitors, gaps, market insights (Groq Llama-3.3-70B)
  ├─ Generates a creative startup name + tagline
  └─ Writes "Market Analysis" sub-page to Notion via MCP
      → Competitor name, positioning, key weakness
      → Gap Opportunity: what all competitors lack

Phase 2 — Strategy (📋 Planning)
  ├─ Reads Phase 1's Gap Opportunity field
  ├─ Generates a 4-week roadmap targeting those specific gaps
  │   "Competitors lack mobile onboarding → Week 2: Build mobile onboarding flow"
  └─ Writes "Strategy & Roadmap" sub-page to Notion via MCP
      → Tasks with week, priority, owner, gap_addressed

Phase 3 — Execution (⚙️ Building)
  ├─ Creates a private GitHub repository (ghost commit — no local git clone)
  ├─ Commits scaffold: README.md, package.json, .gitignore, src/index.js
  ├─ README includes competitor table, gap analysis, tech recommendations
  └─ Opens GitHub Issues from roadmap tasks (labeled, prioritized)

Phase 4 — Synthesis (✅ Done)
  ├─ Writes "Project Brief" sub-page to Notion
  │   → Top 3 competitors & market gap
  │   → Roadmap rationale tied to research
  │   → GitHub repo link + first 3 issues
  │   → Timestamp
  └─ Marks idea as Done, unchecks trigger
```

**Fallback:** If Brave Search returns no results, the pipeline continues with template competitor data — it never breaks.

---

## 🏗️ Architecture

```
                    ┌─────────────────────────┐
                    │   Notion Database        │
                    │   (Trigger = ☑️)          │
                    └────────┬────────────────┘
                             │ MCP (stdio)
                    ┌────────▼────────────────┐
                    │  Notion MCP Server       │
                    │  @notionhq/notion-mcp    │
                    │  22 tools (API-*)         │
                    └────────┬────────────────┘
                             │
                    ┌────────▼────────────────┐
                    │  ZeroToRepo Agent        │
                    │  Groq Function Calling   │
                    │  12 tools, 14-step flow  │
                    └──┬─────┬─────┬─────┬───┘
                       │     │     │     │
                ┌──────▼┐ ┌──▼──┐ ┌▼────┐ ┌▼──────┐
                │ Brave  │ │Groq │ │ Git │ │Notion │
                │ Search │ │ LLM │ │ Hub │ │ MCP   │
                │  API   │ │ API │ │ API │ │Server │
                └────────┘ └─────┘ └─────┘ └───────┘
```

### Key Design Decisions

- **LLM-driven orchestration** — Groq decides tool call order via function calling (not hardcoded sequences)
- **MCP-native** — All Notion ops go through Notion MCP Server over stdio
- **Ghost commits** — Repos created entirely via GitHub Data API, zero local git
- **Context injection** — Large payloads (search results, research) stored in shared context, auto-injected into tool args
- **Token optimization** — Message trimming, result summarization, bounded history (fits Groq free tier)

---

## 📁 Project Structure

```
zerotorepo/
├── src/
│   ├── index.js            # CLI entry point — polling loop, @clack/prompts TUI
│   ├── agent.js            # 🤖 LLM agent — Groq function calling, 12 tools, 14-step workflow
│   ├── stateMachine.js     # Routes: live → agent, mock → sequential pipeline
│   ├── mcp-client.js       # MCP client — spawns Notion MCP server (stdio transport)
│   ├── mcp-server.js       # ZeroToRepo as MCP server — 7 tools for AI assistants
│   ├── config.js           # Env validation (fail-fast on missing keys)
│   ├── notion.js           # Notion via MCP — markdown-to-Notion-blocks converter
│   ├── research.js         # Brave Search (5-8 queries) + Groq analysis + name gen
│   ├── scaffold.js         # GitHub repo + ghost commits + rich README + issues
│   ├── roadmap.js          # 4-week gap-targeting strategy generation
│   └── brief.js            # Project Brief synthesis (competitors, roadmap, repo, timestamp)
├── prompts/                # LLM system prompts (gap-analysis, roadmap, brief, name-gen)
├── scripts/
│   ├── setup.js            # Interactive setup wizard — keys, tests, .env generation
│   └── reset-db.js         # Reset Notion database state
└── mcp.json                # MCP server configuration
```

---

## 🤖 Agent Tool Registry

The LLM agent orchestrates 12 tools across 4 phases:

| Tool | Phase | Description |
|------|-------|-------------|
| `update_notion_status` | All | Update idea status in Notion via MCP |
| `deep_search` | 🔍 Research | Run 5-8 Brave searches (with fallback) |
| `analyze_market` | 🔍 Research | AI analysis → competitors, gaps, market insights |
| `generate_startup_name` | 🔍 Research | Creative name + tagline from research |
| `save_market_analysis` | 🔍 Research | Write "Market Analysis" to Notion via MCP |
| `generate_strategy` | 📋 Strategy | 4-week roadmap targeting competitive gaps |
| `save_strategy_to_notion` | 📋 Strategy | Write "Strategy & Roadmap" to Notion via MCP |
| `create_github_repo` | ⚙️ Execution | Create private repo + ghost commit scaffold |
| `set_github_url` | ⚙️ Execution | Store repo URL in Notion via MCP |
| `create_github_issues` | ⚙️ Execution | Create labeled issues from roadmap tasks |
| `write_project_brief` | ✅ Synthesis | Write "Project Brief" to Notion via MCP |
| `finalize_idea` | ✅ Synthesis | Mark as Done, uncheck trigger |

---

## 🔌 MCP Integration

### As MCP Client (consuming Notion MCP)
All Notion operations go through `@notionhq/notion-mcp-server` (v2.2.1), spawned as a child process via stdio transport. MCP tools used: `API-query-data-source`, `API-patch-page`, `API-post-page`, `API-get-block-children`, `API-delete-a-block`.

### As MCP Server (exposing pipeline tools)
ZeroToRepo exposes 7 tools via MCP for other AI assistants:

| Tool | Description |
|------|-------------|
| `process_idea` | Run the full 4-phase pipeline |
| `research_competitors` | Deep competitive research only |
| `generate_name` | Creative startup name from research |
| `scaffold_repo` | Create GitHub repo with scaffold files |
| `generate_roadmap` | Generate & create roadmap issues |
| `generate_brief` | Synthesize project brief |
| `list_notion_ideas` | List all ideas from Notion database |

---

## 📋 Notion Database Setup

Your Notion database needs these properties:

| Property | Type | Purpose |
|----------|------|---------|
| `Name` | Title | Project / idea name |
| `Description` | Rich Text | Context for the AI (richer = better research) |
| `Status` | Status | `Idea` → `Researching` → `Planning` → `Building` → `Done` / `Error` |
| `Trigger` | Checkbox | Check to launch the pipeline |
| `GitHub URL` | URL | Auto-populated after repo creation |

Share the database page with your Notion integration.

---

## 🧪 Commands

```bash
npm run setup     # Interactive setup wizard (keys + connection tests)
npm start         # Watch Notion for triggered ideas (live mode)
npm run mock      # Offline demo — no API calls
npm run reset     # Reset Notion database state
```

---

## 💰 API Costs

| Service | Cost | Tier |
|---------|------|------|
| Groq (Llama-3.3-70B) | **$0** | Free — 100k tokens/day |
| Brave Search | **$0** | Free — 2,000 queries/month |
| Notion API (via MCP) | **$0** | Free integration |
| GitHub API | **$0** | Free with PAT |
| **Total** | **$0** | |

---

## 🛠️ Tech Stack

| Technology | Role |
|------------|------|
| Node.js v20+ | Runtime |
| `@modelcontextprotocol/sdk` | MCP client + server |
| `@notionhq/notion-mcp-server` | Notion MCP integration |
| Groq API (Llama-3.3-70B) | LLM — function calling, analysis, generation |
| Brave Search API | Real-time competitive intelligence |
| `@octokit/rest` | GitHub repo creation, ghost commits, issues |
| `@clack/prompts` | Beautiful CLI TUI |
| `dotenv` | Environment configuration |

---

## License

MIT
