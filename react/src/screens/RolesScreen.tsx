// SPDX-License-Identifier: MIT
import React, { useState, useEffect } from "react";
import { Role } from "@bc-forge/sdk";
import type { bcForgeClient, TransactionResult } from "@bc-forge/sdk";
import { useBcForgeClient, truncatePublicKey } from "../context";
import { useWallet } from "../hooks";
import { Alert } from "../components/Alert";
import { Badge } from "../components/Badge";
import { theme } from "../theme";
import { GrantRoleModal } from "./GrantRoleModal";
import type { GrantableRole } from "./GrantRoleModal";
import { RevokeRoleModal } from "./RevokeRoleModal";
import type { RevocableRole } from "./RevokeRoleModal";
import { exportRbacReport } from "../utils";
import type { RbacReportFormat } from "../utils";

export interface RolesScreenProps {
  /** Optional container style */
  style?: React.CSSProperties;
  /** Optional container CSS class */
  className?: string;
  /** Debounce delay in ms before a typed address is looked up. @default 400 */
  debounceMs?: number;
}

/** All RBAC roles rendered as cards and badges (#906, #1224). */
const ALL_ROLES: Role[] = [
  Role.Admin,
  Role.SuperAdmin,
  Role.Minter,
  Role.Pauser,
];

/** Description and permission summary shown on each role card (#1224). */
const ROLE_INFO: Record<string, { description: string; permissions: string }> =
  {
    [Role.Admin]: {
      description: "Contract administrator.",
      permissions: "Configure the contract and manage roles.",
    },
    [Role.SuperAdmin]: {
      description: "Highest authority.",
      permissions: "Grant and revoke every role, including other super admins.",
    },
    [Role.Minter]: {
      description: "Token issuer.",
      permissions: "Mint new tokens.",
    },
    [Role.Pauser]: {
      description: "Emergency operator.",
      permissions: "Pause and unpause the contract.",
    },
  };

/** Permission summary shown as the tooltip on each role badge (#1226). */
const ROLE_PERMISSIONS: Record<string, string> = {
  [Role.Admin]: "Admin: configures the contract and manages roles.",
  [Role.SuperAdmin]:
    "SuperAdmin: highest authority; grants and revokes every role.",
  [Role.Minter]: "Minter: can mint new tokens.",
  [Role.Pauser]: "Pauser: can pause and unpause the contract in an emergency.",
};

/** Stellar public key (G... strkey) shape check. */
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

/** Returns true when `value` is a well-formed Stellar `G...` address. */
function isValidStellarAddress(value: string): boolean {
  return STELLAR_ADDRESS.test(value);
}

