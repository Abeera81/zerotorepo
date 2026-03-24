# Essential Resources

## API Documentation
| Service | Docs URL | Key Info |
|---------|----------|----------|
| **Notion API** | https://developers.notion.com | Database queries, page creation, property updates |
| **GitHub REST API** | https://docs.github.com/en/rest | Repo creation, Git Data API (ghost commits), Issues |
| **Groq API** | https://console.groq.com/docs | Chat completions, JSON mode, model parameters |
| **Brave Search API** | https://api.search.brave.com/app/#/documentation | Web search endpoint, result schema |

## SDK References
| Package | Docs |
|---------|------|
| `@notionhq/client` | https://github.com/makenotion/notion-sdk-js |
| `@octokit/rest` | https://octokit.github.io/rest.js |
| `groq-sdk` | https://github.com/groq/groq-typescript |
| `@clack/prompts` | https://github.com/bombshell-dev/clack |

## Curated Repositories
| Repository | Purpose |
|------------|---------|
| **PatrickJS/awesome-cursorrules** | Anti-vibe rule templates |
| **OneRedOak/claude-code-workflows** | Review workflow packs |
| **matebenyovszky/healing-agent** | Self-healing Python patterns |
| **modelcontextprotocol/servers** | MCP server implementations |

## Key Concepts
- **Ghost Commits:** Using GitHub's Git Data API to create commits without cloning — see Tech Design §5.4
- **MCP (Model Context Protocol):** Used during development to accelerate API integration — see Tech Design §9
- **State Machine Pattern:** Idea → Researching → Scaffolding → Generating Brief → Ready — see Tech Design §2.3

## MCP Servers (for development acceleration)
| MCP Server | Usage |
|------------|-------|
| **Notion MCP** | Introspect DB schema, validate property types, test page updates |
| **Brave MCP** | Test and refine search queries interactively |
| **GitHub MCP** | Validate repo creation, file commits, issue generation |
