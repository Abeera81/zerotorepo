# ZeroToRepo 🚀

> *Your idea has a GitHub repo before your coffee cools.*

An **AI agent** that turns a Notion checkbox click into a fully scaffolded GitHub repository — with deep competitor research, a creative startup name, a labeled issue roadmap, and an investor brief — all orchestrated by an LLM deciding what to do next.

**Built with MCP (Model Context Protocol)** — Notion operations go through Notion MCP Server, and ZeroToRepo itself is exposed as an MCP server for AI assistants to consume.

## How It Works

```
1. ☑️  Check "Trigger" in your Notion Ideas database
2. 🤖  Groq AI agent wakes up and decides the tool execution order
3. 🔍  Runs 5-8 Brave searches for deep competitive intelligence
4. 🧠  Analyzes competitors, gaps, market insights via Groq (Llama-3.3-70B)
5. ✨  Generates a creative startup name + tagline
6. 📝  Saves rich research report to Notion (via MCP)
7. 🏗️  Creates a private GitHub repo with scaffold files (ghost commit — no git clone)
8. 📋  Generates 7-10 implementable GitHub Issues as your roadmap
9. 💼  Synthesizes an investor brief from research + roadmap
10. ✅  Marks idea as "Ready" with a link to your new repo
```

## Key Features

- **LLM-Driven Agent** — Groq decides tool call order via function calling (not hardcoded)
- **MCP Integration** — Notion operations via MCP protocol; ZeroToRepo exposed as MCP server
- **Deep Research** — 5-8 targeted searches, keyword extraction, competitor analysis with gaps & market insights
- **Smart Naming** — AI-generated startup name + tagline based on research context
- **Rich README** — Generated with competitor table, gap analysis, tech recommendations
- **Feature-Focused Roadmap** — No boilerplate tasks; only implementable feature issues
- **Ghost Commits** — Repo created entirely via GitHub API, zero local git operations
- **Mock Mode** — Full offline demo without any API calls

## Quick Start

### 1. Prerequisites

