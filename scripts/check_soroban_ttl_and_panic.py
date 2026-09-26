#!/usr/bin/env python3
"""Lint that public Soroban contract functions extend TTL and avoid unnecessary panics (#959).

Soroban contract entries expire if TTL is not bumped on access. State-changing
public functions must call a TTL extension helper (e.g., `extend_instance_ttl` or
`extend_storage_ttl_for_key`) or be documented in an allowlist. Additionally,
public endpoints returning a `Result` should return contract error enums rather
than raising unhandled panics.

Usage:
    python3 scripts/check_soroban_ttl_and_panic.py
"""

import pathlib
import sys
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Crate targets to lint
TARGET_FILES = [
    ROOT / "contracts" / "token" / "src" / "lib.rs",
    ROOT / "contracts" / "admin" / "src" / "lib.rs",
]

# Allowlisted functions that do not directly call extend_ttl (e.g., view-only or delegated calls)
# Function Name -> Reason
ALLOWLIST = {
    "admin": "Read-only getter for contract admin address",
    "supply": "Read-only getter for total supply",
    "get_max_supply": "Read-only getter for max supply",
    "get_fee_config": "Read-only getter for fee configuration",
    "get_treasury": "Read-only getter for treasury address",
    "is_proposal_ready": "Read-only query for proposal status",
    "get_nonce": "Read-only query for account nonce",
    "get_role_admin": "Read-only role hierarchy query",
    "get_role_member": "Read-only role member query",
    "get_role_member_count": "Read-only role member count query",
    "has_role": "Read-only role check function",
    "is_admin": "Read-only admin check function",
    "is_paused": "Read-only pause state check",
    "decimals": "Read-only token metadata getter",
    "name": "Read-only token name getter",
    "symbol": "Read-only token symbol getter",
    "allowance": "Read-only token allowance getter",
    "balance": "Read-only account balance getter",
    "has_admin": "Read-only check if contract admin exists",
    "get_admin_pool": "Read-only query for admin pool addresses",
    "get_threshold": "Read-only query for admin pool threshold",
    "is_zero_address": "Pure address comparison utility",
    "get_roles_bitmask": "Read-only roles bitmask calculation",
    "mask_has_role": "Pure bitmask bitwise check",
    "mask_with_role": "Pure bitmask calculation",
    "mask_without_role": "Pure bitmask calculation",
    "grant_role": "Delegates to persist_role_mask which extends storage TTL",
    "grant_role_checked": "Delegates to persist_role_mask which extends storage TTL",
    "revoke_role": "Delegates to persist_role_mask which extends storage TTL",
    "set_admin": "Delegates to set_admin helper which extends instance TTL",
    "init_storage": "Delegates to set_admin helper which extends instance TTL",
    "init_storage_with_deployer": "Delegates to set_admin helper which extends instance TTL",
    "migrate_admin": "Delegates to set_admin helper which extends instance TTL",
    "set_admin_pool": "Delegates to admin pool handler which extends storage TTL",
    "execute_upgrade": "Delegates to upgrade execution handler which extends instance TTL",
    "execute_upgrade_batch": "Delegates to upgrade execution handler which extends instance TTL",
    "submit_upgrade_proposal": "Delegates to proposal handler which extends storage TTL",
    "emergency_execute_upgrade": "Delegates to upgrade execution handler which extends instance TTL",
    "create_proposal": "Delegates to proposal creation handler which extends storage TTL",
    "approve_proposal": "Delegates to proposal approval handler which extends storage TTL",
    "mark_executed": "Delegates to proposal execution handler which extends storage TTL",
    "cancel_legacy_proposal": "Delegates to proposal cancellation handler which extends storage TTL",
    "approve_upgrade": "Delegates to upgrade approval handler which extends storage TTL",
    "cancel_proposal": "Delegates to proposal cancellation handler which extends storage TTL",
    "register_wasm_hash": "Delegates to WASM hash registration handler which extends storage TTL",
    "get_proposal_unlock_time": "Read-only query for proposal unlock timestamp",
    "require_role": "Auth/permission assertion check",
    "require_role_guard": "Auth/permission assertion check",
    "require_admin": "Auth assertion check for admin role",
    "require_minter": "Auth assertion check for minter role",
    "require_super_admin": "Auth assertion check for super admin role",
    "require_deployer": "Auth assertion check for contract deployer",
    "require_fee_admin": "Auth assertion check for fee admin role",
    "require_pauser": "Auth assertion check for pauser role",
    "is_admin_or_pauser": "Auth assertion check for admin or pauser role",
    "require_timelock_expired": "Validation check for proposal timelock",
    "require_upgrade_quorum_met": "Validation check for upgrade quorum",
    "require_valid_wasm_hash": "Validation check for WASM code hash",
    "require_non_zero_address": "Validation check rejecting zero address",
    "validate_role_not_granted": "Validation check asserting role absence",
}

