# bc-forge End-to-End Integration Tests

This directory contains end-to-end integration tests for the bc-forge token and
wrapper contracts. The suite can run in two modes:

1. **Mock mode (default)** — deterministic, offline, uses `soroban_sdk`'s
   `Env::default()` with mocked auth. This is what pull-request CI runs.
2. **Testnet mode (nightly)** — runs against Stellar testnet with friendbot-funded
   accounts via the [`Nightly E2E (Testnet)`](#nightly-testnet-workflow) workflow.

## Prerequisites

- Rust 1.74+ with the `wasm32-unknown-unknown` target
- Stellar CLI 22.0+ (see [CONTRIBUTING.md](../CONTRIBUTING.md))
- Node.js (for some tooling)
- `curl` (for friendbot funding and RPC health checks)

## Running Tests

### Local Development (Mock Environment)

```bash
cargo test -p bc-forge-e2e-tests
```

Or from this directory:

```bash
cd e2e
cargo test
```

### Testnet Deployment (Requires Stellar CLI)

```bash
# Create and friendbot-fund a throwaway testnet identity
stellar keys generate e2e-local --network testnet --fund

# Export the testnet endpoint/credentials the suite reads
export STELLAR_TESTNET_RPC_URL=https://soroban-testnet.stellar.org
export STELLAR_TESTNET_PASSPHRASE="Test SDF Network ; September 2015"
export E2E_TESTNET_PUBLIC_KEY="$(stellar keys address e2e-local)"
export E2E_TESTNET_SECRET_KEY="$(stellar keys show e2e-local)"

# Run the suite
cargo test -p bc-forge-e2e-tests -- --nocapture
```

## Test Coverage

- Complete lifecycle testing (deploy → init → mint → transfer → verify)
- Token → vault → compound yield lifecycle (#740)
- Parallel execution testing
- Deployment verification

## Nightly (Testnet) Workflow

The e2e suite runs against Stellar testnet on a nightly schedule through
[`.github/workflows/e2e-nightly.yml`](../.github/workflows/e2e-nightly.yml).

| Property | Value |
| --- | --- |
| Workflow | `Nightly E2E (Testnet)` (`e2e-nightly.yml`) |
| Trigger | `schedule` — nightly at `02:00 UTC` (`0 2 * * *`); plus manual `workflow_dispatch` |
| Job | `e2e-testnet` (single job, `ubuntu-latest`, 60-minute timeout) |
| Toolchain | Rust `1.96.0` + `wasm32-unknown-unknown`; Stellar CLI `22.0.0`+ |
| Network | `https://soroban-testnet.stellar.org` (`Test SDF Network ; September 2015`) |
| Funding | Friendbot (`https://friendbot.stellar.org`) |
| Tests | `cargo test -p bc-forge-e2e-tests -- --nocapture` |

### What it does

1. Installs the pinned Rust toolchain (with the `wasm32-unknown-unknown` target)
   and Stellar CLI, and restores the dedicated `bc-forge-e2e-nightly` Rust cache.
2. Checks that the testnet Soroban RPC is reachable (`getLatestLedger`).
3. Generates two throwaway identities, funds **both** with friendbot, and verifies
   the funding landed through Horizon. The secret is registered with
   `::add-mask::` so it never appears in logs.
4. Exports `STELLAR_TESTNET_RPC_URL`, `STELLAR_TESTNET_PASSPHRASE`,
   `E2E_TESTNET_PUBLIC_KEY`, `E2E_TESTNET_SECRET_KEY` and
   `E2E_TESTNET_COUNTERPARTY_PUBLIC_KEY` for the suite.
5. Runs the e2e package tests, teeing output to `e2e-nightly.log`.
6. Uploads `e2e-nightly.log` (and the RPC health JSON) as the
   `e2e-nightly-logs-<run_id>` artifact **on failure**, retained for 14 days.

### Why it is not part of pull-request CI

Pull requests must stay fast and must not depend on the public testnet being up.
The workflow only subscribes to `schedule` and `workflow_dispatch`, so
`pull_request` CI never waits on it and it is not a required status check. It is
also cached under a separate key so a nightly run cannot evict PR caches.
