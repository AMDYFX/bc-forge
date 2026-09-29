#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const component = process.argv[2];
const componentMap = {
  react: 'react/CHANGELOG.md',
  indexer: 'indexer/CHANGELOG.md',
};

const changelogPath = componentMap[component]
  ? resolve(process.cwd(), componentMap[component])
  : null;

if (!changelogPath) {
  console.error(
    'Usage: node scripts/release-notes.mjs <react|indexer>\n'
      + 'Available components: react, indexer',
  );
  process.exit(1);
}

if (!existsSync(changelogPath)) {
  console.error(`Missing changelog for ${component}: ${changelogPath}`);
  process.exit(1);
}

const content = readFileSync(changelogPath, 'utf8');
const lines = content.split(/\r?\n/);
const versionLineIndex = lines.findIndex((line) => /^##\s+\[?\d+\.\d+\.\d+\]?/.test(line));

if (versionLineIndex === -1) {
  console.log('No published changes recorded yet.');
  process.exit(0);
}

const endIndex = lines.findIndex((line, index) => index > versionLineIndex && /^##\s+/.test(line));
const relevantLines = lines.slice(versionLineIndex, endIndex === -1 ? undefined : endIndex);
console.log(relevantLines.join('\n').trim());
