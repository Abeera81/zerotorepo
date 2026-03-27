const config = require('./config');
const Groq = require('groq-sdk');
const notion = require('./notion');
const { deepSearch, analyzeGaps, generateStartupName, formatMarketAnalysis, getFallbackResearch } = require('./research');
const { createRepo, ghostCommit, generateScaffoldFiles, createIssues } = require('./scaffold');
const { generateStrategy, formatStrategyMarkdown } = require('./roadmap');
const { synthesizeBrief } = require('./brief');

const groq = new Groq({ apiKey: config.groq.apiKey });

// Registry of tools the agent can call — organized by phase
const TOOL_REGISTRY = {
  // --- Phase 1: Research ---
  deep_search: {
    description: 'Run 5-8 Brave searches to gather competitive intelligence. Returns fallback data if searches fail.',
    parameters: { idea_name: 'string', description: 'string' },
    fn: async ({ idea_name, description }) => {
      try {
        const searchSets = await deepSearch(idea_name, description || '');
        return { searchSets, totalResults: searchSets.reduce((s, q) => s + q.results.length, 0) };
      } catch (err) {
        console.warn(`  [Research] Search failed, using fallback: ${err.message}`);
        return { searchSets: [], totalResults: 0, fallback: true };
      }
    },
  },
  analyze_market: {
    description: 'Analyze search results with AI to identify competitors, gaps, and market insights. Uses fallback data if no search results available.',
    parameters: { idea_name: 'string', description: 'string', search_data: 'object' },
    fn: async ({ idea_name, description, search_data }) => {
      if (!search_data || search_data.length === 0) {
        return getFallbackResearch(idea_name);
      }
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
  save_market_analysis: {
    description: 'Save the "Market Analysis" to Notion with competitors, positioning, weaknesses, and Gap Opportunity.',
    parameters: { page_id: 'string', project_name: 'string', startup_name: 'object', research: 'object' },
    fn: async ({ page_id, project_name, startup_name, research }) => {
      const markdown = formatMarketAnalysis(project_name, startup_name, research);
      if (page_id !== 'mock') {
        await notion.writeSubPage(page_id, 'Market Analysis', markdown);
      }
      return { saved: true };
    },
  },

  // --- Phase 2: Strategy ---
  generate_strategy: {
    description: 'Generate a 4-week roadmap targeting competitive gaps identified in Phase 1 research.',
    parameters: { project_name: 'string', description: 'string', research: 'object' },
    fn: async ({ project_name, description, research }) => {
      return await generateStrategy(project_name, description || '', research);
    },
  },
  save_strategy_to_notion: {
    description: 'Save the "Strategy & Roadmap" with all tasks to a Notion sub-page.',
    parameters: { page_id: 'string', project_name: 'string', strategy: 'object' },
    fn: async ({ page_id, project_name, strategy }) => {
      const markdown = formatStrategyMarkdown(project_name, strategy);
      if (page_id !== 'mock') {
        await notion.writeSubPage(page_id, 'Strategy & Roadmap', markdown);
      }
      return { saved: true };
    },
  },

  // --- Phase 3: Execution ---
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
  create_github_issues: {
    description: 'Create GitHub issues from the strategy roadmap tasks. Each issue includes the gap it addresses.',
    parameters: { repo_owner: 'string', repo_name: 'string', tasks: 'array' },
    fn: async ({ repo_owner, repo_name, tasks }) => {
      // Enrich task descriptions with gap reference for traceability
      const enrichedTasks = (tasks || []).map((t) => ({
        ...t,
        description: `${t.description}\n\n---\n**Gap Addressed:** ${t.gap_addressed || 'General'}\n**Week:** ${t.week || 'TBD'}\n**Owner:** ${t.owner || 'TBD'}`,
      }));
      const issueUrls = await createIssues(repo_owner, repo_name, enrichedTasks);
      return { issueUrls };
    },
  },

  // --- Phase 4: Synthesis ---
  write_project_brief: {
    description: 'Write a Project Brief to Notion synthesizing competitors, gaps, roadmap rationale, GitHub link, issues, and timestamp.',
    parameters: { project_name: 'string', description: 'string', startup_name: 'object', research: 'object', strategy: 'object', repo_url: 'string', notion_page_id: 'string' },
    fn: async ({ project_name, description, startup_name, research, strategy, repo_url, notion_page_id }) => {
      const displayName = startup_name?.name || project_name;
      const timestamp = new Date().toISOString();
      const { briefContent } = await synthesizeBrief(
        displayName, startup_name, description || '', research, strategy,
        repo_url || 'N/A', [], timestamp
      );
      if (notion_page_id !== 'mock') {
        await notion.writeSubPage(notion_page_id, `Project Brief — ${displayName}`, briefContent);
      }
      return { briefContent, timestamp };
    },
  },

  // --- Shared ---
  update_notion_status: {
    description: 'Update the Notion page status to track pipeline progress.',
    parameters: { page_id: 'string', status: 'string' },
    fn: async ({ page_id, status }) => {
      if (page_id !== 'mock') {
        await notion.updateStatus(page_id, status);
      }
      return { updated: true, status };
    },
  },
  finalize_idea: {
    description: 'Mark the idea as Done and uncheck the trigger in Notion.',
    parameters: { page_id: 'string' },
    fn: async ({ page_id }) => {
      if (page_id !== 'mock') {
        await notion.updateStatus(page_id, 'Done');
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
    save_market_analysis: {
      type: 'object',
      properties: {
        page_id: { type: 'string' },
        project_name: { type: 'string' },
      },
      required: ['page_id', 'project_name'],
    },
    generate_strategy: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['project_name'],
    },
    save_strategy_to_notion: {
      type: 'object',
      properties: {
        page_id: { type: 'string' },
        project_name: { type: 'string' },
      },
      required: ['page_id', 'project_name'],
    },
    create_github_repo: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Name for the GitHub repository' },
        description: { type: 'string' },
      },
      required: ['project_name'],
    },
    set_github_url: {
      type: 'object',
      properties: {
        page_id: { type: 'string' },
        url: { type: 'string', description: 'The GitHub repository URL' },
      },
      required: ['page_id', 'url'],
    },
    create_github_issues: {
      type: 'object',
      properties: {
        repo_owner: { type: 'string', description: 'GitHub repo owner' },
        repo_name: { type: 'string', description: 'GitHub repo name' },
      },
      required: ['repo_owner', 'repo_name'],
    },
    write_project_brief: {
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
        status: { type: 'string', enum: ['Researching', 'Planning', 'Building', 'Done', 'Error'] },
      },
      required: ['page_id', 'status'],
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

const ORCHESTRATOR_SYSTEM_PROMPT = `You are an AI agent orchestrating the ZeroToRepo pipeline. Your job is to take a business idea through 4 phases: Research → Strategy → Execution → Synthesis.

WORKFLOW (follow this exact order):

Phase 1 — Research (🔍 Researching):
1. update_notion_status → "Researching"
2. deep_search — gather competitive intelligence
3. analyze_market — identify competitors, gaps, market insights
4. generate_startup_name — creative name from research
5. save_market_analysis — write "Market Analysis" to Notion

Phase 2 — Strategy (📋 Planning):
6. update_notion_status → "Planning"
7. generate_strategy — 4-week roadmap targeting competitive gaps
8. save_strategy_to_notion — write "Strategy & Roadmap" to Notion

Phase 3 — Execution (⚙️ Building):
9. update_notion_status → "Building"
10. create_github_repo — private repo with scaffold files
11. set_github_url — store repo URL in Notion
12. create_github_issues — create issues from roadmap tasks

Phase 4 — Synthesis (✅ Done):
13. write_project_brief — synthesize everything into a Project Brief on Notion
14. finalize_idea — mark as Done

RULES:
- Call ONE tool at a time. Wait for the result before calling the next.
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
  const MAX_ITERATIONS = 18;

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
      if (['create_github_repo', 'save_market_analysis', 'write_project_brief', 'generate_strategy'].includes(toolName) && context.research) {
        args.research = args.research || context.research;
      }
      if (['create_github_repo', 'write_project_brief', 'save_market_analysis'].includes(toolName) && context.startupName) {
        args.startup_name = args.startup_name || context.startupName;
      }
      if (toolName === 'write_project_brief') {
        if (context.strategy) args.strategy = args.strategy || context.strategy;
        if (context.repo) args.repo_url = args.repo_url || context.repo.repoUrl;
      }
      if (toolName === 'save_strategy_to_notion' && context.strategy) {
        args.strategy = args.strategy || context.strategy;
      }
      if (toolName === 'create_github_issues') {
        if (context.repo) {
          args.repo_owner = args.repo_owner || context.repo.owner;
          args.repo_name = args.repo_name || context.repo.repo;
        }
        if (context.strategy) {
          args.tasks = args.tasks || context.strategy.tasks;
        }
      }

      // Report phase for CLI UX
      const phaseMap = {
        deep_search: 'Research', analyze_market: 'Research',
        generate_startup_name: 'Research', save_market_analysis: 'Research',
        generate_strategy: 'Strategy', save_strategy_to_notion: 'Strategy',
        create_github_repo: 'Execution', set_github_url: 'Execution',
        create_github_issues: 'Execution',
        write_project_brief: 'Synthesis', finalize_idea: 'Synthesis',
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
        if (toolName === 'generate_strategy') context.strategy = result;
        if (toolName === 'create_github_issues') context.issueUrls = result.issueUrls;

        // End phase reporting
        if (toolName === 'save_market_analysis') onPhaseEnd?.('Research', 'done');
        if (toolName === 'save_strategy_to_notion') onPhaseEnd?.('Strategy', 'done');
        if (toolName === 'create_github_issues') onPhaseEnd?.('Execution', 'done');
        if (toolName === 'finalize_idea') onPhaseEnd?.('Synthesis', 'done');

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
        ...(result.fallback && { fallback: true }),
        ...(result.competitors && { competitorCount: result.competitors.length }),
        ...(result.gaps && { gapCount: result.gaps.length }),
        ...(result.strategy_summary && { strategy_summary: result.strategy_summary }),
        ...(result.tasks && { taskCount: result.tasks.length }),
        ...(result.issueUrls && { issueCount: result.issueUrls.length }),
        ...(result.updated && { updated: true }),
        ...(result.saved && { saved: true }),
        ...(result.set && { set: true }),
        ...(result.finalized && { finalized: true }),
        ...(result.timestamp && { timestamp: result.timestamp }),
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
    strategy: context.strategy,
    issueUrls: context.issueUrls,
  };
}

module.exports = { runAgent, TOOL_REGISTRY };
