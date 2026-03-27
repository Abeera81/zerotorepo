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
 * Parse markdown inline formatting into Notion rich_text segments.
 * Handles: **bold**, [text](url)
 */
function parseInlineFormatting(text) {
  if (!text) return [{ type: 'text', text: { content: '' } }];

  const segments = [];
  const regex = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: { content: text.slice(lastIndex, match.index) } });
    }
    if (match[1]) {
      // **bold**
      segments.push({ type: 'text', text: { content: match[1] }, annotations: { bold: true } });
    } else if (match[2]) {
      // [text](url)
      segments.push({ type: 'text', text: { content: match[2], link: { url: match[3] } } });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: { content: text.slice(lastIndex) } });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', text: { content: text } });
  }

  // Enforce 2000 char limit per rich_text element
  return segments.map((seg) => {
    if (seg.text.content.length > 2000) {
      seg.text.content = seg.text.content.slice(0, 2000);
    }
    return seg;
  });
}

/**
 * Convert markdown string into Notion block objects.
 * Handles: headings, bullets, numbered lists, quotes, dividers, and paragraphs with inline formatting.
 */
function markdownToNotionBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('### ')) {
      blocks.push({
        object: 'block', type: 'heading_3',
        heading_3: { rich_text: parseInlineFormatting(trimmed.slice(4)) },
      });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: parseInlineFormatting(trimmed.slice(3)) },
      });
    } else if (trimmed.startsWith('# ')) {
      blocks.push({
        object: 'block', type: 'heading_1',
        heading_1: { rich_text: parseInlineFormatting(trimmed.slice(2)) },
      });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({
        object: 'block', type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: parseInlineFormatting(trimmed.slice(2)) },
      });
    } else if (/^\d+\.\s/.test(trimmed)) {
      const content = trimmed.replace(/^\d+\.\s/, '');
      blocks.push({
        object: 'block', type: 'numbered_list_item',
        numbered_list_item: { rich_text: parseInlineFormatting(content) },
      });
    } else if (trimmed.startsWith('> ')) {
      blocks.push({
        object: 'block', type: 'quote',
        quote: { rich_text: parseInlineFormatting(trimmed.slice(2)) },
      });
    } else if (trimmed === '---' || trimmed === '***') {
      blocks.push({
        object: 'block', type: 'divider', divider: {},
      });
    } else if (trimmed.startsWith('|')) {
      // Skip table separator lines (|---|---|)
      if (/^\|[\s-|]+\|$/.test(trimmed)) continue;
      // Table data rows — render as paragraph preserving layout
      blocks.push({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: parseInlineFormatting(trimmed) },
      });
    } else {
      blocks.push({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: parseInlineFormatting(trimmed) },
      });
    }
  }

  // Notion API limits children to 100 blocks per request
  return blocks.slice(0, 100);
}

/**
 * Create a child page under the given parent with properly formatted Notion blocks.
 * Converts markdown to native Notion block types (headings, bullets, quotes, etc.).
 * Uses Notion MCP server's post-page tool.
 */
async function writeSubPage(parentId, title, markdownContent) {
  const children = markdownToNotionBlocks(markdownContent);

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

/**
 * Update the Description property on a Notion page with a summary string.
 */
async function updateDescription(pageId, text) {
  await mcpClient.callTool('API-patch-page', {
    page_id: pageId,
    properties: {
      Description: {
        rich_text: [{ type: 'text', text: { content: text.slice(0, 2000) } }],
      },
    },
  });
}

/**
 * Create a new page in the Notion database.
 * Returns the page object in the same shape that processIdea() expects.
 */
async function createPage(ideaName, description) {
  const page = await mcpClient.callTool('API-post-page', {
    parent: {  type: 'database_id' ,database_id: config.notion.databaseId },
    properties: {
      Name: {
        title: [{ type: 'text', text: { content: ideaName } }],
      },
      Description: {
        rich_text: description
          ? [{ type: 'text', text: { content: description.slice(0, 2000) } }]
          : [],
      },
      Status: {
        status: { name: 'Idea' },
      },
      Trigger: {
        checkbox: true,
      },
    },
  });
  return page;
}

module.exports = {
  pollForTrigger,
  extractTitle,
  extractDescription,
  updateStatus,
  updateDescription,
  writeSubPage,
  setGitHubUrl,
  resetTrigger,
  subPageExists,
  createPage,
  disconnect,
};
