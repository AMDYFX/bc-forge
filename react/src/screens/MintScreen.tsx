// SPDX-License-Identifier: MIT
import React, { useState } from "react";
import { Role } from "@bc-forge/sdk";
import { useHasRole, useMint, useWallet } from "../hooks";
import { truncatePublicKey } from "../context";
import { isPositiveInteger } from "../utils";
import { Alert } from "../components/Alert";

export interface MintScreenProps {
  /** Optional container style */
  style?: React.CSSProperties;
  /** Optional container CSS class */
  className?: string;
}

/**
 * Token mint screen (#903, #1189, #1204, #1205). Collects a recipient address and a positive
 * integer amount, then submits through the connected wallet via `useMint`.
 * Features caller minter role checking, reactive helper text feedback, and immediate validation.
 * The component never asks for a secret key.
 */
export const MintScreen: React.FC<MintScreenProps> = ({ style, className }) => {
  const { publicKey, connected } = useWallet();
  const { mint, loading } = useMint();
  const { data: isMinter, loading: roleLoading } = useHasRole(
    Role.Minter,
    connected ? (publicKey ?? undefined) : undefined,
  );

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const trimmedRecipient = recipient.trim();
  const trimmedAmount = amount.trim();
  const recipientValid = trimmedRecipient.length > 0;
  const amountValid = isPositiveInteger(trimmedAmount);
  const lacksMinterRole = connected && isMinter === false;

  // Immediate validation for non-integer, negative, decimal, or exponential input (#1205)
  const amountValidationError = React.useMemo(() => {
    if (!amount) return null;
    const trimmed = amount.trim();
    if (trimmed === "") return "Amount cannot be blank.";
    if (trimmed.includes("-")) return "Amount cannot be negative.";
    if (trimmed.includes(".")) return "Amount cannot contain decimals.";
    if (/e/i.test(trimmed)) return "Amount cannot use exponential notation.";
    if (!/^\d+$/.test(trimmed))
      return "Amount must be a valid base-10 integer.";
    if (BigInt(trimmed) === 0n) return "Amount must be greater than zero.";
    return null;
  }, [amount]);

  const canSubmit =
    connected &&
    recipientValid &&
    amountValid &&
    !amountValidationError &&
    !loading &&
    !roleLoading &&
    !lacksMinterRole;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTxHash(null);

    if (!connected) {
      setError("Connect a wallet before minting.");
      return;
    }
    if (lacksMinterRole) {
      setError("Minter role required to mint tokens.");
      return;
    }
    if (!recipientValid) {
      setError("Recipient address is required.");
      return;
    }
    if (!amountValid || amountValidationError) {
      setError(amountValidationError || "Amount must be a positive integer.");
      return;
    }

    try {
      // No Keypair: the connected wallet adapter signs and is the source.
      const result = await mint(trimmedRecipient, BigInt(trimmedAmount));
      if (result.success) {
        setTxHash(result.hash);
        setAmount("");
      } else {
        setError(`Mint failed with transaction hash: ${result.hash}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className={className}
      data-testid="mint-screen"
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
          Mint Tokens
        </h1>
        <p style={{ margin: 0, color: "#4b5563", fontSize: "14px" }}>
          Mint tokens to a recipient through the connected wallet.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          fontSize: "14px",
          color: "#4b5563",
        }}
      >
        <div>
          Signing account:{" "}
          <span
            data-testid="mint-connected-account"
            style={{ fontFamily: "monospace" }}
          >
            {connected && publicKey
              ? truncatePublicKey(publicKey)
              : "Not connected"}
          </span>
        </div>

        {connected && (
          <div
            data-testid="minter-role-indicator"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            Role status:{" "}
            {roleLoading ? (
              <span style={{ color: "#6b7280" }}>Verifying permissions…</span>
            ) : isMinter === true ? (
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#dcfce7",
                  color: "#15803d",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                Minter Authorized
              </span>
            ) : isMinter === false ? (
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "#fee2e2",
                  color: "#b91c1c",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                Not Authorized (Minter Role Required)
              </span>
            ) : (
              <span style={{ color: "#6b7280" }}>Permission not verified</span>
            )}
          </div>
        )}
      </div>

      {lacksMinterRole && (
        <Alert
          variant="warning"
          title="Minter role required"
          data-testid="mint-role-warning"
        >
          The connected account does not hold the Minter role, so minting is
          disabled.
        </Alert>
      )}

      {amountValidationError && (
        <Alert
          variant="danger"
          title="Validation Error"
          data-testid="mint-amount-validation-error"
        >
          {amountValidationError}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {txHash && (
        <Alert
          variant="success"
          title="Mint Success"
          onDismiss={() => setTxHash(null)}
        >
          Transaction confirmed: <code data-testid="tx-hash">{txHash}</code>
        </Alert>
      )}

      <form
        onSubmit={handleSubmit}
        data-testid="mint-form"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "20px",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          backgroundColor: "#ffffff",
        }}
      >
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            fontSize: "14px",
          }}
        >
          Recipient address
          <input
            type="text"
            name="recipient"
            placeholder="Recipient G... address"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={loading}
            style={{
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            The public Stellar account (G... or C... identifier) that will
            receive newly minted tokens.
          </span>
        </label>

        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            fontSize: "14px",
          }}
        >
          Amount
          <input
            type="text"
            name="amount"
            placeholder="Positive integer amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={loading}
            style={{
              padding: "8px 12px",
              border: amountValidationError
                ? "1px solid #ef4444"
                : "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            Specify the token quantity in base units (must be a positive whole
            integer without decimals).
          </span>
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: "10px 16px",
            backgroundColor: !canSubmit ? "#9ca3af" : "#2563eb",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            fontWeight: 500,
            cursor: !canSubmit ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Minting…" : "Mint"}
        </button>
      </form>
    </div>
  );
};
