#!/usr/bin/env node

/**
 * ZeroToRepo — Interactive Setup Wizard
 *
 * Collects API keys, creates the Notion workspace (Projects + Tasks databases),
 * tests all connections, and writes `.env` so `npm start` Just Works™.
 */

const fs = require('fs');
const path = require('path');
const { intro, outro, text, spinner, log, note, isCancel, cancel } = require('@clack/prompts');

const ENV_PATH = path.join(__dirname, '..', '.env');

// ─── helpers ───────────────────────────────────────────────────────────────

function bail(msg) {
  cancel(msg || 'Setup cancelled.');
  process.exit(0);
}

function masked(key) {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 4) + '•'.repeat(key.length - 8) + key.slice(-4);
}

/**
 * Lightweight MCP client just for setup — avoids requiring config.js
 * which would crash if .env is missing.
 */
async function createMcpClient(notionApiKey) {
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [require.resolve('@notionhq/notion-mcp-server/bin/cli.mjs')],
    env: { ...process.env, NOTION_TOKEN: notionApiKey },
  });

  const client = new Client(
    { name: 'zerotorepo-setup', version: '1.0.0' },
    { capabilities: {} },
  );

  await client.connect(transport);
  return {
    callTool: async (name, args) => {
      const result = await client.callTool({ name, arguments: args });
      if (result.content && Array.isArray(result.content)) {
        const txt = result.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
        try { return JSON.parse(txt); } catch { return txt; }
      }
      return result;
    },
    listTools: async () => {
      const result = await client.listTools();
      return result.tools || [];
    },
    close: () => client.close(),
  };
}

// ─── connection testers ────────────────────────────────────────────────────

async function testNotion(apiKey) {
  const mcp = await createMcpClient(apiKey);
  try {
    // listTools proves the MCP server started and is responsive
    const c = mcp;
    const tools = await c.listTools();
    if (!tools || tools.length === 0) throw new Error('No MCP tools available');
    return { ok: true, mcp, toolCount: tools.length };
  } catch (err) {
    await mcp.close().catch(() => {});
    return { ok: false, error: err.message };
  }
}

