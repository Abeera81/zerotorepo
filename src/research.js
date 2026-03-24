const config = require('./config');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: config.groq.apiKey });

const gapAnalysisPrompt = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'gap-analysis.txt'),
  'utf-8'
);

/**
 * Search Brave for the given query. Returns top 10 results.
 */
async function searchBrave(query) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&safesearch=moderate`;
  const res = await fetch(url, {
    headers: { 'X-Subscription-Token': config.brave.apiKey },
  });

  if (!res.ok) {
    const err = new Error(`Brave Search failed: ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return (data.web?.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description || '',
  }));
}

/**
 * Use Groq to analyze search results and identify competitive gaps.
 */
async function analyzeGaps(projectName, searchResults) {
  const formatted = searchResults
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`)
    .join('\n\n');

  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    temperature: 0.3,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: gapAnalysisPrompt },
      { role: 'user', content: `Project: ${projectName}\n\nSearch Results:\n${formatted}` },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response for gap analysis');

  const parsed = JSON.parse(content);
  if (!parsed.gaps || !Array.isArray(parsed.gaps)) {
    throw new Error('Groq gap analysis response missing "gaps" array');
  }
  return parsed;
}

/**
 * Format the gap analysis as readable markdown.
 */
function formatGapsMarkdown(projectName, gapData) {
  let md = `# Competitive Gap Analysis — ${projectName}\n\n`;
  if (gapData.summary) {
    md += `${gapData.summary}\n\n`;
  }
  md += '## Identified Gaps\n\n';
  for (const item of gapData.gaps) {
    md += `### 🔍 ${item.gap}\n`;
    md += `**Opportunity:** ${item.opportunity}\n\n`;
  }
  return md;
}

module.exports = { searchBrave, analyzeGaps, formatGapsMarkdown };
