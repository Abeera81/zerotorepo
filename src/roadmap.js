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
 * Generate a roadmap of 7–10 tasks from Groq based on the project and research gaps.
 */
async function generateRoadmap(projectName, description, gapData) {
  const gapSummary = (gapData.gaps || [])
    .map((g) => `- [${g.severity || 'medium'}] ${g.gap}: ${g.opportunity}`)
    .join('\n');

  const competitorSummary = (gapData.competitors || [])
    .map((c) => `- ${c.name}: strengths=${(c.strengths || []).join(', ')}; weaknesses=${(c.weaknesses || []).join(', ')}`)
    .join('\n');

  const techRecs = (gapData.techRecommendations || []).join(', ');
  const audience = gapData.marketInsights?.targetAudience || '';

  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    temperature: 0.4,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: roadmapPrompt },
      {
        role: 'user',
        content: `Project: ${projectName}\nDescription: ${description || 'N/A'}\nTarget Audience: ${audience}\n\nCompetitors:\n${competitorSummary || 'None identified'}\n\nGaps:\n${gapSummary}\n\nRecommended Tech: ${techRecs || 'N/A'}\n\nNote: The project already has a scaffolded repo with README.md, package.json, .gitignore, and src/index.js. Do NOT create tasks for these.\n\nGenerate 7-10 implementable tasks.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response for roadmap');

  const parsed = JSON.parse(content);
  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error('Groq roadmap response missing "tasks" array');
  }

  // Validate each task has required fields
  for (const task of parsed.tasks) {
    if (!task.title || !task.priority) {
      throw new Error(`Invalid task in roadmap: ${JSON.stringify(task)}`);
    }
    if (!['high', 'medium', 'low'].includes(task.priority)) {
      task.priority = 'medium';
    }
  }

  return parsed;
}

module.exports = { generateRoadmap };