async function testGroq(apiKey) {
  const Groq = require('groq-sdk');
  const groq = new Groq({ apiKey });
  try {
    await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function testBrave(apiKey) {
  try {
    const res = await fetch(
      'https://api.search.brave.com/res/v1/web/search?q=test&count=1',
      { headers: { 'X-Subscription-Token': apiKey } },
    );
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function testGitHub(token) {
  const { Octokit } = require('@octokit/rest');
  const octokit = new Octokit({ auth: token });
  try {
    const { data } = await octokit.users.getAuthenticated();
    return { ok: true, username: data.login };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Notion workspace setup via MCP ────────────────────────────────────────

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  intro('🚀 ZeroToRepo — Setup Wizard');

  // Check for existing .env
  let existingEnv = {};
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.trim().match(/^([A-Z_]+)=["']?(.+?)["']?$/);
      if (m) existingEnv[m[1]] = m[2];
    }
    if (Object.keys(existingEnv).length > 0) {
      log.info('Found existing .env — press Enter to keep current values.');
    }
  }

  // ── Step 1: Notion API Key ──────────────────────────────────────────────

  note(
    'Create an integration at notion.so/my-integrations\n' +
    'Then share your workspace page with the integration.',
    '1/4 · Notion API Key',
  );

  const notionKey = await text({
    message: 'Paste your Notion integration secret:',
    placeholder: existingEnv.NOTION_API_KEY ? `(current: ${masked(existingEnv.NOTION_API_KEY)})` : 'ntn_xxxx...',
    validate: (v) => {
      if (!v && existingEnv.NOTION_API_KEY) return; // keep current
      if (!v) return 'Required';
      if (!v.startsWith('ntn_') && !v.startsWith('secret_')) return 'Should start with ntn_ or secret_';
    },
  });
  if (isCancel(notionKey)) bail();
  const NOTION_API_KEY = notionKey || existingEnv.NOTION_API_KEY;

  // ── Step 2: Groq API Key ───────────────────────────────────────────────

  note(
    'Sign up at console.groq.com (free)\n' +
    'Create an API key in your dashboard.',
    '2/4 · Groq API Key',
  );

  const groqKey = await text({
    message: 'Paste your Groq API key:',
    placeholder: existingEnv.GROQ_API_KEY ? `(current: ${masked(existingEnv.GROQ_API_KEY)})` : 'gsk_xxxx...',
    validate: (v) => {
      if (!v && existingEnv.GROQ_API_KEY) return;
      if (!v) return 'Required';
      if (!v.startsWith('gsk_')) return 'Should start with gsk_';
    },
  });
  if (isCancel(groqKey)) bail();
  const GROQ_API_KEY = groqKey || existingEnv.GROQ_API_KEY;

  // ── Step 3: Brave Search API Key ────────────────────────────────────────

  note(
    'Sign up at brave.com/search/api (free, 2000 queries/mo)\n' +
    'Copy your subscription token.',
    '3/4 · Brave Search API Key',
  );

  const braveKey = await text({
    message: 'Paste your Brave Search API key:',
    placeholder: existingEnv.BRAVE_API_KEY ? `(current: ${masked(existingEnv.BRAVE_API_KEY)})` : 'BSA_xxxx...',
    validate: (v) => {
      if (!v && existingEnv.BRAVE_API_KEY) return;
      if (!v) return 'Required';
    },
  });
  if (isCancel(braveKey)) bail();
  const BRAVE_API_KEY = braveKey || existingEnv.BRAVE_API_KEY;

  // ── Step 4: GitHub Token ────────────────────────────────────────────────

  note(
    'Create at github.com/settings/tokens\n' +
    'Needs: repo scope (or fine-grained: Read+Write on\n' +
    'Administration, Contents, Issues)',
    '4/4 · GitHub Personal Access Token',
  );

  const ghToken = await text({
    message: 'Paste your GitHub token:',
    placeholder: existingEnv.GITHUB_TOKEN ? `(current: ${masked(existingEnv.GITHUB_TOKEN)})` : 'ghp_xxxx...',
    validate: (v) => {
      if (!v && existingEnv.GITHUB_TOKEN) return;
      if (!v) return 'Required';
      if (!v.startsWith('ghp_') && !v.startsWith('github_pat_')) return 'Should start with ghp_ or github_pat_';
    },
  });
  if (isCancel(ghToken)) bail();
  const GITHUB_TOKEN = ghToken || existingEnv.GITHUB_TOKEN;

  // ── Test connections ────────────────────────────────────────────────────

  const s = spinner();
  let mcp = null;
  let GITHUB_OWNER = existingEnv.GITHUB_OWNER || '';
  let NOTION_DATABASE_ID = existingEnv.NOTION_DATABASE_ID || '';

  // Test Notion
  s.start('Testing Notion connection via MCP...');
  const notionResult = await testNotion(NOTION_API_KEY);
  if (notionResult.ok) {
    mcp = notionResult.mcp;
    s.stop(`✓ Notion connected via MCP (${notionResult.toolCount} tools available)`);
  } else {
    s.stop('✗ Notion failed: ' + notionResult.error);
    log.warn('Check your Notion API key and try again.');
  }

  // Test Groq
  s.start('Testing Groq connection...');
  const groqResult = await testGroq(GROQ_API_KEY);
  if (groqResult.ok) {
    s.stop('✓ Groq connected (llama-3.3-70b-versatile)');
  } else {
    s.stop('✗ Groq failed: ' + groqResult.error);
    log.warn('Check your Groq API key and try again.');
  }

  // Test Brave
  s.start('Testing Brave Search connection...');
  const braveResult = await testBrave(BRAVE_API_KEY);
  if (braveResult.ok) {
    s.stop('✓ Brave Search connected');
  } else {
    s.stop('✗ Brave Search failed: ' + braveResult.error);
    log.warn('Check your Brave Search API key and try again.');
  }

  // Test GitHub
  s.start('Testing GitHub connection...');
  const ghResult = await testGitHub(GITHUB_TOKEN);
  if (ghResult.ok) {
    GITHUB_OWNER = ghResult.username;
    s.stop(`✓ GitHub connected as @${GITHUB_OWNER}`);
  } else {
    s.stop('✗ GitHub failed: ' + ghResult.error);
    log.warn('Check your GitHub token permissions and try again.');
  }

  // ── Set up Notion workspace ─────────────────────────────────────────────

  if (mcp) {
    // Step A: Get or ask for database ID
    if (NOTION_DATABASE_ID) {
      s.start('Verifying Notion database...');
      try {
        await mcp.callTool('API-retrieve-a-data-source', {
          data_source_id: NOTION_DATABASE_ID,
        });
        s.stop('✓ Notion database found');
      } catch {
        log.warn('Existing database ID is invalid or not shared with the integration.');
        NOTION_DATABASE_ID = '';
      }
    }

    if (!NOTION_DATABASE_ID) {
      note(
        'Create any database in Notion (even an empty one).\n' +
        'Share the page with your "ZeroToRepo" integration.\n' +
        'Grab the database ID from the URL (32-char hex after the page title).\n\n' +
        'The setup wizard will automatically add all required columns.',
        'Notion Database',
      );

      const manualId = await text({
        message: 'Paste your Notion database ID:',
        placeholder: '32-char hex string from Notion URL',
        validate: (v) => {
          if (!v) return 'Required — create a database in Notion first';
        },
      });
      if (isCancel(manualId)) bail();
      if (manualId) {
        NOTION_DATABASE_ID = manualId.replace(/-/g, '');
        s.start('Verifying database access...');
        try {
          await mcp.callTool('API-retrieve-a-data-source', {
            data_source_id: NOTION_DATABASE_ID,
          });
          s.stop('✓ Notion database verified');
        } catch (err) {
          s.stop('✗ Cannot access database: ' + err.message);
          log.warn('Make sure the database is shared with your Notion integration.');
        }
      }
    }

    // Step B: Auto-configure database columns and status options
    if (NOTION_DATABASE_ID) {
      s.start('Configuring database columns & status options...');
      try {
        // Retrieve current schema
        const dbInfo = await mcp.callTool('API-retrieve-a-data-source', {
          data_source_id: NOTION_DATABASE_ID,
        });
        const existingProps = dbInfo.properties || {};
        const existingNames = Object.keys(existingProps);

        // Step B1: Rename the default title column to "Name" if needed
        const titleProp = Object.entries(existingProps).find(([, v]) => v.type === 'title');
        if (titleProp && titleProp[0] !== 'Name') {
          const oldTitleName = titleProp[0];
          await mcp.callTool('API-update-a-data-source', {
            data_source_id: NOTION_DATABASE_ID,
            properties: { [oldTitleName]: { name: 'Name' } },
          });
          log.info(`Renamed "${oldTitleName}" → "Name"`);
        }

        // Step B2: Add columns one-by-one in the desired order:
        // Description → Trigger → Status → GitHub URL
        let added = [];

        // 1. Description (rich_text)
        if (!existingNames.includes('Description')) {
          await mcp.callTool('API-update-a-data-source', {
            data_source_id: NOTION_DATABASE_ID,
            properties: { 'Description': { rich_text: {} } },
          });
          added.push('Description');
        }

        // 2. Trigger (checkbox)
        if (!existingNames.includes('Trigger')) {
          await mcp.callTool('API-update-a-data-source', {
            data_source_id: NOTION_DATABASE_ID,
            properties: { 'Trigger': { checkbox: {} } },
          });
          added.push('Trigger');
        }

        // 3. Status (status with pipeline options)
        if (!existingNames.includes('Status')) {
          await mcp.callTool('API-update-a-data-source', {
            data_source_id: NOTION_DATABASE_ID,
            properties: {
              'Status': {
                status: {
                  options: [
                    { name: 'Idea', color: 'default' },
                    { name: 'Researching', color: 'blue' },
                    { name: 'Planning', color: 'purple' },
                    { name: 'Building', color: 'orange' },
                    { name: 'Done', color: 'green' },
                    { name: 'Error', color: 'red' },
                  ],
                },
              },
            },
          });
          added.push('Status');
        } else if (existingProps['Status']?.type === 'status') {
          // Status exists — ensure our pipeline options are present
          const currentOptions = (existingProps['Status'].status?.options || []).map((o) => o.name);
          const needed = ['Idea', 'Researching', 'Planning', 'Building', 'Done', 'Error'];
          const missingOptions = needed.filter((n) => !currentOptions.includes(n));
          if (missingOptions.length > 0) {
            const allOptions = [
              ...(existingProps['Status'].status?.options || []),
              ...missingOptions.map((name) => {
                const colors = { Idea: 'default', Researching: 'blue', Planning: 'purple', Building: 'orange', Done: 'green', Error: 'red' };
                return { name, color: colors[name] || 'default' };
              }),
            ];
            await mcp.callTool('API-update-a-data-source', {
              data_source_id: NOTION_DATABASE_ID,
              properties: { 'Status': { status: { options: allOptions } } },
            });
            added.push(`Status options (${missingOptions.join(', ')})`);
          }
        }

        // 4. GitHub URL (url)
        if (!existingNames.includes('GitHub URL')) {
          await mcp.callTool('API-update-a-data-source', {
            data_source_id: NOTION_DATABASE_ID,
            properties: { 'GitHub URL': { url: {} } },
          });
          added.push('GitHub URL');
        }

        if (added.length > 0) {
          s.stop(`✓ Database configured — added: ${added.join(', ')}`);
        } else {
          s.stop('✓ Database already has all required columns');
        }

        // Verify final schema
        const requiredCols = ['Status', 'Trigger'];
        const finalCheck = await mcp.callTool('API-retrieve-a-data-source', {
          data_source_id: NOTION_DATABASE_ID,
        });
        const finalProps = Object.keys(finalCheck.properties || {});
        const stillMissing = requiredCols.filter((p) => !finalProps.includes(p));
        if (stillMissing.length > 0) {
          log.warn(`Could not add: ${stillMissing.join(', ')} — add manually in Notion.`);
        } else {
          log.info('All required columns verified ✓');
        }
      } catch (err) {
        s.stop('⚠ Column setup had issues: ' + err.message);
        log.warn('You may need to add columns manually: Status (status), Trigger (checkbox), Description (rich text), GitHub URL (url)');
      }
    }

    await mcp.close().catch(() => {});
  }

  // ── Write .env ──────────────────────────────────────────────────────────

  const envContent = [
    '# ZeroToRepo — Environment Configuration',
    '# Generated by setup wizard',
    '',
    '# Notion (notion.so/my-integrations)',
    `NOTION_API_KEY=${NOTION_API_KEY}`,
    `NOTION_DATABASE_ID=${NOTION_DATABASE_ID}`,
    '',
    '# Groq (console.groq.com)',
    `GROQ_API_KEY=${GROQ_API_KEY}`,
    '',
    '# Brave Search (brave.com/search/api)',
    `BRAVE_API_KEY=${BRAVE_API_KEY}`,
    '',
    '# GitHub (github.com/settings/tokens)',
    `GITHUB_TOKEN=${GITHUB_TOKEN}`,
    `GITHUB_OWNER=${GITHUB_OWNER}`,
    '',
  ].join('\n');

  fs.writeFileSync(ENV_PATH, envContent);
  log.success('.env written successfully');

  // ── Summary ─────────────────────────────────────────────────────────────

  const allGood = notionResult.ok && groqResult.ok && braveResult.ok && ghResult.ok && NOTION_DATABASE_ID;

  if (allGood) {
    outro('✅ You\'re ready! Run `npm start` to begin watching for new projects.');
  } else {
    const issues = [];
    if (!notionResult.ok) issues.push('Notion connection failed');
    if (!groqResult.ok) issues.push('Groq connection failed');
    if (!braveResult.ok) issues.push('Brave Search connection failed');
    if (!ghResult.ok) issues.push('GitHub connection failed');
    if (!NOTION_DATABASE_ID) issues.push('No Notion database ID configured');

    log.warn(`Issues to fix:\n${issues.map((i) => `  • ${i}`).join('\n')}`);
    outro('.env saved — fix the issues above and run `node scripts/setup.js` again.');
  }
}

main().catch((err) => {
  console.error('\n💥 Setup error:', err.message);
  process.exit(1);
});
