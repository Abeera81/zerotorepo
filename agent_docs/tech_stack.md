# Tech Stack & Tools

## Runtime
- **Node.js v20+** — Native async/await, excellent JSON handling, fast startup

## Core Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `@notionhq/client` | latest | Notion API SDK — polling, status updates, sub-page creation |
| `@octokit/rest` | latest | GitHub API SDK — repo creation, ghost commits, issue management |
| `groq-sdk` | latest | Groq API client — LLM inference with Llama-3-70B |
| `dotenv` | latest | Load `.env` secrets at startup |
| `@clack/prompts` | latest | Beautiful CLI spinners and progress for live demo |

## AI Layer
- **Model:** Groq + `llama-3-70b-8192`
- **Speed:** ~500 tokens/second (fastest free inference)
- **Free Tier:** 30 RPM, 14,400 tokens/day, 6,000 tokens/min
- **Temperature Settings:**
  - Gap Analysis: `0.3` (factual)
  - Roadmap: `0.4` (structured)
  - Investor Brief: `0.6` (creative)

## Search
- **Brave Search API** — Developer-friendly JSON, 2K free queries/month
- **Endpoint:** `GET https://api.search.brave.com/res/v1/web/search`
- **Auth:** `X-Subscription-Token` header

## Git Integration
- **Octokit (`@octokit/rest`)** — Official GitHub SDK
- **Ghost Commit Technique** (no local git clone):
  1. GET current SHA from `refs/heads/main`
  2. GET tree SHA from commit
  3. POST blobs for each file
  4. POST new tree with all blobs
  5. POST new commit pointing to tree
  6. PATCH ref to fast-forward main

## Config
- **dotenv** — Standard `.env` pattern for secrets
- **Required env vars:** `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `GROQ_API_KEY`, `BRAVE_API_KEY`, `GITHUB_TOKEN`, `GITHUB_OWNER`

## Setup Commands
```bash
# Initialize project
npm init -y

# Install all dependencies
npm install @notionhq/client @octokit/rest groq-sdk dotenv @clack/prompts

# Run the pipeline
node src/index.js

# Run in mock mode (offline demo)
node src/index.js --mock

# Reset Notion DB for re-demo
node scripts/reset-db.js
```

## Error Handling Pattern
```javascript
// Canonical error handling — wrap every external API call in runPhase
async function runPhase(phaseName, fn) {
  const MAX_RETRIES = 1;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isTransient = err.status === 429 || (err.status >= 500 && err.status < 600);
      if (isTransient && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[${phaseName}] Transient error (${err.status}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new PhaseError(phaseName, err);
    }
  }
}
```

## Project Structure
```
zerotorepo/
├── src/
│   ├── index.js            # Entry point — polling loop + CLI output
│   ├── stateMachine.js     # State transitions & phase orchestration
│   ├── notion.js           # Notion API helpers (poll, update, write)
│   ├── research.js         # Brave Search + Groq gap analysis
│   ├── scaffold.js         # GitHub repo creation + ghost commits
│   ├── roadmap.js          # Groq roadmap generation + issue creation
│   ├── brief.js            # Investor brief synthesis
│   └── config.js           # Environment config validation
├── prompts/
│   ├── gap-analysis.txt    # System prompt for competitor gap analysis
│   ├── roadmap.txt         # System prompt for task roadmap generation
│   └── brief.txt           # System prompt for investor brief synthesis
├── .env.example            # Template with all required keys
├── .gitignore
├── package.json
└── README.md
```

## Naming Conventions
- **Files:** camelCase (`stateMachine.js`, `notion.js`)
- **Functions:** camelCase (`pollForTrigger`, `ghostCommit`)
- **Classes/Errors:** PascalCase (`PhaseError`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_RETRIES`, `REQUIRED`)
- **Config keys:** Nested objects (`config.notion.apiKey`, `config.groq.model`)
