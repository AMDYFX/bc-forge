import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const KNOWN_PACKAGES = {
  sdk: 'sdk/package.json',
  cli: 'cli/package.json',
  react: 'react/package.json',
  indexer: 'indexer/package.json',
};

/**
 * Validates a Git release tag against package.json manifests and registry state.
 *
 * @param {string} tagInput - Raw Git tag string (e.g. "sdk@0.1.0" or "refs/tags/cli@0.1.0")
 * @param {object} [options]
 * @param {string} [options.rootDir] - Absolute path to repository root
 * @param {function} [options.checkRegistry] - Custom function to check registry publication
 * @returns {{ success: boolean, component: string, version: string, packageName: string, message: string }}
 */
export function validateVersionTag(tagInput, options = {}) {
  const currentFilePath = fileURLToPath(import.meta.url);
  const rootDir = options.rootDir || path.resolve(path.dirname(currentFilePath), '..');

  if (!tagInput || typeof tagInput !== 'string' || !tagInput.trim()) {
    throw new Error('No tag provided. Expected format: <component>@<version> (e.g. sdk@1.2.3)');
  }

  let tag = tagInput.trim();
  if (tag.startsWith('refs/tags/')) {
    tag = tag.slice('refs/tags/'.length);
  }

  const atIndex = tag.indexOf('@');
  const lastAtIndex = tag.lastIndexOf('@');

  if (atIndex <= 0 || atIndex !== lastAtIndex || atIndex === tag.length - 1) {
    throw new Error(`Malformed tag format: "${tagInput}". Expected format: <component>@<version> (e.g. sdk@1.2.3, cli@0.5.0, react@2.0.1)`);
  }

  const component = tag.slice(0, atIndex);
  const version = tag.slice(atIndex + 1);

  if (!KNOWN_PACKAGES[component]) {
    throw new Error(`Unknown component "${component}". Known components: ${Object.keys(KNOWN_PACKAGES).join(', ')}`);
  }

  const packageJsonRelPath = KNOWN_PACKAGES[component];
  const packageJsonPath = path.resolve(rootDir, packageJsonRelPath);

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Package manifest not found at ${packageJsonPath}`);
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse package manifest at ${packageJsonPath}: ${err.message}`);
  }

  const manifestVersion = packageJson.version;
  const packageName = packageJson.name;

  if (!manifestVersion) {
    throw new Error(`Missing "version" field in package manifest at ${packageJsonRelPath}`);
  }

  if (version !== manifestVersion) {
    throw new Error(`Tag version "${version}" does not match package.json version "${manifestVersion}" for component "${component}" (${packageJsonRelPath})`);
  }

  const checkRegistry = options.checkRegistry || defaultCheckRegistry;
  const isPublished = checkRegistry(packageName, version);

  if (isPublished) {
    throw new Error(`Version "${version}" of package "${packageName}" is already published on the registry.`);
  }

  return {
    success: true,
    component,
    version,
    packageName,
    message: `Tag "${tag}" is valid for package "${packageName}" at version "${version}".`,
  };
}

function defaultCheckRegistry(packageName, version) {
  try {
    const output = execSync(`npm view ${packageName}@${version} version`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();

    if (output && output.includes(version)) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

const currentScriptPath = path.resolve(fileURLToPath(import.meta.url));
const entryScriptPath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (entryScriptPath === currentScriptPath) {
  try {
    const rawTag = process.argv[2] || process.env.GITHUB_REF || process.env.GIT_TAG;
    const result = validateVersionTag(rawTag);
    console.log(`✓ ${result.message}`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ Version tag validation failed: ${err.message}`);
    process.exit(1);
  }
}
