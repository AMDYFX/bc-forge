// scripts/checkReadmeTree.js
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const README_PATH = path.join(ROOT_DIR, 'README.md');

// Explicit ignore list for internal, hidden, or generated directories
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.github',
  'target',
  'coverage',
  '.turbo',
  '.next'
]);

function getActualDirectories(basePath) {
  if (!fs.existsSync(basePath)) return [];
  return fs.readdirSync(basePath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => !IGNORED_DIRS.has(name) && !name.startsWith('.'));
}

function checkReadmeTree() {
  if (!fs.existsSync(README_PATH)) {
    console.error(`[Error] README.md not found at ${README_PATH}`);
    process.exit(1);
  }

  const readmeContent = fs.readFileSync(README_PATH, 'utf8');

  const actualPackages = getActualDirectories(path.join(ROOT_DIR, 'packages'));
  const actualContracts = getActualDirectories(path.join(ROOT_DIR, 'contracts'));

  let failed = false;

  console.log('Verifying README project structure against filesystem...');

  for (const pkg of actualPackages) {
    if (!readmeContent.includes(pkg)) {
      console.error(`[Error] Package directory "${pkg}" (in packages/) is missing from README.md project structure.`);
      failed = true;
    }
  }

  for (const contract of actualContracts) {
    if (!readmeContent.includes(contract)) {
      console.error(`[Error] Contract directory "${contract}" (in contracts/) is missing from README.md project structure.`);
      failed = true;
    }
  }

  if (failed) {
    console.error('\nREADME project tree drift detected! Please update README.md or check excluded directories.');
    process.exit(1);
  } else {
    console.log('README project tree is fully up to date!');
  }
}

if (require.main === module) {
  checkReadmeTree();
}

module.exports = { checkReadmeTree, getActualDirectories };