const notion = require('./notion');
const { searchBrave, analyzeGaps, formatGapsMarkdown } = require('./research');
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

  // Phase 1: Research
  onPhaseStart?.('Research');
  if (!useMock) await notion.updateStatus(pageId, 'Researching');
  const research = await runPhase('Research', async () => {
    if (useMock) { await mockDelay(); return getMockResearch(projectName); }

    // Idempotency: skip if research sub-page already exists
    if (await notion.subPageExists(pageId, `Research — ${projectName}`)) {
      onPhaseEnd?.('Research', 'skipped (already exists)');
      return { gaps: [], summary: 'Research already completed.' };
    }

    const results1 = await searchBrave(`${projectName} competitors`);
    const results2 = await searchBrave(`${projectName} open source alternatives`);
    const gapData = await analyzeGaps(projectName, [...results1, ...results2]);
    const markdown = formatGapsMarkdown(projectName, gapData);
    await notion.writeSubPage(pageId, `Research — ${projectName}`, markdown);
    return gapData;
  });
  onPhaseEnd?.('Research', 'done');

  // Phase 2: Scaffold
  onPhaseStart?.('Scaffold');
  if (!useMock) await notion.updateStatus(pageId, 'Scaffolding');
  const repo = await runPhase('Scaffold', async () => {
    if (useMock) { await mockDelay(); return getMockScaffold(projectName); }

    // Idempotency: skip if GitHub URL already set
    const existingUrl = page.properties['GitHub URL']?.url;
    if (existingUrl) {
      onPhaseEnd?.('Scaffold', 'skipped (repo exists)');
      const parts = existingUrl.replace('https://github.com/', '').split('/');
      return { repoUrl: existingUrl, owner: parts[0], repo: parts[1] };
    }

    const repoInfo = await createRepo(projectName);
    const gapSummary = research.summary || formatGapsMarkdown(projectName, research);
    const files = generateScaffoldFiles(projectName, description, gapSummary);
    await ghostCommit(repoInfo.owner, repoInfo.repo, files);
    await notion.setGitHubUrl(pageId, repoInfo.repoUrl);
    return repoInfo;
  });
  onPhaseEnd?.('Scaffold', 'done');

  // Phase 3: Roadmap → Issues
  onPhaseStart?.('Roadmap');
  const roadmap = await runPhase('Roadmap', async () => {
    if (useMock) { await mockDelay(); return getMockRoadmap(projectName); }

    const { tasks } = await generateRoadmap(projectName, research);
    const issueUrls = await createIssues(repo.owner, repo.repo, tasks);
    return { tasks, issueUrls };
  });
  onPhaseEnd?.('Roadmap', 'done');

  // Phase 4: Brief
  onPhaseStart?.('Brief');
  if (!useMock) await notion.updateStatus(pageId, 'Generating Brief');
  const brief = await runPhase('Brief', async () => {
    if (useMock) { await mockDelay(); return getMockBrief(projectName); }

    // Idempotency: skip if brief sub-page already exists
    if (await notion.subPageExists(pageId, `Brief — ${projectName}`)) {
      onPhaseEnd?.('Brief', 'skipped (already exists)');
      return { briefContent: 'Brief already exists.' };
    }

    const { briefContent } = await synthesizeBrief(projectName, research, roadmap);
    await notion.writeSubPage(pageId, `Brief — ${projectName}`, briefContent);
    return { briefContent };
  });
  onPhaseEnd?.('Brief', 'done');

  // Done!
  if (!useMock) {
    await notion.updateStatus(pageId, 'Ready');
    await notion.resetTrigger(pageId);
  }

  return { projectName, repoUrl: repo.repoUrl, research, roadmap, brief };
}

// --- Mock data for --mock mode ---

function getMockResearch(projectName) {
  return {
    gaps: [
      { gap: 'No real-time collaboration', opportunity: 'Add live-editing with CRDTs' },
      { gap: 'Poor mobile experience', opportunity: 'PWA-first responsive design' },
      { gap: 'No plugin ecosystem', opportunity: 'Design extension API from day one' },
    ],
    summary: `The ${projectName} space has several established players but none offer real-time collaboration or mobile-first experiences.`,
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
