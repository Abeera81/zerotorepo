const config = require('./config');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: config.groq.apiKey });

const roadmapPrompt = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'roadmap.txt'),
  'utf-8'
);

/**
 * Generate a 4-week strategy roadmap from Groq targeting specific competitive gaps.
 * Returns { strategy_summary, tasks } where each task has week, gap_addressed, owner, etc.
 */
async function generateStrategy(projectName, description, gapData) {
  const gapSummary = (gapData.gaps || [])
    .map((g) => `- [${g.severity || 'medium'}] ${g.gap}: ${g.opportunity}`)
    .join('\n');

  const competitorSummary = (gapData.competitors || [])
    .map((c) => {
      const positioning = (c.strengths || []).join(', ');
      const weakness = (c.weaknesses || []).join(', ');
      return `- ${c.name}: positioning=${positioning}; key weakness=${weakness}`;
    })
    .join('\n');

  const techRecs = (gapData.techRecommendations || []).join(', ');
  const audience = gapData.marketInsights?.targetAudience || '';

  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    temperature: 0.4,
    max_tokens: 2500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: roadmapPrompt },
      {
        role: 'user',
        content: `Project: ${projectName}\nDescription: ${description || 'N/A'}\nTarget Audience: ${audience}\n\nCompetitors:\n${competitorSummary || 'None identified'}\n\nGaps (each must be addressed in roadmap):\n${gapSummary}\n\nRecommended Tech: ${techRecs || 'N/A'}\n\nNote: The project already has a scaffolded repo with README.md, package.json, .gitignore, and src/index.js. Do NOT create tasks for these.\n\nGenerate a 4-week strategic roadmap with 8-12 tasks. Every task must reference a specific gap.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response for strategy');

  const parsed = JSON.parse(content);
  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error('Groq strategy response missing "tasks" array');
  }

  // Validate and normalize each task
  for (const task of parsed.tasks) {
    if (!task.title || !task.priority) {
      throw new Error(`Invalid task in strategy: ${JSON.stringify(task)}`);
    }
    if (!['high', 'medium', 'low'].includes(task.priority)) {
      task.priority = 'medium';
    }
    task.week = task.week || 1;
    task.gap_addressed = task.gap_addressed || 'General improvement';
    task.owner = task.owner || 'TBD';
  }

  return {
    strategy_summary: parsed.strategy_summary || '',
    tasks: parsed.tasks,
  };
}

/**
 * Format strategy/roadmap as markdown for a Notion sub-page.
 */
function formatStrategyMarkdown(projectName, strategy) {
  let md = `# Strategy & Roadmap — ${projectName}\n\n`;

  if (strategy.strategy_summary) {
    md += `## Strategic Approach\n\n${strategy.strategy_summary}\n\n`;
  }

  // Group tasks by week
  const byWeek = { 1: [], 2: [], 3: [], 4: [] };
  for (const task of strategy.tasks || []) {
    const week = task.week >= 1 && task.week <= 4 ? task.week : 1;
    byWeek[week].push(task);
  }

  const weekLabels = {
    1: 'Week 1 — Core Architecture & Critical Gaps',
    2: 'Week 2 — Key Feature Development',
    3: 'Week 3 — Integration & Polish',
    4: 'Week 4 — Testing & Launch Prep',
  };

  for (let w = 1; w <= 4; w++) {
    md += `## ${weekLabels[w]}\n\n`;
    if (byWeek[w].length === 0) {
      md += '_No tasks scheduled_\n\n';
      continue;
    }
    for (const task of byWeek[w]) {
      const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
      md += `### ${priority} ${task.title}\n`;
      md += `**Priority:** ${task.priority} | **Owner:** ${task.owner} | **Label:** ${task.label || 'feature'}\n`;
      md += `**Gap Addressed:** ${task.gap_addressed}\n`;
      md += `${task.description}\n\n`;
    }
  }

  return md;
}

module.exports = { generateStrategy, formatStrategyMarkdown };
