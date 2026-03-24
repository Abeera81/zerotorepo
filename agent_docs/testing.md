# Testing Strategy

## Approach
ZeroToRepo is a hackathon MVP — testing is **manual smoke testing** with a structured checklist, plus a **mock mode** for offline demos. No automated test framework is included in the MVP scope.

## Mock Mode (`--mock` flag)
```bash
node src/index.js --mock
```
- Skips all external API calls (Brave, Groq, GitHub, Notion)
- Uses hardcoded realistic responses from `fixtures/` folder
- Simulates timing delays (2s per phase) for demo realism
- Prints the same CLI output as production mode
- Use for rehearsal and offline judging sessions

## Manual Smoke Test Checklist
Run these before every demo:

| # | Test | Expected Result |
|---|------|-----------------|
| 1 | Start script with valid `.env` | CLI shows "Polling…" with spinner |
| 2 | Start script with missing env var | Fails immediately with clear message |
| 3 | Check "Trigger" on a new Notion idea | Status cycles: Researching → Scaffolding → Generating Brief → Ready |
| 4 | Check GitHub after run | Repo exists with README, package.json, .gitignore, src/index.js |
| 5 | Check GitHub Issues | 7–10 issues with `priority: high/medium/low` labels |
| 6 | Check Notion sub-pages | "Research" and "Brief" sub-pages exist with real content |
| 7 | Check Notion row | `GitHub URL` populated, `Status` = Ready, `Trigger` unchecked |
| 8 | Re-trigger same idea | Idempotency: skips already-completed phases |
| 9 | Simulate API error | Status → "Error", error logged, other ideas unaffected |
| 10 | Run 3 different ideas sequentially | All 3 succeed with unique repos and content |

## Notion DB Reset Script
```bash
node scripts/reset-db.js
```
- Resets all pages: `Status` → `Idea`, `Trigger` → `false`, `GitHub URL` → empty
- Deletes all sub-pages (Research, Brief)
- Run between demo attempts for a clean slate

## Rules & Requirements
- **Before marking a task done:** Run the app and verify the expected behavior manually.
- **Failures:** NEVER skip checks or mock out behavior to make things pass without human approval. If something breaks, fix it.
- **Idempotency:** Each phase must check for prior completion before executing (see Tech Design §7.3).

## Verification Loop
After implementing each feature:
1. Run the app (`node src/index.js` or `--mock`)
2. Verify expected output in the CLI
3. Check Notion/GitHub for expected changes
4. Fix any errors before moving to the next feature
