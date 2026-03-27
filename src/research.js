const config = require('./config');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: config.groq.apiKey });

const gapAnalysisPrompt = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'gap-analysis.txt'),
  'utf-8'
);

const nameGenPrompt = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'name-generation.txt'),
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
 * Extract short search keywords from a long description.
 * Pulls out the core concepts for targeted searches.
 */
function extractKeywords(projectName, description) {
  if (!description || description.length < 50) return { short: projectName, concepts: [] };

  // Extract meaningful multi-word phrases from the description
  const conceptPatterns = [
    /pet\s+(?:shop|store|food|wellness|grooming|adoption|care|supplies)/gi,
    /(?:natural|organic|eco-friendly|premium|rescue|shelter|health|clinic)\s+\w+/gi,
    /(?:grooming|microchipping|adoption|wellness|delivery|booking|scheduling)/gi,
    /(?:mobile\s+app|online\s+store|e-commerce|marketplace|platform|saas)/gi,
  ];

  const concepts = new Set();
  for (const pattern of conceptPatterns) {
    const matches = description.match(pattern) || [];
    for (const m of matches) {
      const clean = m.trim().toLowerCase();
      if (clean.length > 3 && clean.length < 40) concepts.add(clean);
    }
  }

  return {
    short: projectName, // always use project name for short — it's already concise
    concepts: [...concepts].slice(0, 5),
  };
}

/**
 * Build a diverse set of search queries from the project name and description.
 * Keeps each query short (<100 chars) for Brave Search compatibility.
 */
