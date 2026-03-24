# ZeroToRepo 🚀

> *Your idea has a GitHub repo before your coffee cools.*

Turn a Notion checkbox click into a fully scaffolded GitHub repository — with competitor research, a labeled issue roadmap, and an investor brief — in under 60 seconds.

## How It Works

```
1. ☑️  Check "Trigger" in your Notion Ideas database
2. 🔍  ZeroToRepo polls, detects the trigger, runs competitor research (Brave + Groq)
3. 🏗️  Creates a private GitHub repo with scaffold files (ghost commit — no git clone)
4. 📋  Generates 7-10 prioritized GitHub Issues as your roadmap
5. 📝  Synthesizes an investor brief from the research + roadmap
6. ✅  Sets Notion status to "Ready" with a link to your new repo
```

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

### 3. Notion Database Setup

Create a Notion database with these exact properties:

| Property | Type | Purpose |
|----------|------|---------|
| `Name` | Title | Project name |
| `Description` | Rich Text | Optional context for the LLM |
| `Status` | Status | Options: `Idea`, `Researching`, `Scaffolding`, `Generating Brief`, `Ready`, `Error` |
| `Trigger` | Checkbox | The start button |
| `GitHub URL` | URL | Auto-populated after repo creation |

Share the database with your Notion integration.

### 4. Run

```bash
# Live mode — polls your Notion database
node src/index.js

# Mock mode — offline demo, no API calls
node src/index.js --mock
```

### 5. Reset (between demos)

```bash
node scripts/reset-db.js
```

## Architecture

```
zerotorepo/
├── src/
│   ├── index.js            # Entry point — polling loop + CLI
│   ├── stateMachine.js     # Phase orchestration + error handling
│   ├── config.js           # Env validation (fail-fast)
│   ├── notion.js           # Notion API helpers
│   ├── research.js         # Brave Search + Groq gap analysis
│   ├── scaffold.js         # GitHub repo + ghost commits + issues
│   ├── roadmap.js          # Groq roadmap generation
│   └── brief.js            # Investor brief synthesis
├── prompts/                # LLM system prompts
├── scripts/                # Utility scripts
├── fixtures/               # Mock data for --mock mode
└── .env.example            # Required API keys template
```

## Pipeline Flow

```
Notion (Trigger) → Research (Brave+Groq) → Scaffold (GitHub) → Roadmap (Groq→Issues) → Brief (Groq→Notion) → Ready ✅
```

Each phase has:
- **Retry logic** for transient errors (429, 5xx)
- **Idempotency** — safe to re-run after crashes
- **Status feedback** — Notion row updates in real-time

## API Costs

| Service | Cost |
|---------|------|
| Groq (Llama-3-70B) | **$0** — Free tier |
| Brave Search | **$0** — Free tier |
| Notion API | **$0** — Free integration |
| GitHub API | **$0** — Free with PAT |
| **Total** | **$0** |

## License

MIT
