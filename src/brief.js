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
 * Synthesize an investor brief from the research and roadmap data.
 */
async function synthesizeBrief(projectName, gapData, roadmapData) {
  const gapSummary = (gapData.gaps || [])
    .map((g) => `- ${g.gap}: ${g.opportunity}`)
    .join('\n');

  const taskSummary = (roadmapData.tasks || [])
    .map((t) => `- [${t.priority}] ${t.title}`)
    .join('\n');

  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    temperature: 0.6,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: briefPrompt },
      {
        role: 'user',
        content: `Project: ${projectName}\n\nCompetitive Research:\n${gapSummary}\n\nRoadmap:\n${taskSummary}\n\nWrite a 1-page investor brief.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response for brief');

  return { briefContent: content };
}

module.exports = { synthesizeBrief };