function buildSearchQueries(projectName, description) {
  const kw = extractKeywords(projectName, description);
  const year = new Date().getFullYear();

  const queries = [
    // Core competitive research
    `${projectName} competitors ${year}`,
    `${projectName} alternatives`,
    `${projectName} market size trends`,
    `best ${projectName} software tools`,
    `${projectName} pricing comparison reviews`,
  ];

  // Add concept-specific searches from description keywords
  for (const concept of kw.concepts || []) {
    queries.push(`${concept} market trends ${year}`);
    queries.push(`${concept} software platform`);
  }

  // Deduplicate and cap at 8 queries (respect Brave rate limits)
  const seen = new Set();
  return queries.filter((q) => {
    const key = q.toLowerCase().trim();
    if (seen.has(key) || q.length > 100) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

/**
 * Run multiple Brave searches in sequence (respects 1 req/s rate limit).
 * Resilient: skips failed queries and continues with available results.
 */
async function deepSearch(projectName, description) {
  const queries = buildSearchQueries(projectName, description);

  const allResults = [];
  for (const query of queries) {
    try {
      // Brave free tier: 1 req/s — wait before each request
      await new Promise((r) => setTimeout(r, 1500));
      const results = await searchBrave(query);
      allResults.push({ query, results });
    } catch (err) {
      // Log but don't crash — continue with results we have
      console.warn(`[Research] Search failed for "${query}": ${err.message}`);
      allResults.push({ query, results: [] });
    }
  }

  // Ensure we got at least some results
  const totalResults = allResults.reduce((sum, s) => sum + s.results.length, 0);
  if (totalResults === 0) {
    throw new Error('All Brave searches returned zero results. Check your API key and rate limits.');
  }

  return allResults;
}

/**
 * Use Groq to perform deep competitive analysis from multiple search result sets.
 */
async function analyzeGaps(projectName, description, searchSets) {
  // Flatten and deduplicate results by URL
  const seen = new Set();
  const allResults = [];
  for (const { query, results } of searchSets) {
    for (const r of results) {
      if (!seen.has(r.url)) {
        seen.add(r.url);
        allResults.push(r);
      }
    }
  }

  const formatted = allResults
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`)
    .join('\n\n');

  const queriesList = searchSets.map((s) => `- "${s.query}" (${s.results.length} results)`).join('\n');

  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    temperature: 0.3,
    max_tokens: 2500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: gapAnalysisPrompt },
      {
        role: 'user',
        content: `Project: ${projectName}\nDescription: ${description || 'N/A'}\n\nSearches performed:\n${queriesList}\n\nAll Search Results:\n${formatted}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response for gap analysis');

  const parsed = JSON.parse(content);
  if (!parsed.gaps || !Array.isArray(parsed.gaps)) {
    throw new Error('Groq gap analysis response missing "gaps" array');
  }
  if (!parsed.competitors || !Array.isArray(parsed.competitors) || parsed.competitors.length === 0) {
    throw new Error('Groq gap analysis returned zero competitors — cannot proceed with empty competitor data');
  }
  // Ensure expected fields exist with defaults
  parsed.marketInsights = parsed.marketInsights || {};
  parsed.techRecommendations = parsed.techRecommendations || [];
  return parsed;
}

/**
 * Generate a catchy startup name based on the idea and research.
 */
async function generateStartupName(projectName, description, gapData) {
  const competitorNames = (gapData.competitors || []).map((c) => c.name).join(', ');
  const topGaps = (gapData.gaps || []).slice(0, 3).map((g) => g.gap).join('; ');

  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    temperature: 0.8,
    max_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: nameGenPrompt },
      {
        role: 'user',
        content: `Business Idea: ${projectName}\nDescription: ${description || projectName}\nCompetitors: ${competitorNames || 'None identified'}\nKey Gaps to Exploit: ${topGaps || 'General market opportunity'}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response for name generation');

  const parsed = JSON.parse(content);
  if (!parsed.name) throw new Error('Groq name generation response missing "name"');
  return parsed;
}

/**
 * Format research as a "Market Analysis" document for Notion.
 * Structure: competitors (name, positioning, weakness) + Gap Opportunity section.
 */
function formatMarketAnalysis(projectName, startupName, research) {
  let md = `# Market Analysis — ${startupName?.name || projectName}\n\n`;
  md += `> ${startupName?.tagline || ''}\n\n`;

  if (research.summary) {
    md += `## Executive Summary\n\n${research.summary}\n\n`;
  }

  // Top competitors with name, positioning, key weakness
  if (research.competitors?.length > 0) {
    md += '## Top Competitors\n\n';
    for (const c of research.competitors.slice(0, 5)) {
      md += `### ${c.name}\n`;
      if (c.url) md += `🔗 ${c.url}\n`;
      if (c.pricing) md += `💰 ${c.pricing}\n\n`;
      const positioning = (c.strengths || []).join(', ') || 'Unknown';
      const weakness = (c.weaknesses || []).join(', ') || 'Not identified';
      md += `**Positioning:** ${positioning}\n`;
      md += `**Key Weakness:** ${weakness}\n\n`;
    }
  }

  // Gap Opportunity — the single biggest gap all competitors share
  const highGaps = (research.gaps || []).filter((g) => g.severity === 'high');
  const topGap = highGaps[0] || (research.gaps || [])[0];
  if (topGap) {
    md += '## 🎯 Gap Opportunity\n\n';
    md += `**What all competitors lack:** ${topGap.gap}\n\n`;
    md += `**Our opportunity:** ${topGap.opportunity}\n\n`;
  }

  // All identified gaps
  md += '## All Identified Gaps\n\n';
  for (const item of research.gaps || []) {
    const severity = item.severity ? ` [${item.severity.toUpperCase()}]` : '';
    md += `- **${item.gap}**${severity} — ${item.opportunity}\n`;
  }
  md += '\n';

  // Market context
  if (research.marketInsights) {
    const mi = research.marketInsights;
    md += '## Market Context\n\n';
    if (mi.targetAudience) md += `**Target Audience:** ${mi.targetAudience}\n`;
    if (mi.marketSize) md += `**Market Size:** ${mi.marketSize}\n`;
    if (mi.trends?.length > 0) {
      md += `**Trends:** ${mi.trends.join(' • ')}\n`;
    }
    md += '\n';
  }

  if (research.techRecommendations?.length > 0) {
    md += '## Tech Recommendations\n\n';
    for (const rec of research.techRecommendations) {
      md += `- ${rec}\n`;
    }
    md += '\n';
  }

  return md;
}

/**
 * Fallback research data when Brave Search returns no results.
 * Keeps the pipeline unbroken with template data that prompts manual validation.
 */
function getFallbackResearch(projectName) {
  return {
    competitors: [
      { name: 'Market Leader (unknown)', url: 'N/A', strengths: ['Established market presence'], weaknesses: ['Limited innovation, slow to adapt'], pricing: 'Unknown' },
      { name: 'Emerging Competitor (unknown)', url: 'N/A', strengths: ['Modern tech stack'], weaknesses: ['Small user base, unproven model'], pricing: 'Unknown' },
      { name: 'Open-Source Alternative (unknown)', url: 'N/A', strengths: ['Free, community-driven'], weaknesses: ['Poor UX, no support'], pricing: 'Free' },
    ],
    gaps: [
      { gap: 'No competitor offers a seamless end-to-end experience', severity: 'high', opportunity: `Build ${projectName} as a unified platform that eliminates fragmented workflows` },
      { gap: 'Poor mobile and modern UX across all solutions', severity: 'high', opportunity: 'Design mobile-first with a modern, intuitive interface' },
      { gap: 'Lack of AI-powered automation', severity: 'medium', opportunity: 'Integrate AI to automate repetitive tasks and surface insights' },
    ],
    marketInsights: {
      targetAudience: 'To be validated through customer discovery',
      marketSize: 'Requires manual research — search data unavailable',
      trends: ['Digital transformation', 'AI-assisted workflows', 'Mobile-first design'],
    },
    techRecommendations: ['Start with lean MVP', 'Validate core assumptions early', 'Use modern web stack (React/Next.js + Node.js)'],
    summary: `Live search results were unavailable for "${projectName}". This analysis uses template data to keep the pipeline running. Conduct manual competitive research to validate these assumptions and replace with real competitor data.`,
  };
}

module.exports = { searchBrave, deepSearch, analyzeGaps, generateStartupName, formatMarketAnalysis, getFallbackResearch };
