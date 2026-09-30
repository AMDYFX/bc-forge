# Release checklist

`@bc-forge/sdk`, `@bc-forge/cli`, and `@bc-forge/react` publish from
[`.github/workflows/release.yml`](../.github/workflows/release.yml) on a push to
`main`. Changesets opens the version PR, and the publish step builds each
package, sets `npm config set provenance true`, and runs `npx changeset publish`.

The workflow grants `id-token: write` so npm can verify the GitHub Actions OIDC
token. It does not pass `NODE_AUTH_TOKEN`. A long-lived npm token is not part of
the normal publish path.

## One-time npm trusted-publisher setup

Do this once per package (`@bc-forge/sdk`, `@bc-forge/cli`, `@bc-forge/react`)
in the npm organization that owns the scope:

1. Sign in to [npmjs.com](https://www.npmjs.com) as an owner of the `bc-forge` organization.
2. Open the package, then **Settings → Trusted Publisher**.
3. Add a GitHub Actions publisher:
   - Organization or user: `BCPathway`
   - Repository: `bc-forge`
   - Workflow filename: `release.yml`
   - Environment name: leave empty unless a GitHub Environment is added to the release job later
4. Save. Repeat for the other two packages.
5. Confirm **Access** is public for each package. The changesets config sets `"access": "public"`.
6. After the next release, open the package's **Versions** page and confirm the version shows a provenance attestation. The statement is also linked from the GitHub Actions run of `Release packages`.

Provenance is requested by `npm config set provenance true` before `changeset publish`. Pull requests do not publish.

## Fallback secret and rotation

Use a granular npm token only when trusted publishing is unavailable (for example, the publisher record has not been created yet).

1. On npm, create a **granular access token** that can publish only `@bc-forge/sdk`, `@bc-forge/cli`, and `@bc-forge/react`. Do not create a classic token with access to every package you own.
2. Store it as the `NPM_TOKEN` Actions secret on `BCPathway/bc-forge`.
3. In `.github/workflows/release.yml`, add `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to the Changesets step, publish the pending release, then remove that line so later releases go back to OIDC.
4. Rotate the secret after that publish, and after any exposure:
   - Revoke the token on npm (**Access Tokens → Revoke**).
   - Create a replacement granular token with the same package list.
   - Update the `NPM_TOKEN` repository secret. GitHub does not show the old value; replacing the secret is the rotation.
   - Delete the secret entirely once trusted publishing is confirmed on a release page.

Do not leave `NODE_AUTH_TOKEN` in the workflow after the fallback publish. A provenance publish that always sends a long-lived token is not trusted publishing.

## Verify a release

[`.github/workflows/publish-release-manifest.yml`](../.github/workflows/publish-release-manifest.yml) runs when a GitHub Release is published. It builds `@bc-forge/sdk`, `@bc-forge/cli`, and `@bc-forge/react`, packs each tarball, builds `bc_forge_token.wasm`, and builds the indexer image. It attaches `checksums.txt`, `manifest.json`, the three tarballs, and the token WASM to that release. `manifest.json` lists every one of those files with its component, version, filename, and SHA-256 checksum, plus the indexer image name and `containerimage.digest`.

Download `checksums.txt` and the artifacts into the same directory, then recompute the checksums.

Linux:

```bash
sha256sum -c checksums.txt
```

macOS:

```bash
shasum -a 256 -c checksums.txt
```

Windows PowerShell:

```powershell
Get-Content checksums.txt | ForEach-Object {
  $hash, $name = $_ -split '\s+', 2
  $actual = (Get-FileHash -Algorithm SHA256 -Path $name).Hash.ToLower()
  if ($actual -ne $hash) { throw "$name checksum mismatch" }
  Write-Output "$name OK"
}
```

A matching command prints `OK` for each file. A mismatch prints a checksum error and a non-zero exit status.

The indexer entry in `manifest.json` uses `digest` (`sha256:...`) rather than a filename. Compare that value to `containerimage.digest` in the "Build indexer image and record its digest" log of the release workflow. That digest is the image built for the release; it is not a GHCR pull digest, because this repository does not push the indexer image.

## Deliverable checklist

Use this list before and after a release. Migration and upgrade steps stay in [UPGRADE_GUIDE.md](./UPGRADE_GUIDE.md); do not copy them here.

### SDK (`@bc-forge/sdk`, npm)

- [ ] Version and changelog match the changeset.
- [ ] `npm test` and `npm run build` pass in `sdk/`.
- [ ] Verify: `npm view @bc-forge/sdk@<version> version` equals that version, and the release-manifest checksum matches the packed tarball.
- [ ] Rollback: do not republish the version. Deprecate it (`npm deprecate @bc-forge/sdk@<version> "reason"`) and publish a patched version. Point consumers at [UPGRADE_GUIDE.md](./UPGRADE_GUIDE.md).

### CLI (`@bc-forge/cli`, npm)

- [ ] Tests and `npm run build` pass in `cli/`.
- [ ] Verify: a clean install of that exact version runs `bc-forge --help`.
- [ ] Rollback: deprecate the bad version and publish a patch. Do not reuse the version number.

### React (`@bc-forge/react`, npm)

- [ ] `npm test` and `npm run build` pass in `react/`.
- [ ] Verify: a clean project installs the exact version and imports a component from the package.
- [ ] Rollback: deprecate the version and publish a patch. Do not unpublish.

### Indexer (service and image)

- [ ] `prisma migrate deploy` applies `indexer/prisma/migrations` in timestamp order before the process serves traffic.
- [ ] Verify: `GET /health` is ok and `GET /healthz` lag matches the indexer runbook.
- [ ] Rollback: redeploy the previous image digest. If the new schema cannot be read by that image, restore the database backup taken before the migration.

### Contract WASM

- [ ] The token WASM build is within budget and the release manifest records its checksum.
- [ ] Verify: the installed bytecode hash matches the manifest.
- [ ] Rollback: redeploy the previous WASM only when [UPGRADE_GUIDE.md](./UPGRADE_GUIDE.md) says that contract allows it. Otherwise pause and follow that guide.

### Docs

- [ ] `npm run docs:build` passes.
- [ ] Verify: the published site matches the release commit.
- [ ] Rollback: revert the docs commit and redeploy the previous site build. Package and WASM rollbacks stay on their own artifacts.

npm versions and published WASM are immutable, so their rollback is a new version plus deprecation or a documented contract downgrade. Images and the database roll back to a previous digest or backup.
