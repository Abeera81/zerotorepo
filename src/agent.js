const config = require('./config');
const Groq = require('groq-sdk');
const notion = require('./notion');
const { deepSearch, analyzeGaps, generateStartupName, formatResearchMarkdown } = require('./research');
const { createRepo, ghostCommit, generateScaffoldFiles, createIssues } = require('./scaffold');
const { generateRoadmap } = require('./roadmap');
const { synthesizeBrief } = require('./brief');

const groq = new Groq({ apiKey: config.groq.apiKey });

// Registry of tools the agent can call
const TOOL_REGISTRY = {
  deep_search: {
    description: 'Run 5-8 Brave searches to gather competitive intelligence about a business idea.',
    parameters: { idea_name: 'string', description: 'string' },
    fn: async ({ idea_name, description }) => {
      const searchSets = await deepSearch(idea_name, description || '');
      return { searchSets, totalResults: searchSets.reduce((s, q) => s + q.results.length, 0) };
    },
  },
  analyze_market: {
    description: 'Analyze search results with AI to identify competitors, gaps, market insights, and tech recommendations.',
    parameters: { idea_name: 'string', description: 'string', search_data: 'object' },
    fn: async ({ idea_name, description, search_data }) => {
      return await analyzeGaps(idea_name, description || '', search_data);
    },
  },
  generate_startup_name: {
    description: 'Generate a creative startup name based on the idea and competitive research.',
    parameters: { idea_name: 'string', description: 'string', research: 'object' },
    fn: async ({ idea_name, description, research }) => {
      return await generateStartupName(idea_name, description || '', research);
    },
  },
  create_github_repo: {
    description: 'Create a private GitHub repository with scaffold files including a rich README with research findings.',
    parameters: { project_name: 'string', description: 'string', research: 'object', startup_name: 'object' },
    fn: async ({ project_name, description, research, startup_name }) => {
      const repoInfo = await createRepo(project_name);
      const files = generateScaffoldFiles(project_name, description || '', research, startup_name);
      await ghostCommit(repoInfo.owner, repoInfo.repo, files);
      return repoInfo;
    },
  },
  create_roadmap_issues: {
    description: 'Generate a development roadmap of 7-10 tasks and create GitHub issues for each.',
    parameters: { project_name: 'string', description: 'string', research: 'object', repo_owner: 'string', repo_name: 'string' },
    fn: async ({ project_name, description, research, repo_owner, repo_name }) => {
      const { tasks } = await generateRoadmap(project_name, description || '', research);
      const issueUrls = await createIssues(repo_owner, repo_name, tasks);
      return { tasks, issueUrls };
    },
  },
  write_investor_brief: {
    description: 'Synthesize a 1-page investor brief from research and roadmap, then save it to Notion.',
    parameters: { project_name: 'string', description: 'string', startup_name: 'object', research: 'object', roadmap: 'object', notion_page_id: 'string' },
    fn: async ({ project_name, description, startup_name, research, roadmap, notion_page_id }) => {
      const displayName = startup_name?.name || project_name;
      const { briefContent } = await synthesizeBrief(displayName, startup_name, description || '', research, roadmap);
      if (notion_page_id !== 'mock') {
        await notion.writeSubPage(notion_page_id, `Brief — ${displayName}`, briefContent);
      }
      return { briefContent };
    },
  },
  update_notion_status: {
    description: 'Update the status of an idea in Notion (e.g., Researching, Scaffolding, Ready, Error).',
    parameters: { page_id: 'string', status: 'string' },
    fn: async ({ page_id, status }) => {
      if (page_id !== 'mock') {
        await notion.updateStatus(page_id, status);
      }
      return { updated: true, status };
    },
  },
  save_research_to_notion: {
    description: 'Save the research findings as a sub-page in Notion.',
    parameters: { page_id: 'string', project_name: 'string', startup_name: 'object', research: 'object' },
    fn: async ({ page_id, project_name, startup_name, research }) => {
      const markdown = formatResearchMarkdown(project_name, startup_name, research);
      if (page_id !== 'mock') {
        await notion.writeSubPage(page_id, `Research — ${project_name}`, markdown);
      }
      return { saved: true };
    },
  },
  set_github_url: {
    description: 'Set the GitHub repository URL on the Notion page.',
    parameters: { page_id: 'string', url: 'string' },
    fn: async ({ page_id, url }) => {
      if (page_id !== 'mock') {
        await notion.setGitHubUrl(page_id, url);
      }
      return { set: true };
    },
  },
  finalize_idea: {
    description: 'Mark the idea as Ready and uncheck the trigger in Notion.',
    parameters: { page_id: 'string' },
    fn: async ({ page_id }) => {
      if (page_id !== 'mock') {
        await notion.updateStatus(page_id, 'Ready');
        await notion.resetTrigger(page_id);
      }
      return { finalized: true };
    },
  },
};

