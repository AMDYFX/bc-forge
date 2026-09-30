#!/usr/bin/env node
/**
 * Idempotent publish check (#1036).
 *
 * Before publish, query npm for the exact version in package.json.
 * - Not on npm: this run may publish (exit 0).
 * - On npm and the normalized tarball digest matches: the immutable artifact
 *   is already there. Exit 0. A rerun must not publish again.
 * - On npm, digest differs, and gitHead is this commit: fail. The registry
 *   has different bytes for the artifact this commit would publish.
 * - On npm, digest differs, and gitHead is another commit: exit 0. That
 *   version was published from somewhere else and must stay immutable.
 *   Changesets will not republish it. Later commits on main are not a
 *   republish of this commit.
 *
 * This repository's release workflow does not push container images to GHCR
 * (see docs/RELEASE_CHECKLIST.md). There is no GHCR digest to compare. A
 * workflow that later pushes to GHCR must compare the local image digest to
 * the registry manifest and fail on mismatch before docker push.
 *
 * Reruns: concurrency groups use cancel-in-progress: false, so a second run
 * waits instead of cancelling a publish that has started. When it proceeds,
 * a matching digest is a no-op and a conflicting digest fails the job.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPONENTS = [
  { id: 'sdk', dir: 'sdk', name: '@bc-forge/sdk' },
  { id: 'cli', dir: 'cli', name: '@bc-forge/cli' },
  { id: 'react', dir: 'react', name: '@bc-forge/react' },
];

export function classifyPublishedArtifact({ remote, localDigest, remoteDigest, head }) {
  if (!remote) return 'publish';
  if (localDigest && remoteDigest && localDigest === remoteDigest) return 'skip-match';
  if (remote.gitHead && head && remote.gitHead !== head) return 'skip-other-commit';
  return 'mismatch';
}

function parseArgs(argv) {
  let component = '';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--component') component = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return component;
}

function npmView(spec) {
  try {
    const stdout = execFileSync('npm', ['view', spec, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(stdout);
    if (!parsed || parsed.error || !parsed.version) return null;
    return parsed;
  } catch (error) {
    const text = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    if (text.includes('E404') || text.includes('404')) return null;
    throw error;
  }
}

function walkFiles(dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

export function normalizedDigest(tarball) {
  const dest = mkdtempSync(path.join(tmpdir(), 'bc-forge-artifact-'));
  try {
    execFileSync('tar', ['-xzf', tarball, '-C', dest], { stdio: 'ignore' });
    const root = path.join(dest, 'package');
    const hash = createHash('sha256');
    for (const file of walkFiles(root)) {
      const rel = path.relative(root, file).replaceAll('\\', '/');
      hash.update(rel);
      hash.update('\0');
      if (rel === 'package.json') {
        const manifest = JSON.parse(readFileSync(file, 'utf8'));
        delete manifest.gitHead;
        hash.update(JSON.stringify(manifest));
      } else {
        hash.update(readFileSync(file));
      }
    }
    return hash.digest('hex');
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

function pack(packageDir) {
  const dest = mkdtempSync(path.join(tmpdir(), 'bc-forge-pack-'));
  const stdout = execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', dest],
    { cwd: packageDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const parsed = JSON.parse(stdout);
  const filename = (Array.isArray(parsed) ? parsed[0] : parsed).filename;
  return path.join(dest, filename);
}

function download(url) {
  const dest = mkdtempSync(path.join(tmpdir(), 'bc-forge-remote-'));
  const file = path.join(dest, 'remote.tgz');
  execFileSync('curl', ['-fsSL', '-o', file, url], { stdio: 'ignore' });
  return file;
}

function headSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function checkComponent(repoRoot, component, head) {
  const packageDir = path.join(repoRoot, component.dir);
  const manifest = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const spec = `${component.name}@${manifest.version}`;
  const remote = npmView(spec);
  if (!remote) {
    console.log(`${spec} is not on npm; publish may continue`);
    return;
  }
  const localPack = pack(packageDir);
  const localDigest = normalizedDigest(localPack);
  const remotePack = download(remote.dist.tarball);
  const remoteDigest = normalizedDigest(remotePack);
  const action = classifyPublishedArtifact({
    remote,
    localDigest,
    remoteDigest,
    head,
  });
  if (action === 'skip-match') {
    console.log(`${spec} already matches the registry digest; rerun is a no-op`);
    return;
  }
  if (action === 'skip-other-commit') {
    console.log(
      `${spec} is on npm from gitHead ${remote.gitHead}, not ${head}. Leaving the immutable version in place.`,
    );
    return;
  }
  throw new Error(
    `${spec} digest mismatch (local ${localDigest}, registry ${remoteDigest}, gitHead ${remote.gitHead || 'none'})`,
  );
}

function main() {
  const selected = parseArgs(process.argv.slice(2));
  const components = selected
    ? COMPONENTS.filter((component) => component.id === selected)
    : COMPONENTS;
  if (components.length === 0) throw new Error(`unknown component ${selected}`);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const head = headSha();
  for (const component of components) checkComponent(repoRoot, component, head);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}
