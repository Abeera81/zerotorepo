const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const config = require('./config');

let client = null;
let transport = null;

/**
 * Connect to the Notion MCP server via stdio.
 * Spawns the official @notionhq/notion-mcp-server as a child process.
 */
async function connect() {
  if (client) return client;

  transport = new StdioClientTransport({
    command: 'node',
    args: [require.resolve('@notionhq/notion-mcp-server/bin/cli.mjs')],
    env: {
      ...process.env,
      NOTION_TOKEN: config.notion.apiKey,
    },
  });

  client = new Client(
    { name: 'zerotorepo', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  return client;
}

/**
 * Call a tool on the Notion MCP server.
 */
async function callTool(toolName, args) {
  const c = await connect();
  const result = await c.callTool({ name: toolName, arguments: args });

  // MCP returns content array — extract text
  if (result.content && Array.isArray(result.content)) {
    const textParts = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text);
    const text = textParts.join('');

    // Try to parse as JSON, fall back to raw text
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}

/**
 * List all available tools on the Notion MCP server.
 */
async function listTools() {
  const c = await connect();
  const result = await c.listTools();
  return result.tools;
}

/**
 * Disconnect from the Notion MCP server.
 */
async function disconnect() {
  if (client) {
    await client.close();
    client = null;
    transport = null;
  }
}

module.exports = { connect, callTool, listTools, disconnect };
