// Load env directly since this is a standalone script
require('dotenv').config();

const REQUIRED = ['NOTION_API_KEY', 'NOTION_DATABASE_ID'];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(1);
}

const mcpClient = require('../src/mcp-client');
const databaseId = process.env.NOTION_DATABASE_ID;

async function resetDatabase() {
  console.log('🔄 Resetting Notion database via MCP...\n');

  const response = await mcpClient.callTool('API-query-data-source', {
    data_source_id: databaseId,
  });
  const results = response.results || [];
  console.log(`Found ${results.length} pages.\n`);

  for (const page of results) {
    const title = page.properties.Name?.title?.map((t) => t.plain_text).join('') || 'Untitled';
    console.log(`Resetting "${title}"...`);

    // Reset properties
    await mcpClient.callTool('API-patch-page', {
      page_id: page.id,
      properties: {
        Status: { status: { name: 'Idea' } },
        Trigger: { checkbox: false },
        'GitHub URL': { url: null },
      },
    });

    // Delete child sub-pages (Research, Brief)
    const children = await mcpClient.callTool('API-get-block-children', {
      block_id: page.id,
      page_size: 50,
    });
    for (const block of (children.results || [])) {
      if (block.type === 'child_page') {
        console.log(`  Deleting sub-page: "${block.child_page.title}"`);
        await mcpClient.callTool('API-delete-a-block', { block_id: block.id });
      }
    }
  }

  console.log('\n✅ Database reset complete!');
  await mcpClient.disconnect();
}

resetDatabase().catch(async (err) => {
  console.error('❌ Reset failed:', err.message);
  await mcpClient.disconnect();
  process.exit(1);
});