// Build the tools array for Groq function calling with proper JSON schemas
function buildToolsForLLM() {
  const schemas = {
    deep_search: {
      type: 'object',
      properties: {
        idea_name: { type: 'string', description: 'The business idea name' },
        description: { type: 'string', description: 'Business idea description' },
      },
      required: ['idea_name'],
    },
    analyze_market: {
      type: 'object',
      properties: {
        idea_name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['idea_name'],
    },
    generate_startup_name: {
      type: 'object',
      properties: {
        idea_name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['idea_name'],
    },
    create_github_repo: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Name for the GitHub repository' },
        description: { type: 'string' },
      },
      required: ['project_name'],
    },
    create_roadmap_issues: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        description: { type: 'string' },
        repo_owner: { type: 'string', description: 'GitHub repo owner' },
        repo_name: { type: 'string', description: 'GitHub repo name' },
      },
      required: ['project_name', 'repo_owner', 'repo_name'],
    },
    write_investor_brief: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        description: { type: 'string' },
        notion_page_id: { type: 'string' },
      },
      required: ['project_name', 'notion_page_id'],
    },
    update_notion_status: {
      type: 'object',
      properties: {
        page_id: { type: 'string' },
        status: { type: 'string', enum: ['Researching', 'Scaffolding', 'Generating Brief', 'Ready', 'Error'] },
      },
      required: ['page_id', 'status'],
    },
    save_research_to_notion: {
      type: 'object',
      properties: {
        page_id: { type: 'string' },
        project_name: { type: 'string' },
      },
      required: ['page_id', 'project_name'],
    },
    set_github_url: {
      type: 'object',
      properties: {
        page_id: { type: 'string' },
        url: { type: 'string', description: 'The GitHub repository URL' },
      },
      required: ['page_id', 'url'],
    },
    finalize_idea: {
      type: 'object',
      properties: {
        page_id: { type: 'string' },
      },
      required: ['page_id'],
    },
  };

  return Object.entries(TOOL_REGISTRY).map(([name, tool]) => ({
    type: 'function',
    function: {
      name,
      description: tool.description,
      parameters: schemas[name],
    },
  }));
}

const ORCHESTRATOR_SYSTEM_PROMPT = `You are an AI agent orchestrating the ZeroToRepo pipeline. Your job is to take a business idea and turn it into a fully scaffolded GitHub repository with research, issues, and an investor brief.

You have access to tools that interact with Notion (via MCP), GitHub, Brave Search, and Groq AI. Call them in the right order to build the complete project.

WORKFLOW (follow this exact order):
1. update_notion_status → "Researching"
2. deep_search
3. analyze_market
4. generate_startup_name
5. save_research_to_notion
6. update_notion_status → "Scaffolding"
7. create_github_repo
8. set_github_url
9. create_roadmap_issues
10. update_notion_status → "Generating Brief"
11. write_investor_brief
12. finalize_idea

RULES:
- Call ONE tool at a time. Wait for the result.
- Data flows automatically between tools — just call the next tool in sequence.
- If a tool fails, skip it and continue with the next step.
- Keep responses very short. Just call the next tool.
- After finalize_idea, respond with "Pipeline complete." and stop.`;

// Keep message history bounded to avoid token explosion
function trimMessages(messages, maxTail) {
  if (messages.length <= maxTail + 2) return messages;
  // Always keep: system prompt (0) + user prompt (1) + last N messages
  const head = messages.slice(0, 2);
  const tail = messages.slice(-maxTail);
  // Ensure we don't break tool_call / tool result pairs
  // If tail starts with a 'tool' message, include the assistant message before it
  if (tail[0]?.role === 'tool') {
    const idx = messages.length - maxTail - 1;
    if (idx >= 2 && messages[idx]?.role === 'assistant') {
      return [...head, messages[idx], ...tail];
    }
  }
  return [...head, ...tail];
}

/**
 * Run the LLM-driven agent loop.
 * The LLM decides which tools to call and in what order.
 */
