const mcpClient = require('./mcp-client');
const config = require('./config');

/**
 * Poll the Notion database for pages with Trigger=true and Status=Idea or Error.
 * Uses Notion MCP server's query-data-source tool.
 */
async function pollForTrigger() {
  const response = await mcpClient.callTool('API-query-data-source', {
    data_source_id: config.notion.databaseId,
    filter: {
      and: [
        { property: 'Trigger', checkbox: { equals: true } },
        {
          or: [
            { property: 'Status', status: { equals: 'Idea' } },
            { property: 'Status', status: { equals: 'Error' } },
          ],
        },
      ],
    },
    page_size: 1,
  });
  return response.results?.length > 0 ? response.results[0] : null;
}

/**
 * Extract the title (Name property) from a Notion page.
 */
function extractTitle(page) {
  const titleProp = page.properties.Name;
  if (!titleProp || !titleProp.title || titleProp.title.length === 0) {
    return 'untitled-project';
  }
  return titleProp.title.map((t) => t.plain_text).join('');
}

/**
 * Extract the description (rich text) from a Notion page, if present.
 */
function extractDescription(page) {
  const descProp = page.properties.Description;
  if (!descProp || !descProp.rich_text || descProp.rich_text.length === 0) {
    return '';
  }
  return descProp.rich_text.map((t) => t.plain_text).join('');
}

/**
 * Update the Status property on a Notion page.
 * Uses Notion MCP server's patch-page tool.
 */
async function updateStatus(pageId, status) {
  await mcpClient.callTool('API-patch-page', {
    page_id: pageId,
    properties: {
      Status: { status: { name: status } },
    },
  });
}

/**
 * Create a child page under the given parent with markdown-like content.
 * Notion blocks are limited to 2000 chars each, so we chunk the content.
 * Uses Notion MCP server's post-page tool.
 */
async function writeSubPage(parentId, title, markdownContent) {
  const BLOCK_LIMIT = 2000;
  const chunks = [];
  for (let i = 0; i < markdownContent.length; i += BLOCK_LIMIT) {
    chunks.push(markdownContent.slice(i, i + BLOCK_LIMIT));
  }

  const children = chunks.map((chunk) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: chunk } }],
    },
  }));

  const page = await mcpClient.callTool('API-post-page', {
    parent: { page_id: parentId },
    properties: {
      title: [{ type: 'text', text: { content: title } }],
    },
    children,
  });
  return page.id;
}

/**
 * Set the GitHub URL property on a Notion page.
 * Uses Notion MCP server's patch-page tool.
 */
async function setGitHubUrl(pageId, url) {
  await mcpClient.callTool('API-patch-page', {
    page_id: pageId,
    properties: {
      'GitHub URL': { url },
    },
  });
}

/**
 * Uncheck the Trigger checkbox to prevent re-processing.
 * Uses Notion MCP server's patch-page tool.
 */
async function resetTrigger(pageId) {
  await mcpClient.callTool('API-patch-page', {
    page_id: pageId,
    properties: {
      Trigger: { checkbox: false },
    },
  });
}

/**
 * Check if a sub-page with the given title already exists under a parent.
 * Uses Notion MCP server's get-block-children tool.
 */
async function subPageExists(parentId, title) {
  const children = await mcpClient.callTool('API-get-block-children', {
    block_id: parentId,
    page_size: 50,
  });
  return (children.results || []).some(
    (block) =>
      block.type === 'child_page' &&
      block.child_page &&
      block.child_page.title === title
  );
}

/**
 * Disconnect from the Notion MCP server. Call on shutdown.
 */
async function disconnect() {
  await mcpClient.disconnect();
}

module.exports = {
  pollForTrigger,
  extractTitle,
  extractDescription,
  updateStatus,
  writeSubPage,
  setGitHubUrl,
  resetTrigger,
  subPageExists,
  disconnect,
};