- **Node.js v20+**
- A [Notion Integration](https://www.notion.so/my-integrations) connected to your Ideas database
- API keys for: [Groq](https://console.groq.com), [Brave Search](https://api.search.brave.com), [GitHub PAT](https://github.com/settings/tokens)

### 2. Setup

```bash
git clone https://github.com/Abeera81/zerotorepo.git
cd zerotorepo
npm install
cp .env.example .env
# Edit .env with your API keys
```

### 3. Environment Variables

```env
NOTION_API_KEY=ntn_...          # Notion integration token
NOTION_DATABASE_ID=...          # Your Notion database ID
GROQ_API_KEY=gsk_...            # Groq API key
BRAVE_API_KEY=BSA...            # Brave Search API key
GITHUB_TOKEN=github_pat_...     # GitHub fine-grained PAT (Read & Write: Administration, Contents, Issues)
GITHUB_OWNER=your-username      # GitHub username
```

### 4. Notion Database Setup

Create a Notion database with these exact properties:

| Property | Type | Purpose |
|----------|------|---------|
| `Name` | Title | Project/idea name |
| `Description` | Rich Text | Context for the AI agent (the richer, the better research) |
| `Status` | Status | Options: `Idea`, `Researching`, `Scaffolding`, `Generating Brief`, `Ready`, `Error` |
| `Trigger` | Checkbox | The start button — check to launch the pipeline |
| `GitHub URL` | URL | Auto-populated after repo creation |

Share the database with your Notion integration.

### 5. Run

```bash
# Live mode — AI agent polls Notion and orchestrates the full pipeline
node src/index.js

# Mock mode — offline demo, no API calls
node src/index.js --mock

# MCP server mode — expose ZeroToRepo tools for AI assistants
node src/mcp-server.js
```

### 6. Reset (between demos)

```bash
node scripts/reset-db.js
```

## Architecture

```
zerotorepo/
├── src/
│   ├── index.js            # CLI entry point — polling loop + graceful shutdown
│   ├── agent.js            # 🤖 LLM agent orchestrator — Groq function calling, 10 tools
│   ├── stateMachine.js     # Routes: live → agent, mock → sequential pipeline
│   ├── mcp-client.js       # MCP client — spawns Notion MCP server (stdio transport)
│   ├── mcp-server.js       # ZeroToRepo as MCP server — 7 tools for AI assistants
│   ├── config.js           # Env validation (fail-fast on missing keys)
│   ├── notion.js           # Notion operations via MCP (query, patch, post, delete)
│   ├── research.js         # Deep multi-query Brave search + Groq analysis + name gen
│   ├── scaffold.js         # GitHub repo + ghost commits + rich README + issues
│   ├── roadmap.js          # Groq roadmap generation (feature-focused)
│   └── brief.js            # Investor brief synthesis
├── prompts/                # LLM system prompts (gap-analysis, roadmap, brief, name-gen)
├── scripts/                # Utility scripts (reset-db.js)
├── fixtures/               # Mock data for --mock mode
├── agent_docs/             # Tech stack docs, code patterns, testing guides
└── mcp.json                # MCP server configuration
```

## Agent Tool Registry

The LLM agent has access to 10 tools and decides the execution order:

| Tool | Phase | Description |
|------|-------|-------------|
| `update_notion_status` | All | Update idea status in Notion (via MCP) |
| `deep_search` | Research | Run 5-8 Brave searches for competitive intelligence |
| `analyze_market` | Research | AI analysis of competitors, gaps, market insights |
| `generate_startup_name` | Research | Creative name + tagline from research context |
| `save_research_to_notion` | Research | Save rich research report to Notion (via MCP) |
| `create_github_repo` | Scaffold | Create repo + ghost commit with scaffold files |
| `set_github_url` | Scaffold | Set GitHub URL on Notion page (via MCP) |
| `create_roadmap_issues` | Roadmap | Generate & create 7-10 GitHub Issues |
| `write_investor_brief` | Brief | Synthesize investor brief → Notion |
| `finalize_idea` | Done | Mark as Ready, uncheck trigger |

## MCP Integration

ZeroToRepo uses MCP in two ways:

### As MCP Client (consuming Notion MCP)
All Notion API calls go through the official `@notionhq/notion-mcp-server`, spawned as a child process via stdio transport. Tools used: `API-query-data-source`, `API-patch-page`, `API-post-page`, `API-get-block-children`, `API-delete-a-block`.

### As MCP Server (exposing pipeline tools)
ZeroToRepo exposes 7 tools via MCP for AI assistants:
- `process_idea` — Run the full pipeline for a given idea name
- `research_competitors` — Run deep research only
- `generate_name` — Generate startup name from research
- `scaffold_repo` — Create GitHub repo with scaffold
- `generate_roadmap` — Generate and create roadmap issues
- `generate_brief` — Synthesize investor brief
- `list_notion_ideas` — List all ideas in the Notion database

## Pipeline Flow

```
Notion (Trigger via MCP)
  → Groq Agent decides tool order
    → Research (Brave Search × 5-8 + Groq Analysis)
    → Name Generation (Groq)
    → Save to Notion (via MCP)
    → Scaffold (GitHub API — ghost commits)
    → Roadmap (Groq → GitHub Issues)
    → Brief (Groq → Notion via MCP)
    → Finalize (Ready ✅)
```

Each phase has:
- **AI-driven ordering** — the LLM decides what to do next
- **Error recovery** — failed tools report back to the LLM for graceful handling
- **Context injection** — large payloads (search results, research) passed between tools automatically
- **Idempotency** — safe to re-run after crashes
- **Status feedback** — Notion row updates in real-time via MCP

## API Costs

| Service | Cost |
|---------|------|
| Groq (Llama-3.3-70B) | **$0** — Free tier (100k tokens/day) |
| Brave Search | **$0** — Free tier (2k queries/month) |
| Notion API (via MCP) | **$0** — Free integration |
| GitHub API | **$0** — Free with PAT |
| **Total** | **$0** |

## License

MIT
