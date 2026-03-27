const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

// Load config (validates env vars)
const config = require('./config');
const notion = require('./notion');
const { deepSearch, analyzeGaps, generateStartupName, formatMarketAnalysis } = require('./research');
const { createRepo, ghostCommit, generateScaffoldFiles, createIssues } = require('./scaffold');
const { generateStrategy } = require('./roadmap');
const { synthesizeBrief } = require('./brief');
const { processIdea, PhaseError } = require('./stateMachine');

const server = new McpServer({
  name: 'zerotorepo',
  version: '1.0.0',
  capabilities: {
    tools: {},
  },
});

// --- Tool: Full Pipeline ---
server.tool(
  'process_idea',
  'Run the full ZeroToRepo pipeline: Research → Strategy → Execution → Synthesis. Takes an idea name and optional description, returns a GitHub repo with issues and project brief.',
  {
    idea_name: z.string().describe('The name or title of the business idea'),
    description: z.string().optional().describe('A description of the business idea for better research context'),
  },
  async ({ idea_name, description }) => {
    try {
      const mockPage = {
        id: 'mcp-direct',
        properties: {
          Name: { title: [{ plain_text: idea_name }] },
          Description: { rich_text: description ? [{ plain_text: description }] : [] },
          Status: { status: { name: 'Idea' } },
          Trigger: { checkbox: true },
          'GitHub URL': { url: null },
        },
      };

      const TIMEOUT_MS = 5 * 60 * 1000;
      const work = processIdea(mockPage, {
        useMock: process.env.MOCK === 'true',
        onPhaseStart: (phase) => console.error(`[ZeroToRepo] Starting ${phase}...`),
        onPhaseEnd: (phase, status) => console.error(`[ZeroToRepo] ${phase}: ${status}`),
      });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Pipeline timed out after 5 minutes')), TIMEOUT_MS),
      );

      const result = await Promise.race([work, timeout]);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            projectName: result.projectName,
            repoUrl: result.repoUrl,
            issuesCreated: result.strategy?.tasks?.length || result.roadmap?.issueUrls?.length || 0,
            startupName: result.startupName,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Pipeline failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: Research Only ---
server.tool(
  'research_competitors',
  'Run deep competitive research for a business idea using Brave Search + AI analysis. Returns competitors, gaps, market insights, and tech recommendations.',
  {
    idea_name: z.string().describe('The name of the business idea'),
    description: z.string().optional().describe('A description for better research context'),
  },
  async ({ idea_name, description }) => {
    try {
      const searchSets = await deepSearch(idea_name, description || '');
      const gapData = await analyzeGaps(idea_name, description || '', searchSets);
      const nameData = await generateStartupName(idea_name, description || '', gapData);
      const markdown = formatMarketAnalysis(idea_name, nameData, gapData);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            startupName: nameData,
            research: gapData,
            markdown,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Research failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: Generate Startup Name ---
server.tool(
  'generate_name',
  'Generate a creative startup name for a business idea based on competitive research.',
  {
    idea_name: z.string().describe('The business idea name'),
    description: z.string().optional().describe('Description of the idea'),
    competitors: z.string().optional().describe('Comma-separated list of competitor names'),
  },
  async ({ idea_name, description, competitors }) => {
    try {
      const gapData = {
        competitors: (competitors || '').split(',').map((c) => ({ name: c.trim() })),
        gaps: [],
      };
      const nameData = await generateStartupName(idea_name, description || '', gapData);
      return {
        content: [{ type: 'text', text: JSON.stringify(nameData, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Name generation failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: Scaffold Repository ---
server.tool(
  'scaffold_repo',
  'Create a private GitHub repository with scaffold files (README, package.json, .gitignore, src/index.js) using ghost commits (no local git clone).',
  {
    project_name: z.string().describe('Name for the GitHub repository'),
    description: z.string().optional().describe('Project description'),
  },
  async ({ project_name, description }) => {
    try {
      const repoInfo = await createRepo(project_name);
      const files = generateScaffoldFiles(project_name, description || '', null, null);
      await ghostCommit(repoInfo.owner, repoInfo.repo, files);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            repoUrl: repoInfo.repoUrl,
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            filesCreated: files.map((f) => f.path),
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Scaffold failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: Generate Roadmap ---
server.tool(
  'generate_roadmap',
  'Generate a 4-week gap-targeting strategy from competitive research and create GitHub issues for the tasks.',
  {
    project_name: z.string().describe('Project name'),
    description: z.string().optional().describe('Project description'),
    repo_owner: z.string().describe('GitHub repo owner'),
    repo_name: z.string().describe('GitHub repo name'),
    gaps: z.string().optional().describe('JSON string of competitive gaps from research'),
  },
  async ({ project_name, description, repo_owner, repo_name, gaps }) => {
    try {
      let gapData = { gaps: [], competitors: [], techRecommendations: [] };
      if (gaps) {
        try { gapData = JSON.parse(gaps); } catch { /* use defaults */ }
      }
      const { tasks } = await generateStrategy(project_name, description || '', gapData);
      const issueUrls = await createIssues(repo_owner, repo_name, tasks);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ tasks, issueUrls }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Roadmap failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: Generate Brief ---
server.tool(
  'generate_brief',
  'Generate a Project Brief synthesizing research findings, roadmap rationale, repo link, and issues.',
  {
    project_name: z.string().describe('Project or startup name'),
    description: z.string().optional().describe('Project description'),
    research: z.string().optional().describe('JSON string of research data (competitors, gaps)'),
    roadmap: z.string().optional().describe('JSON string of roadmap tasks'),
  },
  async ({ project_name, description, research, roadmap }) => {
    try {
      let gapData = { gaps: [], competitors: [] };
      let roadmapData = { tasks: [] };
      if (research) { try { gapData = JSON.parse(research); } catch { /* defaults */ } }
      if (roadmap) { try { roadmapData = JSON.parse(roadmap); } catch { /* defaults */ } }

      const { briefContent } = await synthesizeBrief(
        project_name,
        null,
        description || '',
        gapData,
        roadmapData,
        null,
        [],
        new Date().toISOString()
      );
      return {
        content: [{ type: 'text', text: briefContent }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Brief failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: List Notion Ideas ---
server.tool(
  'list_notion_ideas',
  'List all ideas in the Notion database with their current status.',
  {},
  async () => {
    try {
      const mcpClient = require('./mcp-client');
      const response = await mcpClient.callTool('API-query-data-source', {
        data_source_id: config.notion.databaseId,
        page_size: 20,
      });
      const ideas = (response.results || []).map((p) => ({
        id: p.id,
        name: notion.extractTitle(p),
        status: p.properties.Status?.status?.name || 'Unknown',
        triggered: p.properties.Trigger?.checkbox || false,
        githubUrl: p.properties['GitHub URL']?.url || null,
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(ideas, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed to list ideas: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Start Server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 ZeroToRepo MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
