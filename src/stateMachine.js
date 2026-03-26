const notion = require('./notion');
const { deepSearch, analyzeGaps, generateStartupName, formatResearchMarkdown } = require('./research');
const { createRepo, ghostCommit, generateScaffoldFiles, createIssues } = require('./scaffold');
const { generateRoadmap } = require('./roadmap');
const { synthesizeBrief } = require('./brief');

class PhaseError extends Error {
  constructor(phase, cause) {
    super(`Pipeline failed at phase "${phase}": ${cause.message}`);
    this.phase = phase;
    this.cause = cause;
    this.status = cause.status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wrap a phase function with retry logic for transient errors.
 */
async function runPhase(phaseName, fn) {
  const MAX_RETRIES = 1;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isTransient = err.status === 429 || (err.status >= 500 && err.status < 600);
      if (isTransient && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[${phaseName}] Transient error (${err.status}), retrying in ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }
      throw new PhaseError(phaseName, err);
    }
  }
}

/**
 * Process a single Notion idea through all four phases.
 */
async function processIdea(page, { onPhaseStart, onPhaseEnd, useMock = false } = {}) {
  const pageId = page.id;
  const projectName = notion.extractTitle(page);
  const description = notion.extractDescription(page);

  const mockDelay = () => useMock ? sleep(1500) : Promise.resolve();

  // Phase 1: Research (deep multi-query + name generation)
  onPhaseStart?.('Research');
  if (!useMock) await notion.updateStatus(pageId, 'Researching');
  const { research, startupName } = await runPhase('Research', async () => {
    if (useMock) { await mockDelay(); return { research: getMockResearch(projectName), startupName: getMockName(projectName) }; }

    // Idempotency: skip if research sub-page already exists
    if (await notion.subPageExists(pageId, `Research — ${projectName}`)) {
      onPhaseEnd?.('Research', 'skipped (already exists)');
      return {
        research: { gaps: [], summary: 'Research already completed.' },
        startupName: { name: projectName, tagline: description },
      };
    }

    // Deep search: 5 queries across different angles
    const searchSets = await deepSearch(projectName, description);

    // Deep analysis: competitors, gaps, market insights, tech recommendations
    const gapData = await analyzeGaps(projectName, description, searchSets);

    // Generate a catchy startup name from the research
    const nameData = await generateStartupName(projectName, description, gapData);

    // Write rich research to Notion
    const markdown = formatResearchMarkdown(projectName, nameData, gapData);
    await notion.writeSubPage(pageId, `Research — ${projectName}`, markdown);

    return { research: gapData, startupName: nameData };
  });
  onPhaseEnd?.('Research', 'done');

  // Phase 2: Scaffold (uses startup name + rich research for README)
  onPhaseStart?.('Scaffold');
  if (!useMock) await notion.updateStatus(pageId, 'Scaffolding');
  const displayName = startupName?.name || projectName;
  const repo = await runPhase('Scaffold', async () => {
    if (useMock) { await mockDelay(); return getMockScaffold(displayName); }

    // Idempotency: skip if GitHub URL already set
    const existingUrl = page.properties['GitHub URL']?.url;
    if (existingUrl) {
      onPhaseEnd?.('Scaffold', 'skipped (repo exists)');
      const parts = existingUrl.replace('https://github.com/', '').split('/');
      return { repoUrl: existingUrl, owner: parts[0], repo: parts[1] };
    }

    const repoInfo = await createRepo(displayName);
    const files = generateScaffoldFiles(displayName, description, research, startupName);
    await ghostCommit(repoInfo.owner, repoInfo.repo, files);
    await notion.setGitHubUrl(pageId, repoInfo.repoUrl);
    return repoInfo;
  });
  onPhaseEnd?.('Scaffold', 'done');

  // Phase 3: Roadmap → Issues (uses richer context, excludes boilerplate tasks)
  onPhaseStart?.('Roadmap');
  const roadmap = await runPhase('Roadmap', async () => {
    if (useMock) { await mockDelay(); return getMockRoadmap(displayName); }

    const { tasks } = await generateRoadmap(displayName, description, research);
    const issueUrls = await createIssues(repo.owner, repo.repo, tasks);
    return { tasks, issueUrls };
  });
  onPhaseEnd?.('Roadmap', 'done');

  // Phase 4: Brief (uses startup name + richer research)
  onPhaseStart?.('Brief');
  if (!useMock) await notion.updateStatus(pageId, 'Generating Brief');
  const brief = await runPhase('Brief', async () => {
    if (useMock) { await mockDelay(); return getMockBrief(displayName); }

    // Idempotency: skip if brief sub-page already exists
    if (await notion.subPageExists(pageId, `Brief — ${displayName}`)) {
      onPhaseEnd?.('Brief', 'skipped (already exists)');
      return { briefContent: 'Brief already exists.' };
    }

    const { briefContent } = await synthesizeBrief(displayName, startupName, description, research, roadmap);
    await notion.writeSubPage(pageId, `Brief — ${displayName}`, briefContent);
    return { briefContent };
  });
  onPhaseEnd?.('Brief', 'done');

  // Done!
  if (!useMock) {
    await notion.updateStatus(pageId, 'Ready');
    await notion.resetTrigger(pageId);
  }

  return { projectName: displayName, repoUrl: repo.repoUrl, research, startupName, roadmap, brief };
}

