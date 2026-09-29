import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reactDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(reactDir, '..');
const sdkDir = path.resolve(rootDir, 'sdk');
const consumerDir = path.resolve(reactDir, 'test-consumer');

function run(command, cwd, quiet = true) {
  return execSync(command, {
    cwd,
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf-8',
  });
}

console.log('Building SDK and React packages...');
run('npm run build', sdkDir, false);
run('npm run build', reactDir, false);

console.log('Packing SDK and React tarballs...');
const sdkPackResult = JSON.parse(run('npm pack --json --ignore-scripts', sdkDir));
const sdkTarball = path.join(sdkDir, sdkPackResult[0].filename);

const reactPackResult = JSON.parse(run('npm pack --json --ignore-scripts', reactDir));
const reactTarball = path.join(reactDir, reactPackResult[0].filename);

try {
  console.log('Installing packed tarball and supported peers into react/test-consumer...');
  run(`npm install --no-save "${sdkTarball}" "${reactTarball}"`, consumerDir, false);

  console.log('Running production build in react/test-consumer...');
  run('npm run build', consumerDir, false);

  const bundlePath = path.join(consumerDir, 'dist', 'bundle.js');
  if (!existsSync(bundlePath)) {
    throw new Error('Production build failed to generate dist/bundle.js');
  }

  console.log('Positive test passed: Production build succeeded consuming packed tarball.');

  // Negative test 1: Missing export must fail the build
  console.log('Testing negative case: Missing export...');
  const indexPath = path.join(consumerDir, 'src', 'index.tsx');
  const originalIndexContent = readFileSync(indexPath, 'utf-8');
  const badExportContent = originalIndexContent.replace(
    "import { Badge, Alert, useWallet, useBcForgeToken } from '@bc-forge/react';",
    "import { Badge, NonExistentComponent } from '@bc-forge/react';\nconsole.log(NonExistentComponent);"
  );

  let missingExportFailed = false;
  try {
    writeFileSync(indexPath, badExportContent, 'utf-8');
    run('npm run build', consumerDir, true);
  } catch (err) {
    missingExportFailed = true;
    console.log('Negative test passed: Missing export correctly failed the build.');
  } finally {
    writeFileSync(indexPath, originalIndexContent, 'utf-8');
  }

  if (!missingExportFailed) {
    throw new Error('Expected build to fail for missing export, but it succeeded!');
  }

  // Negative test 2: Missing peer declaration / missing peer import must fail
  console.log('Testing negative case: Invalid peer import...');
  const badPeerContent = "import { Badge } from '@bc-forge/react';\nimport { InvalidPeer } from 'non-existent-peer';\nconsole.log(Badge, InvalidPeer);";
  let missingPeerFailed = false;
  try {
    writeFileSync(indexPath, badPeerContent, 'utf-8');
    run('npm run build', consumerDir, true);
  } catch (err) {
    missingPeerFailed = true;
    console.log('Negative test passed: Missing peer dependency correctly failed the build.');
  } finally {
    writeFileSync(indexPath, originalIndexContent, 'utf-8');
  }

  if (!missingPeerFailed) {
    throw new Error('Expected build to fail for invalid peer dependency, but it succeeded!');
  }

  console.log('All React package consumer smoke tests passed successfully!');
} finally {
  rmSync(sdkTarball, { force: true });
  rmSync(reactTarball, { force: true });
  rmSync(path.join(consumerDir, 'dist'), { recursive: true, force: true });
}
