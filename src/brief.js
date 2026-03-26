const config = require('./config');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: config.groq.apiKey });

const briefPrompt = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'brief.txt'),
  'utf-8'
);

/**
 * Synthesize a Project Brief from research, roadmap, and execution data.
 * Includes: top 3 competitors + gap, roadmap rationale, repo link, issue titles, timestamp.
 */
async function synthesizeBrief(projectName, startupName, description, gapData, strategyData, repoUrl, issueUrls, timestamp) {
  const displayName = startupName?.name || projectName;
  const tagline = startupName?.tagline || '';

  // Top 3 competitors with positioning and weakness
  const competitorSummary = (gapData.competitors || []).slice(0, 3)
    .map((c) => {
      const positioning = (c.strengths || []).join(', ') || 'Unknown';
      const weakness = (c.weaknesses || []).join(', ') || 'Unknown';
      return `- ${c.name} — Positioning: ${positioning} | Key Weakness: ${weakness}`;
    })
    .join('\n');

  // Gap Opportunity
  const highGaps = (gapData.gaps || []).filter((g) => g.severity === 'high');
  const topGap = highGaps[0] || (gapData.gaps || [])[0];
  const gapOpportunity = topGap ? `${topGap.gap} — ${topGap.opportunity}` : 'N/A';

  // 4-week roadmap summary
  const tasksByWeek = {};
  for (const t of strategyData?.tasks || []) {
    const w = t.week || 1;
    if (!tasksByWeek[w]) tasksByWeek[w] = [];
    tasksByWeek[w].push(t);
  }
  let roadmapSummary = '';
  for (let w = 1; w <= 4; w++) {
    const tasks = tasksByWeek[w] || [];
    if (tasks.length > 0) {
      roadmapSummary += `Week ${w}: ${tasks.map((t) => `${t.title} (${t.gap_addressed || 'general'})`).join('; ')}\n`;
    }
  }

  // First 3 issue titles
  const issueTitles = (strategyData?.tasks || []).slice(0, 3).map((t) => t.title);
  const issueList = issueTitles.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const trends = (gapData.marketInsights?.trends || []).join(', ');

  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    temperature: 0.6,
    max_tokens: 2500,
    messages: [
      { role: 'system', content: briefPrompt },
      {
        role: 'user',
        content: `Project: ${displayName}\nTagline: ${tagline}\nDescription: ${description || 'N/A'}\n\nTop 3 Competitors:\n${competitorSummary}\n\nBiggest Gap Opportunity: ${gapOpportunity}\n\n4-Week Roadmap:\n${roadmapSummary}\nStrategy: ${strategyData?.strategy_summary || 'N/A'}\n\nExecution Data:\n- GitHub Repository: ${repoUrl || 'N/A'}\n- First 3 Issues:\n${issueList}\n- Timestamp: ${timestamp}\n\nMarket Trends: ${trends}\n\nWrite a Project Brief following the exact section structure.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response for brief');

  return { briefContent: content };
}

module.exports = { synthesizeBrief };