// --- Mock data for --mock mode ---

function getMockResearch(projectName) {
  return {
    competitors: [
      { name: 'CompetitorA', url: 'https://competitora.com', strengths: ['Established brand', 'Large user base'], weaknesses: ['Slow innovation', 'High pricing'], pricing: '$49/mo' },
      { name: 'CompetitorB', url: 'https://competitorb.com', strengths: ['Modern UI', 'Good docs'], weaknesses: ['Limited features', 'No mobile app'], pricing: 'Freemium' },
      { name: 'CompetitorC', url: 'https://competitorc.com', strengths: ['Open source', 'Active community'], weaknesses: ['Complex setup', 'Poor UX'], pricing: 'Free' },
    ],
    gaps: [
      { gap: 'No real-time collaboration', severity: 'high', opportunity: 'Add live-editing with CRDTs for instant multi-user sync' },
      { gap: 'Poor mobile experience', severity: 'high', opportunity: 'PWA-first responsive design with offline support' },
      { gap: 'No plugin ecosystem', severity: 'medium', opportunity: 'Design extension API from day one with a marketplace' },
      { gap: 'Weak analytics dashboard', severity: 'medium', opportunity: 'Built-in analytics with actionable insights' },
    ],
    marketInsights: {
      targetAudience: 'Small to mid-size teams looking for modern tooling',
      marketSize: 'Growing $2B+ market with 15% YoY growth',
      trends: ['AI-assisted workflows', 'Real-time collaboration', 'Mobile-first design'],
    },
    techRecommendations: ['WebSocket for real-time sync', 'React + Tailwind for frontend', 'PostgreSQL for data persistence'],
    summary: `The ${projectName} space has several established players (CompetitorA, CompetitorB) but none offer real-time collaboration or mobile-first experiences. CompetitorC is open source but has poor UX. The biggest opportunity is combining real-time features with a polished mobile experience.`,
  };
}

function getMockName(projectName) {
  return {
    name: `${projectName}AI`,
    tagline: 'From idea to impact in seconds',
    reasoning: `Combines the core concept of ${projectName} with AI-driven automation to signal innovation and speed.`,
  };
}

function getMockScaffold(projectName) {
  return {
    repoUrl: `https://github.com/mock-user/${projectName.toLowerCase().replace(/\s+/g, '-')}`,
    owner: 'mock-user',
    repo: projectName.toLowerCase().replace(/\s+/g, '-'),
  };
}

function getMockRoadmap(projectName) {
  return {
    tasks: [
      { title: 'Set up project boilerplate', description: 'Initialize with Express and ESLint', priority: 'high', label: 'setup' },
      { title: 'Design core data models', description: 'Define schemas for primary entities', priority: 'high', label: 'feature' },
      { title: 'Implement authentication', description: 'JWT-based auth flow', priority: 'high', label: 'feature' },
      { title: 'Build main dashboard UI', description: 'Responsive dashboard with key metrics', priority: 'medium', label: 'feature' },
      { title: 'Add real-time sync', description: 'WebSocket-based live updates', priority: 'medium', label: 'feature' },
      { title: 'Create REST API endpoints', description: 'CRUD operations for all resources', priority: 'medium', label: 'feature' },
      { title: 'Set up CI/CD pipeline', description: 'GitHub Actions for test + deploy', priority: 'low', label: 'infra' },
      { title: 'Write API documentation', description: 'OpenAPI spec + getting started guide', priority: 'low', label: 'docs' },
    ],
    issueUrls: ['https://github.com/mock-user/mock-repo/issues/1'],
  };
}

function getMockBrief(projectName) {
  return {
    briefContent: `# Investor Brief — ${projectName}\n\n## Problem\nDevelopers lose 60-120 minutes on project setup.\n\n## Market Gap\nExisting tools lack real-time features.\n\n## Solution\n${projectName} automates the entire setup pipeline.\n\n## Roadmap\n8 milestones over 48 hours.\n\n## Why Now\nAI tooling has matured enough to make this possible.\n`,
  };
}

module.exports = { processIdea, PhaseError };
