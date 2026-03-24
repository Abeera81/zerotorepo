const { Client } = require('@notionhq/client');

// Load env directly since this is a standalone script
require('dotenv').config();

const REQUIRED = ['NOTION_API_KEY', 'NOTION_DATABASE_ID'];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(1);
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

async function resetDatabase() {
  console.log('🔄 Resetting Notion database...\n');

  const { results } = await notion.databases.query({ database_id: databaseId });
  console.log(`Found ${results.length} pages.\n`);

  for (const page of results) {
    const title = page.properties.Name?.title?.map((t) => t.plain_text).join('') || 'Untitled';
    console.log(`Resetting "${title}"...`);

    // Reset properties
    await notion.pages.update({
      page_id: page.id,
      properties: {
        Status: { status: { name: 'Idea' } },
        Trigger: { checkbox: false },
        'GitHub URL': { url: null },
      },
    });

    // Delete child sub-pages (Research, Brief)
    const children = await notion.blocks.children.list({ block_id: page.id, page_size: 50 });
    for (const block of children.results) {
      if (block.type === 'child_page') {
        console.log(`  Deleting sub-page: "${block.child_page.title}"`);
        await notion.blocks.delete({ block_id: block.id });
      }
    }
  }

  console.log('\n✅ Database reset complete!');
}

resetDatabase().catch((err) => {
  console.error('❌ Reset failed:', err.message);
  process.exit(1);
});