# Functions allowed to panic on auth/require_auth failures
AUTH_PANIC_ALLOWLIST = {
    "require_auth",
    "require_auth_for_args",
}

TTL_PATTERNS = [
    r'extend_instance_ttl',
    r'extend_ttl',
    r'extend_storage_ttl',
    r'extend_storage_ttl_for_key',
]


def extract_pub_functions(file_path: pathlib.Path) -> list[dict]:
    content = file_path.read_text(encoding="utf-8")
    lines = content.splitlines()

    functions = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Match pub fn definition
        match = re.search(r'pub\s+fn\s+([a-z0-9_]+)\s*\(', line, re.IGNORECASE)
        if match and not line.strip().startswith("//"):
            fn_name = match.group(1)
            start_line = i + 1

            # Read function signature & body block until closing brace balance
            fn_body = []
            brace_count = 0
            found_start = False

            while i < len(lines):
                curr_line = lines[i]
                fn_body.append(curr_line)
                for char in curr_line:
                    if char == '{':
                        brace_count += 1
                        found_start = True
                    elif char == '}':
                        brace_count -= 1
                
                if found_start and brace_count == 0:
                    break
                i += 1

            body_str = "\n".join(fn_body)
            returns_result = bool(re.search(r'->\s*Result\s*<', body_str))

            functions.append({
                "name": fn_name,
                "file": file_path.relative_to(ROOT),
                "line": start_line,
                "body": body_str,
                "returns_result": returns_result,
            })
        i += 1

    return functions


def lint_contract_files() -> bool:
    all_passed = True

    for target in TARGET_FILES:
        if not target.exists():
            print(f"error: file not found {target}", file=sys.stderr)
            all_passed = False
            continue

        functions = extract_pub_functions(target)
        print(f"Linting {len(functions)} public functions in {target.relative_to(ROOT)}...")

        for fn in functions:
            fn_name = fn["name"]
            body = fn["body"]

            # 1. TTL Check for non-allowlisted functions
            has_ttl_call = any(re.search(p, body) for p in TTL_PATTERNS)
            if not has_ttl_call:
                if fn_name not in ALLOWLIST:
                    print(
                        f"❌ FAIL [{fn['file']}:{fn['line']}] '{fn_name}' "
                        f"does not call TTL helper (extend_instance_ttl) and is not in ALLOWLIST."
                    )
                    all_passed = False
                else:
                    print(f"  ✓ [{fn_name}] Allowlisted: {ALLOWLIST[fn_name]}")
            else:
                print(f"  ✓ [{fn_name}] Calls TTL extension helper")

            # 2. Avoidable panic check for functions returning Result
            if fn["returns_result"]:
                panics = [
                    m.start() for m in re.finditer(r'\bpanic!\s*\(', body)
                    if not any(auth in body[max(0, m.start()-50):m.start()] for auth in AUTH_PANIC_ALLOWLIST)
                ]
                if panics:
                    print(
                        f"⚠️ WARNING [{fn['file']}:{fn['line']}] '{fn_name}' returns Result "
                        f"but contains explicit panic! call. Consider returning contract error enum."
                    )

    return all_passed


def main() -> int:
    print("Running Soroban TTL & Panic Lint Check (#959)...")
    success = lint_contract_files()
    if not success:
        print("\n❌ Soroban TTL lint checks failed. Please fix violations above.", file=sys.stderr)
        return 1

    print("\n✅ All public contract functions satisfy TTL extension and panic guidelines!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