/** Fetches `hasRole` for every role against `target`. */
export async function fetchRoleGrants(
  client: bcForgeClient,
  target: string,
): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    ALL_ROLES.map(
      async (role) => [role, await client.hasRole(role, target)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

const buttonStyle = (
  disabled: boolean,
  danger = false,
): React.CSSProperties => ({
  padding: "8px 14px",
  backgroundColor: disabled ? "#6b7280" : danger ? theme.danger : theme.primary,
  color: theme.surface,
  border: "none",
  borderRadius: "6px",
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
});

/**
 * Role management dashboard (#906, #1224, #1225, #1227, #1228).
 *
 * - Role cards: description, permission summary and, for the inspected
 *   address, whether the role is held plus a held-roles count.
 * - Inspection search: a valid `G...` address triggers a debounced
 *   `hasRole` lookup for every role; an invalid one shows a validation error
 *   and clears the matrix.
 * - Grant/revoke go through {@link GrantRoleModal} and {@link RevokeRoleModal}
 *   and are enabled only for a connected wallet that holds Admin or SuperAdmin.
 *
 * State: `target` (input), `debouncedTarget` (address being looked up),
 * `roleState` (lookup result or null), `adminAccount` (account verified as admin of the
 * connected wallet), `grantOpen` / `revokeRole` (open modals).
 */
export const RolesScreen: React.FC<RolesScreenProps> = ({
  style,
  className,
  debounceMs = 400,
}) => {
  const client = useBcForgeClient();
  const { publicKey, connected } = useWallet();

  const [target, setTarget] = useState("");
  const [debouncedTarget, setDebouncedTarget] = useState("");
  const [roleState, setRoleState] = useState<Record<string, boolean> | null>(
    null,
  );
  const [adminAccount, setAdminAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeRole, setRevokeRole] = useState<RevocableRole | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reportFormat, setReportFormat] = useState<RbacReportFormat>("csv");

  const handleExport = async () => {
    if (!roleState || !targetValid) return;
    setError(null);
    try {
      const events =
        typeof (client as unknown as { getEvents?: () => Promise<unknown[]> })
          .getEvents === "function"
          ? await (
              client as unknown as { getEvents: () => Promise<unknown[]> }
            ).getEvents()
          : [];
      const report = exportRbacReport(
        trimmedTarget,
        roleState,
        events,
        reportFormat,
      );
      const url = URL.createObjectURL(
        new Blob([report.content], { type: report.mimeType }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = report.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const trimmedTarget = target.trim();
  const targetValid = isValidStellarAddress(trimmedTarget);
  const targetInvalid = trimmedTarget.length > 0 && !targetValid;

  useEffect(() => {
    if (!targetValid) return;
    const id = setTimeout(() => setDebouncedTarget(trimmedTarget), debounceMs);
    return () => clearTimeout(id);
  }, [targetValid, trimmedTarget, debounceMs]);

  useEffect(() => {
    if (!debouncedTarget || debouncedTarget !== trimmedTarget) return;
    let cancelled = false;
    async function load() {
      try {
        const grants = await fetchRoleGrants(client, debouncedTarget);
        if (!cancelled) setRoleState(grants);
      } catch (err) {
        if (!cancelled) {
          setRoleState(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [client, debouncedTarget, trimmedTarget, reloadKey]);

  useEffect(() => {
    if (!connected || !publicKey) return;
    let cancelled = false;
    async function check(caller: string) {
      try {
        const [admin, superAdmin] = await Promise.all([
          client.hasRole(Role.Admin, caller),
          client.hasRole(Role.SuperAdmin, caller),
        ]);
        if (!cancelled) setAdminAccount(admin || superAdmin ? caller : null);
      } catch {
        if (!cancelled) setAdminAccount(null);
      }
    }
    void check(publicKey);
    return () => {
      cancelled = true;
    };
  }, [client, connected, publicKey, reloadKey]);

  const onDone = (label: string, result: TransactionResult) => {
    setSuccess(`${label} succeeded. Tx: ${result.hash}`);
    setReloadKey((key) => key + 1);
  };

  const grant = (role: GrantableRole, address: string) =>
    role === Role.Minter
      ? client.grantMinter(address)
      : client.grantSuperAdmin(address);
  const revoke = (role: RevocableRole, address: string) =>
    role === Role.Minter
      ? client.revokeMinter(address)
      : client.revokeSuperAdmin(address);

  const callerIsAdmin = connected && !!publicKey && adminAccount === publicKey;
  const canAct = connected && callerIsAdmin && targetValid;
  const heldCount =
    targetValid && roleState
      ? ALL_ROLES.filter((r) => roleState[r]).length
      : null;

  return (
    <div
      className={className}
      data-testid="roles-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "24px",
        maxWidth: "800px",
        margin: "0 auto",
        fontFamily: "inherit",
        ...style,
      }}
    >
      <div>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: 700 }}>
          Role Management
        </h1>
        <p style={{ margin: 0, color: theme.neutralText, fontSize: "14px" }}>
          Inspect and manage RBAC roles for a target address.
        </p>
      </div>

      <div style={{ fontSize: "14px", color: theme.neutralText }}>
        Signing account:{" "}
        <span
          data-testid="roles-connected-account"
          style={{ fontFamily: "monospace" }}
        >
          {connected && publicKey
            ? truncatePublicKey(publicKey)
            : "Not connected"}
        </span>
      </div>

      {error && (
        <Alert variant="danger" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          variant="success"
          title="Success"
          onDismiss={() => setSuccess(null)}
        >
          {success}
        </Alert>
      )}

      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          fontSize: "14px",
          maxWidth: "520px",
        }}
      >
        Target address
        <input
          type="text"
          name="target"
          placeholder="Target G... address"
          value={target}
          aria-invalid={targetInvalid}
          onChange={(e) => {
            setTarget(e.target.value);
            setError(null);
            setRoleState(null);
          }}
          style={{
            padding: "8px 12px",
            border: `1px solid ${targetInvalid ? theme.danger : theme.border}`,
            borderRadius: "6px",
            fontSize: "14px",
            outline: "none",
          }}
        />
        {targetInvalid && (
          <span
            data-testid="target-error"
            style={{ color: theme.dangerText, fontSize: "13px" }}
          >
            Enter a valid Stellar address starting with G (56 characters).
          </span>
        )}
      </label>

      <div
        data-testid="role-cards"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "12px",
        }}
      >
        {ALL_ROLES.map((role) => (
          <div
            key={role}
            data-testid={`role-card-${role}`}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: "8px",
              padding: "12px",
              backgroundColor: theme.surface,
              color: theme.text,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <strong>{role}</strong>
            <span style={{ fontSize: "13px", color: theme.neutralText }}>
              {ROLE_INFO[role]?.description}
            </span>
            <span style={{ fontSize: "12px", color: theme.neutralText }}>
              {ROLE_INFO[role]?.permissions}
            </span>
            <div>
              <Badge
                data-testid={`role-badge-${role}`}
                title={ROLE_PERMISSIONS[role]}
                data-status={
                  !targetValid
                    ? undefined
                    : roleState?.[role]
                      ? "granted"
                      : "not-granted"
                }
                variant={roleState && roleState[role] ? "success" : "default"}
              >
                {role}:{" "}
                {!targetValid
                  ? "—"
                  : roleState === null
                    ? "…"
                    : roleState[role]
                      ? "Granted"
                      : "Not granted"}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      {heldCount !== null && (
        <span
          data-testid="role-count"
          style={{ fontSize: "14px", color: theme.neutralText }}
        >
          Roles held: {heldCount} of {ALL_ROLES.length}
        </span>
      )}
      {!trimmedTarget && (
        <span style={{ fontSize: "14px", color: theme.neutralText }}>
          Enter a target address to view roles.
        </span>
      )}

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="open-grant"
          disabled={!canAct}
          style={buttonStyle(!canAct)}
          onClick={() => setGrantOpen(true)}
        >
          Grant role
        </button>
        {([Role.Minter, Role.SuperAdmin] as const).map((role) => {
          const disabled = !canAct || !roleState?.[role];
          return (
            <button
              key={role}
              type="button"
              data-testid={`revoke-${role === Role.Minter ? "minter" : "super-admin"}`}
              disabled={disabled}
              style={buttonStyle(disabled, true)}
              onClick={() => setRevokeRole(role)}
            >
              Revoke {role === Role.Minter ? "Minter" : "Super Admin"}
            </button>
          );
        })}
      </div>

      {!connected && (
        <span style={{ fontSize: "13px", color: theme.neutralText }}>
          Connect a wallet to grant or revoke roles.
        </span>
      )}
      {connected && !callerIsAdmin && (
        <span
          data-testid="not-admin"
          style={{ fontSize: "13px", color: theme.neutralText }}
        >
          The connected account is not an Admin or SuperAdmin, so role changes
          are disabled.
        </span>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
          }}
        >
          Export format
          <select
            aria-label="Export format"
            value={reportFormat}
            onChange={(event) =>
              setReportFormat(event.target.value as RbacReportFormat)
            }
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <button
          type="button"
          disabled={!roleState || !targetValid}
          onClick={() => void handleExport()}
        >
          Export permissions
        </button>
      </div>

      <GrantRoleModal
        open={grantOpen}
        target={trimmedTarget}
        onClose={() => setGrantOpen(false)}
        onGrant={grant}
        onGranted={(role, result) => onDone(`Grant ${role}`, result)}
      />
      {revokeRole && (
        <RevokeRoleModal
          open
          role={revokeRole}
          target={trimmedTarget}
          onClose={() => setRevokeRole(null)}
          onRevoke={revoke}
          onRevoked={(role, result) => onDone(`Revoke ${role}`, result)}
        />
      )}
    </div>
  );
};