async function runAgent(ideaName, description, notionPageId, { onPhaseStart, onPhaseEnd, useMock = false } = {}) {
  const tools = buildToolsForLLM();
  const messages = [
    { role: 'system', content: ORCHESTRATOR_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Process this business idea:\n\nIdea: ${ideaName}\nDescription: ${description || 'No description provided'}\nNotion Page ID: ${useMock ? 'mock' : notionPageId}\n\nStart by updating the Notion status, then proceed through the full pipeline.`,
    },
  ];

  const context = {}; // Shared state between tool calls
  let iterations = 0;
  const MAX_ITERATIONS = 15;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Trim message history to control token usage:
    // Keep system prompt + user prompt + last 4 exchanges (8 messages)
    const trimmedMessages = trimMessages(messages, 10);

    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      temperature: 0,
      max_tokens: 1024,
      tools,
      tool_choice: 'auto',
      messages: trimmedMessages,
    });

    const choice = completion.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // If the LLM is done (no more tool calls), break
    if (choice.finish_reason === 'stop' || !assistantMessage.tool_calls?.length) {
      break;
    }

    // Execute each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const tool = TOOL_REGISTRY[toolName];

      if (!tool) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
        });
        continue;
      }

      // Parse arguments
      let args;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: 'Invalid JSON arguments' }),
        });
        continue;
      }

      // Inject context data that the LLM can't pass as JSON (large objects)
      if (toolName === 'analyze_market' && context.searchSets) {
        args.search_data = context.searchSets;
      }
      if (toolName === 'generate_startup_name' && context.research) {
        args.research = context.research;
      }
      if (['create_github_repo', 'create_roadmap_issues', 'save_research_to_notion', 'write_investor_brief'].includes(toolName) && context.research) {
        args.research = args.research || context.research;
      }
      if (['create_github_repo', 'write_investor_brief', 'save_research_to_notion'].includes(toolName) && context.startupName) {
        args.startup_name = args.startup_name || context.startupName;
      }
      if (toolName === 'write_investor_brief' && context.roadmap) {
        args.roadmap = args.roadmap || context.roadmap;
      }
      if (toolName === 'create_roadmap_issues' && context.repo) {
        args.repo_owner = args.repo_owner || context.repo.owner;
        args.repo_name = args.repo_name || context.repo.repo;
      }

      // Report phase for CLI UX
      const phaseMap = {
        deep_search: 'Research', analyze_market: 'Research',
        generate_startup_name: 'Research', save_research_to_notion: 'Research',
        create_github_repo: 'Scaffold', set_github_url: 'Scaffold',
        create_roadmap_issues: 'Roadmap',
        write_investor_brief: 'Brief', finalize_idea: 'Brief',
      };
      const phase = phaseMap[toolName];
      if (phase && !context[`phase_${phase}_started`]) {
        onPhaseStart?.(phase);
        context[`phase_${phase}_started`] = true;
      }

      // Execute the tool
      let result;
      try {
        console.log(`  [Agent] → ${toolName}(${Object.keys(args).join(', ')})`);
        result = await tool.fn(args);
        console.log(`  [Agent] ✓ ${toolName} succeeded`);

        // Store results in context for later tool calls
        if (toolName === 'deep_search') context.searchSets = result.searchSets;
        if (toolName === 'analyze_market') context.research = result;
        if (toolName === 'generate_startup_name') context.startupName = result;
        if (toolName === 'create_github_repo') context.repo = result;
        if (toolName === 'create_roadmap_issues') context.roadmap = result;

        // End phase reporting
        if (toolName === 'save_research_to_notion') onPhaseEnd?.('Research', 'done');
        if (toolName === 'set_github_url') onPhaseEnd?.('Scaffold', 'done');
        if (toolName === 'create_roadmap_issues') onPhaseEnd?.('Roadmap', 'done');
        if (toolName === 'finalize_idea') onPhaseEnd?.('Brief', 'done');

      } catch (err) {
        console.log(`  [Agent] ✗ ${toolName} failed: ${err.message}`);
        result = { error: err.message };
      }

      // Send result back to LLM (summarize to save tokens)
      const summary = {
        success: !result.error,
        ...(result.error && { error: result.error }),
        ...(result.repoUrl && { repoUrl: result.repoUrl }),
        ...(result.owner && { owner: result.owner }),
        ...(result.repo && { repo: result.repo }),
        ...(result.name && { name: result.name }),
        ...(result.tagline && { tagline: result.tagline }),
        ...(result.totalResults !== undefined && { totalResults: result.totalResults }),
        ...(result.competitors && { competitorCount: result.competitors.length }),
        ...(result.gaps && { gapCount: result.gaps.length }),
        ...(result.tasks && { taskCount: result.tasks.length }),
        ...(result.issueUrls && { issueCount: result.issueUrls.length }),
        ...(result.updated && { updated: true }),
        ...(result.saved && { saved: true }),
        ...(result.set && { set: true }),
        ...(result.finalized && { finalized: true }),
      };

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(summary),
      });
    }
  }

  return {
    projectName: context.startupName?.name || ideaName,
    repoUrl: context.repo?.repoUrl,
    startupName: context.startupName,
    research: context.research,
    roadmap: context.roadmap,
  };
}

module.exports = { runAgent, TOOL_REGISTRY };
