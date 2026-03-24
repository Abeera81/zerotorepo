const { Octokit } = require('@octokit/rest');
const config = require('./config');

const octokit = new Octokit({ auth: config.github.token });
const owner = config.github.owner;

/**
 * Create a private GitHub repository.
 */
async function createRepo(name) {
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  const { data } = await octokit.repos.createForAuthenticatedUser({
    name: safeName,
    private: true,
    auto_init: true, // creates initial commit with empty README
    description: `Auto-scaffolded by ZeroToRepo`,
  });

  return { repoUrl: data.html_url, owner: data.owner.login, repo: data.name };
}

/**
 * Ghost commit: write multiple files to a repo in a single atomic commit
 * using the GitHub Git Data API (no local clone needed).
 */
async function ghostCommit(repoOwner, repo, files, message = 'feat: initial scaffold by ZeroToRepo') {
  // 1. Get the current commit SHA on main
  const { data: refData } = await octokit.git.getRef({
    owner: repoOwner,
    repo,
    ref: 'heads/main',
  });
  const latestCommitSha = refData.object.sha;

  // 2. Get the tree SHA from that commit
  const { data: commitData } = await octokit.git.getCommit({
    owner: repoOwner,
    repo,
    commit_sha: latestCommitSha,
  });
  const baseTreeSha = commitData.tree.sha;

  // 3. Create blobs for each file
  const tree = [];
  for (const file of files) {
    const { data: blobData } = await octokit.git.createBlob({
      owner: repoOwner,
      repo,
      content: Buffer.from(file.content).toString('base64'),
      encoding: 'base64',
    });
    tree.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha,
    });
  }

  // 4. Create a new tree
  const { data: newTree } = await octokit.git.createTree({
    owner: repoOwner,
    repo,
    base_tree: baseTreeSha,
    tree,
  });

  // 5. Create a new commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner: repoOwner,
    repo,
    message,
    tree: newTree.sha,
    parents: [latestCommitSha],
  });

  // 6. Update the ref to point to the new commit
  await octokit.git.updateRef({
    owner: repoOwner,
    repo,
    ref: 'heads/main',
    sha: newCommit.sha,
  });
}

/**
 * Generate the default scaffold files for a new project.
 */
function generateScaffoldFiles(projectName, description, gapSummary) {
  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return [
    {
      path: 'README.md',
      content: `# ${projectName}\n\n${description || 'A new project scaffolded by ZeroToRepo.'}\n\n## Competitive Landscape\n\n${gapSummary || 'Research pending.'}\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n`,
    },
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: safeName,
          version: '0.1.0',
          description: description || projectName,
          main: 'src/index.js',
          scripts: {
            start: 'node src/index.js',
            test: 'echo "Error: no test specified" && exit 1',
          },
          license: 'MIT',
        },
        null,
        2
      ) + '\n',
    },
    {
      path: '.gitignore',
      content: 'node_modules/\n.env\n*.log\n.DS_Store\nThumbs.db\n',
    },
    {
      path: 'src/index.js',
      content: `// TODO: Start building ${projectName}\nconsole.log('Welcome to ${projectName}!');\n`,
    },
  ];
}

/**
 * Ensure priority labels exist on the repo, then create issues from tasks.
 */
async function createIssues(repoOwner, repo, tasks) {
  const labels = [
    { name: 'priority: high', color: 'd73a4a' },
    { name: 'priority: medium', color: 'fbca04' },
    { name: 'priority: low', color: '0e8a16' },
    { name: 'setup', color: 'c5def5' },
    { name: 'feature', color: 'a2eeef' },
    { name: 'research', color: 'bfdadc' },
    { name: 'infra', color: 'e4e669' },
    { name: 'docs', color: '0075ca' },
  ];

  // Create labels (ignore if already exist)
  for (const label of labels) {
    try {
      await octokit.issues.createLabel({ owner: repoOwner, repo, ...label });
    } catch (err) {
      if (err.status !== 422) throw err; // 422 = already exists
    }
  }

  const issueUrls = [];
  for (const task of tasks) {
    const taskLabels = [`priority: ${task.priority}`];
    if (task.label) taskLabels.push(task.label);

    const { data } = await octokit.issues.create({
      owner: repoOwner,
      repo,
      title: task.title,
      body: task.description || '',
      labels: taskLabels,
    });
    issueUrls.push(data.html_url);
  }
  return issueUrls;
}

module.exports = { createRepo, ghostCommit, generateScaffoldFiles, createIssues };
