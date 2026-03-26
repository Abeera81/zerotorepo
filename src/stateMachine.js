const notion = require('./notion');
const { runAgent } = require('./agent');

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
 * In live mode: LLM agent orchestrates tool calls via Groq function calling.
 * In mock mode: sequential pipeline with mock data.
 */
async function processIdea(page, { onPhaseStart, onPhaseEnd, useMock = false } = {}) {
  const pageId = page.id;
  const projectName = notion.extractTitle(page);
  const description = notion.extractDescription(page);

  // Live mode: LLM-driven agent orchestration
  if (!useMock) {
    return await runAgent(projectName, description, pageId, { onPhaseStart, onPhaseEnd });
  }

  // Mock mode: sequential pipeline with fake data
  const mockDelay = () => sleep(1500);

  // Phase 1: Research
  onPhaseStart?.('Research');
  const { research, startupName } = await runPhase('Research', async () => {
    await mockDelay();
    return { research: getMockResearch(projectName), startupName: getMockName(projectName) };
  });
  onPhaseEnd?.('Research', 'done');

  // Phase 2: Strategy
  onPhaseStart?.('Strategy');
  const strategy = await runPhase('Strategy', async () => {
    await mockDelay();
    return getMockStrategy(projectName);
  });
  onPhaseEnd?.('Strategy', 'done');

  // Phase 3: Execution
  onPhaseStart?.('Execution');
  const displayName = startupName?.name || projectName;
  const repo = await runPhase('Execution', async () => {
    await mockDelay();
    return getMockScaffold(displayName);
  });
  onPhaseEnd?.('Execution', 'done');

  // Phase 4: Synthesis
  onPhaseStart?.('Synthesis');
  const brief = await runPhase('Synthesis', async () => {
    await mockDelay();
    return getMockBrief(displayName);
  });
  onPhaseEnd?.('Synthesis', 'done');

  return { projectName: displayName, repoUrl: repo.repoUrl, research, startupName, strategy, brief };
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

function getMockStrategy(projectName) {
  return {
    strategy_summary: `Target the lack of real-time collaboration (Week 1-2) and poor mobile experience (Week 2-3) — the two biggest gaps all competitors share.`,
    tasks: [
      { title: 'Design real-time sync architecture', description: 'CRDTs for conflict-free live editing', priority: 'high', week: 1, label: 'feature', gap_addressed: 'Competitors lack real-time collaboration → Build CRDT-based live sync', owner: 'TBD' },
      { title: 'Implement WebSocket infrastructure', description: 'Set up WebSocket server with reconnection handling', priority: 'high', week: 1, label: 'infra', gap_addressed: 'Competitors lack real-time collaboration → Build WebSocket layer', owner: 'TBD' },
      { title: 'Build mobile-first responsive UI', description: 'PWA with offline support and responsive design', priority: 'high', week: 2, label: 'feature', gap_addressed: 'Competitors lack mobile experience → Build PWA-first design', owner: 'TBD' },
      { title: 'Core data model and API', description: 'Design schemas and REST/GraphQL endpoints', priority: 'high', week: 1, label: 'feature', gap_addressed: 'No competitor has clean API → Build developer-friendly API', owner: 'TBD' },
      { title: 'Plugin extension API', description: 'Design extension API with marketplace hooks', priority: 'medium', week: 2, label: 'feature', gap_addressed: 'Competitors lack plugin ecosystem → Build extension API from day one', owner: 'TBD' },
      { title: 'Analytics dashboard', description: 'Built-in analytics with actionable insights', priority: 'medium', week: 3, label: 'feature', gap_addressed: 'Competitors have weak analytics → Build insights dashboard', owner: 'TBD' },
      { title: 'Integration testing suite', description: 'End-to-end tests for all critical paths', priority: 'medium', week: 3, label: 'infra', gap_addressed: 'Competitors have poor reliability → Ensure quality through comprehensive testing', owner: 'TBD' },
      { title: 'User onboarding flow', description: 'Interactive onboarding with guided tour', priority: 'medium', week: 3, label: 'feature', gap_addressed: 'Competitors have complex setup → Build frictionless onboarding', owner: 'TBD' },
      { title: 'API documentation', description: 'OpenAPI spec and getting started guide', priority: 'low', week: 4, label: 'docs', gap_addressed: 'Competitors have poor documentation → Ship comprehensive docs', owner: 'TBD' },
      { title: 'Launch preparation', description: 'Performance optimization, security audit, deployment pipeline', priority: 'low', week: 4, label: 'infra', gap_addressed: 'General readiness for production launch', owner: 'TBD' },
    ],
  };
}

function getMockBrief(projectName) {
  return {
    briefContent: `# Project Brief — ${projectName}\n\n## Top 3 Competitors & Market Gap\n- CompetitorA: Strong brand but slow innovation\n- CompetitorB: Modern UI but limited features\n- CompetitorC: Open source but poor UX\n\n**Gap:** None offer real-time collaboration + mobile-first experience.\n\n## Strategy & Roadmap Rationale\nWeek 1: Core architecture targeting real-time gap.\nWeek 2: Mobile-first UI + plugin API.\nWeek 3: Polish + analytics.\nWeek 4: Docs + launch prep.\n\n## Execution Status\n- **GitHub Repository:** https://github.com/mock-user/${projectName.toLowerCase().replace(/\s+/g, '-')}\n- **Issues Opened:** 10 issues from strategy\n- **Initialized:** ${new Date().toISOString()}\n\n## Why This Matters\nAI tooling maturity + mobile-first demand = perfect timing.\n`,
  };
}

module.exports = { processIdea, PhaseError };
