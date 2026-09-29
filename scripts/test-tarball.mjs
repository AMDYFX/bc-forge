import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirs = {
  "@bc-forge/sdk": "sdk",
  "@bc-forge/cli": "cli",
  "@bc-forge/react": "react",
};

const ALLOWED = [
  /^package\/package\.json$/,
  /^package\/README\.md$/,
  /^package\/LICENSE$/,
  /^package\/dist\/.+$/,
];

function run(command, cwd) {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "inherit"] }).toString();
}

for (const [name, dir] of Object.entries(dirs)) {
  const pkgDir = path.join(root, dir);
  const packed = JSON.parse(run("npm pack --json --ignore-scripts", pkgDir));
  const entry = packed[0];
  const tarball = path.join(pkgDir, entry.filename);

  let sdkTarball = null;
  if (dir !== "sdk") {
    const sdkPkgDir = path.join(root, "sdk");
    const sdkPacked = JSON.parse(run("npm pack --json --ignore-scripts", sdkPkgDir));
    sdkTarball = path.join(sdkPkgDir, sdkPacked[0].filename);
  }

  const listed = run(`tar -tf "${entry.filename}"`, pkgDir)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rejected = listed.filter((file) => !ALLOWED.some((pattern) => pattern.test(file)));
  if (rejected.length > 0) {
    console.error(`${name} tarball is outside the allowlist:`);
    for (const file of rejected) console.error(`  ${file}`);
    rmSync(tarball, { force: true });
    if (sdkTarball) rmSync(sdkTarball, { force: true });
    process.exit(1);
  }

  const consumer = mkdtempSync(path.join(tmpdir(), "bc-forge-consumer-"));
  try {
    run("npm init -y", consumer);
    const toInstall = sdkTarball ? `"${sdkTarball}" "${tarball}"` : `"${tarball}"`;
    run(`npm install ${toInstall}`, consumer);
    const importCheck = dir === "cli"
      ? `process.argv = ["node", "cli", "--help"]; import("${name}").catch(() => process.exit(0));`
      : `import("${name}").then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });`;
    execSync(`node --input-type=module -e ${JSON.stringify(importCheck)}`, {
      cwd: consumer,
      stdio: "inherit",
    });
    if (dir === "react") {
      execSync("node react/test-consumer/run-smoke-test.mjs", {
        cwd: root,
        stdio: "inherit",
      });
    }
    console.log(`${name} tarball allowlist and consumer import passed.`);
  } finally {
    rmSync(consumer, { recursive: true, force: true });
    rmSync(tarball, { force: true });
    if (sdkTarball) rmSync(sdkTarball, { force: true });
  }
}
