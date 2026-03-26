const { intro, outro, spinner, log, isCancel } = require('@clack/prompts');
const config = require('./config');
const { pollForTrigger, extractTitle, updateStatus, resetTrigger, disconnect } = require('./notion');
const { processIdea, PhaseError } = require('./stateMachine');

const useMock = process.argv.includes('--mock');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  intro('🚀 ZeroToRepo — Idea to GitHub in seconds');

  if (useMock) {
    log.warn('Running in MOCK mode — no real API calls will be made.');
  }

  log.info(`Polling Notion database every ${config.polling.intervalMs / 1000}s...`);
  log.info('Waiting for a triggered idea (Trigger=✅, Status=Idea)...\n');

  const s = spinner();

  // Main polling loop
  while (true) {
    try {
      let page;

      if (useMock) {
        // In mock mode, create a fake page after a short delay
        await sleep(2000);
        page = createMockPage();
      } else {
        page = await pollForTrigger();
      }

      if (page) {
        const projectName = extractTitle(page);
        log.success(`Found triggered idea: "${projectName}"`);

        try {
          const result = await processIdea(page, {
            useMock,
            onPhaseStart: (phase) => {
              s.start(`${getPhaseEmoji(phase)} ${phase}...`);
            },
            onPhaseEnd: (phase, status) => {
              s.stop(`${getPhaseEmoji(phase)} ${phase} — ${status}`);
            },
          });

          log.success(`\n✅ "${projectName}" is ready!`);
          log.info(`   📂 Repo: ${result.repoUrl}`);
          log.info(`   📋 Issues: ${result.roadmap?.issueUrls?.length || result.roadmap?.tasks?.length || 0} tasks created`);

          if (useMock) {
            outro('Mock run complete. Exiting.');
            process.exit(0);
          }
        } catch (err) {
          const phase = err instanceof PhaseError ? err.phase : 'Pipeline';
          s.stop(`❌ Failed at ${phase}`);
          log.error(`Pipeline error at "${phase}": ${err.message}`);

          if (!useMock) {
            try {
              await updateStatus(page.id, 'Error');
              await resetTrigger(page.id);
            } catch {
              // Best effort
            }
          }
          log.warn('Fix the issue and re-trigger the idea in Notion.\n');
        }
      }
    } catch (err) {
      if (err instanceof PhaseError) {
        // Already handled above
      } else {
        log.error(`Polling error: ${err.message}`);
      }
    }

    if (!useMock) {
      await sleep(config.polling.intervalMs);
    }
  }
}

function getPhaseEmoji(phase) {
  const emojis = {
    Research: '🔍',
    Scaffold: '🏗️',
    Roadmap: '📋',
    Brief: '📝',
  };
  return emojis[phase] || '⚙️';
}

function createMockPage() {
  return {
    id: 'mock-page-id',
    properties: {
      Name: {
        title: [{ plain_text: 'My Awesome Hackathon Project' }],
      },
      Description: {
        rich_text: [{ plain_text: 'A tool that solves a real problem in an innovative way.' }],
      },
      Status: { status: { name: 'Idea' } },
      Trigger: { checkbox: true },
      'GitHub URL': { url: null },
    },
  };
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err.message);
  disconnect().finally(() => process.exit(1));
});

// Graceful shutdown — disconnect MCP server
process.on('SIGINT', () => {
  disconnect().finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
  disconnect().finally(() => process.exit(0));
});
