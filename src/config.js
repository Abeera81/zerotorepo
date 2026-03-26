require('dotenv').config();

const REQUIRED = [
  'NOTION_API_KEY',
  'NOTION_DATABASE_ID',
  'GROQ_API_KEY',
  'BRAVE_API_KEY',
  'GITHUB_TOKEN',
  'GITHUB_OWNER',
];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n${missing.map((k) => `   - ${k}`).join('\n')}`);
  console.error('\nCopy .env.example to .env and fill in your keys.\n');
  process.exit(1);
}

module.exports = {
  notion: {
    apiKey: process.env.NOTION_API_KEY,
    databaseId: process.env.NOTION_DATABASE_ID,
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
  },
  brave: {
    apiKey: process.env.BRAVE_API_KEY,
  },
  github: {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER,
  },
  polling: {
    intervalMs: 5000,
  },
};
