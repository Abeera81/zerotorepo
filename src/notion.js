const { Client } = require('@notionhq/client');
const config = require('./config');

const notion = new Client({ auth: config.notion.apiKey });

/**
 * Poll the Notion database for pages with Trigger=true and Status=Idea.
 * Returns the first matching page or null.
 */
async function pollForTrigger() {
  const response = await notion.databases.query({
    database_id: config.notion.databaseId,
    filter: {
      and: [
        { property: 'Trigger', checkbox: { equals: true } },
        { property: 'Status', status: { equals: 'Idea' } },
      ],
    },
    page_size: 1,
  });
  return response.results.length > 0 ? response.results[0] : null;
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
 */
async function updateStatus(pageId, status) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Status: { status: { name: status } },
    },
  });
}

/**
 * Create a child page under the given parent with markdown-like content.
 * Notion blocks are limited to 2000 chars each, so we chunk the content.
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

  const page = await notion.pages.create({
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
 */
async function setGitHubUrl(pageId, url) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      'GitHub URL': { url },
    },
  });
}

/**
 * Uncheck the Trigger checkbox to prevent re-processing.
 */
async function resetTrigger(pageId) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Trigger: { checkbox: false },
    },
  });
}

/**
 * Check if a sub-page with the given title already exists under a parent.
 */
async function subPageExists(parentId, title) {
  const children = await notion.blocks.children.list({ block_id: parentId, page_size: 50 });
  return children.results.some(
    (block) =>
      block.type === 'child_page' &&
      block.child_page &&
      block.child_page.title === title
  );
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
};
