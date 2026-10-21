import "@testing-library/jest-dom";
// SPDX-License-Identifier: MIT
import { act, renderHook, waitFor } from "@testing-library/react";
import type { bcForgeClient } from "@bc-forge/sdk";
import {
  Role,
  AdminUnauthorizedRoleError,
  TokenInsufficientAllowanceError,
} from "@bc-forge/sdk";

const VALID_OWNER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGWEBUSAVCBCY42YOXT";

const mockClient = {
  getName: jest.fn(),
  getSymbol: jest.fn(),
  getDecimals: jest.fn(),
  getContractId: jest.fn(),
  getBalance: jest.fn(),
  getAllowance: jest.fn(),
  approveProposal: jest.fn(),
  hasRole: jest.fn(),
  approve: jest.fn(),
  transfer: jest.fn(),
  mint: jest.fn(),
  burn: jest.fn(),
  clearCache: jest.fn(),
  getLatestLedgerSequence: jest.fn(),
  estimateTransferFee: jest.fn(),
  accountExists: jest.fn(),
};
const mockVaultClient = {
  deposit: jest.fn(),
};
const mockUseWallet = jest.fn(
  (): {
    status: string;
    connected?: boolean;
    publicKey?: string | null;
  } => ({
    status: "connected",
  }),
);

jest.mock("./context", () => ({
  useBcForgeClient: () => mockClient,
  useOptionalBcForgeClient: () => mockClient,
  useVaultClient: () => mockVaultClient,
  useWallet: mockUseWallet,
}));

jest.mock("@bc-forge/sdk", () => {
  const errors = jest.requireActual("../../sdk/src/errors");
  return {
    ...errors,
    Role: {
      Admin: "Admin",
      SuperAdmin: "SuperAdmin",
      Minter: "Minter",
      Pauser: "Pauser",
    },
  };
});

import {
  ZERO_ADDRESS,
  clearTokenMetadataCache,
  isValidStellarAddress,
  normalizeHookError,
  stroopsToXlm,
  useAccountBalance,
  useAllowance,
  useApprove,
  useEstimateFee,
  useHasRole,
  useLatestLedger,
  useProposalVote,
  useTokenAllowance,
  useTokenMetadata,
  useTransfer,
  useVaultDeposit,
} from "./hooks";

describe("React client hooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTokenMetadataCache();
    mockUseWallet.mockReturnValue({ status: "connected" });
    mockClient.getName.mockResolvedValue("BC Forge Token");
    mockClient.getSymbol.mockResolvedValue("BCF");
    mockClient.getDecimals.mockResolvedValue(7);
    mockClient.getContractId.mockReturnValue(
      "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
    );
  });

  describe("useTokenMetadata (#1184)", () => {
    it("fetches token name, symbol, decimals, and contractId from bcForgeClient", async () => {
      const { result } = renderHook(() => useTokenMetadata());

      expect(result.current.loading).toBe(true);

      await waitFor(() =>
        expect(result.current.data).toEqual({
          name: "BC Forge Token",
          symbol: "BCF",
          decimals: 7,
          contractId:
            "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
        }),
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockClient.getName).toHaveBeenCalledTimes(1);
      expect(mockClient.getSymbol).toHaveBeenCalledTimes(1);
      expect(mockClient.getDecimals).toHaveBeenCalledTimes(1);
    });

    it("caches metadata in memory to avoid repeated RPC roundtrips on re-mount", async () => {
      const first = renderHook(() => useTokenMetadata());

      await waitFor(() =>
        expect(first.result.current.data?.symbol).toBe("BCF"),
      );
      expect(mockClient.getName).toHaveBeenCalledTimes(1);
      first.unmount();

      const second = renderHook(() => useTokenMetadata());
      expect(second.result.current.data).toEqual({
        name: "BC Forge Token",
        symbol: "BCF",
        decimals: 7,
        contractId: "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
      });
      expect(second.result.current.loading).toBe(false);
      expect(second.result.current.error).toBeNull();
      expect(mockClient.getName).toHaveBeenCalledTimes(1);
      expect(mockClient.getSymbol).toHaveBeenCalledTimes(1);
      expect(mockClient.getDecimals).toHaveBeenCalledTimes(1);
    });

    it("deduplicates concurrent in-flight RPC calls for the same contract", async () => {
      const hookA = renderHook(() => useTokenMetadata());
      const hookB = renderHook(() => useTokenMetadata());

      await waitFor(() =>
        expect(hookA.result.current.data?.symbol).toBe("BCF"),
      );
      await waitFor(() =>
        expect(hookB.result.current.data?.symbol).toBe("BCF"),
      );

      expect(mockClient.getName).toHaveBeenCalledTimes(1);
      expect(mockClient.getSymbol).toHaveBeenCalledTimes(1);
      expect(mockClient.getDecimals).toHaveBeenCalledTimes(1);
    });

    it("supports manual refetch to bypass cache and refresh metadata", async () => {
      const { result } = renderHook(() => useTokenMetadata());

      await waitFor(() =>
        expect(result.current.data?.name).toBe("BC Forge Token"),
      );
      expect(mockClient.getName).toHaveBeenCalledTimes(1);

      mockClient.getName.mockResolvedValueOnce("BC Forge Token V2");
      mockClient.getSymbol.mockResolvedValueOnce("BCFV2");

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.data).toEqual({
        name: "BC Forge Token V2",
        symbol: "BCFV2",
        decimals: 7,
        contractId: "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
      });
      expect(mockClient.getName).toHaveBeenCalledTimes(2);
    });

    it("captures RPC errors and decodes Soroban contract errors gracefully", async () => {
      mockClient.getName.mockRejectedValueOnce(
        new Error("HostError: Error(Contract, #2)"),
      );

      const { result } = renderHook(() => useTokenMetadata());

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toMatch(
        /TOKEN_NOT_INITIALIZED|Error\(Contract, #2\)/,
      );
    });

    it("handles empty contractId overrides with a descriptive error", async () => {
      const { result } = renderHook(() =>
        useTokenMetadata({ contractId: "   " }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.data).toBeNull();
      expect(result.current.error?.message).toBe(
        "Invalid contract ID: contractId cannot be empty.",
      );
      expect(mockClient.getName).not.toHaveBeenCalled();
    });

    it("suspends fetching when enabled is false or client is explicitly null", () => {
      const disabled = renderHook(() => useTokenMetadata({ enabled: false }));
      expect(disabled.result.current.loading).toBe(false);
      expect(disabled.result.current.data).toBeNull();

      const noClient = renderHook(() => useTokenMetadata({ client: null }));
      expect(noClient.result.current.loading).toBe(false);
      expect(noClient.result.current.data).toBeNull();
      expect(mockClient.getName).not.toHaveBeenCalled();
    });

    it("supports custom client instances with contractId property fallback", async () => {
      const customClient = {
        contractId: "CCUSTOMCONTRACTID1234567890",
        getName: jest.fn().mockResolvedValue("Custom Token"),
        getSymbol: jest.fn().mockResolvedValue("CST"),
        getDecimals: jest.fn().mockResolvedValue(6),
      } as unknown as bcForgeClient;

      const { result } = renderHook(() =>
        useTokenMetadata({ client: customClient }),
      );

      await waitFor(() =>
        expect(result.current.data).toEqual({
          name: "Custom Token",
          symbol: "CST",
          decimals: 6,
          contractId: "CCUSTOMCONTRACTID1234567890",
        }),
      );
    });

    it("polls metadata on the configured interval and cleans up on unmount", async () => {
      jest.useFakeTimers();
      try {
        const { result, unmount } = renderHook(() =>
          useTokenMetadata({ pollIntervalMs: 5000 }),
        );

        await waitFor(() => expect(result.current.data?.symbol).toBe("BCF"));
        expect(mockClient.getName).toHaveBeenCalledTimes(1);

        mockClient.getName.mockResolvedValue("Updated Token");
        await act(async () => {
          jest.advanceTimersByTime(5000);
        });

        await waitFor(() =>
          expect(result.current.data?.name).toBe("Updated Token"),
        );
        expect(mockClient.getName).toHaveBeenCalledTimes(2);

        unmount();
        await act(async () => {
          jest.advanceTimersByTime(10000);
        });
        expect(mockClient.getName).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it("loads allowance data for the owner and spender", async () => {
    mockClient.getAllowance.mockResolvedValue(125n);

    const { result } = renderHook(() => useAllowance("GOWNER", "GSPENDER"));

    await waitFor(() => expect(result.current.data).toBe(125n));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockClient.getAllowance).toHaveBeenCalledWith("GOWNER", "GSPENDER");
  });

  it("deposits through the configured vault client without a secret key argument", async () => {
    mockVaultClient.deposit.mockResolvedValue({
      success: true,
      hash: "deposit-hash",
    });

    const { result } = renderHook(() => useVaultDeposit());
    await act(async () => {
      await result.current.deposit("GOWNER", 500n, 450n);
    });

    expect(mockVaultClient.deposit).toHaveBeenCalledWith(
      "GOWNER",
      500n,
      undefined,
      450n,
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("refuses a vault deposit unless the shared wallet state is connected", async () => {
    mockUseWallet.mockReturnValue({ status: "disconnected" });
    const { result } = renderHook(() => useVaultDeposit());

    await act(async () => {
      await expect(result.current.deposit("GOWNER", 500n)).rejects.toThrow(
        'Cannot submit a transaction while wallet status is "disconnected".',
      );
    });

    expect(mockVaultClient.deposit).not.toHaveBeenCalled();
  });

  it("votes for a proposal through the configured token client", async () => {
    mockClient.approveProposal.mockResolvedValue({
      success: true,
      hash: "vote-hash",
    });

    const { result } = renderHook(() => useProposalVote());
    await act(async () => {
      await result.current.vote("GADMIN", 9n);
    });

    expect(mockClient.approveProposal).toHaveBeenCalledWith("GADMIN", 9n);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("refuses a proposal vote unless the shared wallet state is connected", async () => {
    mockUseWallet.mockReturnValue({ status: "disconnected" });
    const { result } = renderHook(() => useProposalVote());

    await act(async () => {
      await expect(result.current.vote("GADMIN", 9n)).rejects.toThrow(
        'Cannot submit a transaction while wallet status is "disconnected".',
      );
    });

    expect(mockClient.approveProposal).not.toHaveBeenCalled();
  });

  describe("useHasRole (#1206)", () => {
    it("resolves the role check for an address", async () => {
      mockClient.hasRole.mockResolvedValue(true);
      const { result } = renderHook(() =>
        useHasRole("Minter" as never, VALID_OWNER),
      );
      await waitFor(() => expect(result.current.data).toBe(true));
      expect(mockClient.hasRole).toHaveBeenCalledWith("Minter", VALID_OWNER);
    });

    it("stays idle without an address and surfaces errors", async () => {
      const idle = renderHook(() => useHasRole("Minter" as never, undefined));
      expect(idle.result.current.data).toBeNull();
      expect(mockClient.hasRole).not.toHaveBeenCalled();

      mockClient.hasRole.mockRejectedValue(new Error("rpc down"));
      const failed = renderHook(() =>
        useHasRole("Minter" as never, VALID_OWNER),
      );
      await waitFor(() =>
        expect(failed.result.current.error?.message).toBe("rpc down"),
      );
    });
  });

  describe("isValidStellarAddress & normalizeHookError helpers", () => {
    it("validates Stellar public keys and rejects malformed or zero addresses", () => {
      expect(isValidStellarAddress(VALID_OWNER)).toBe(true);
      expect(isValidStellarAddress(ZERO_ADDRESS)).toBe(false);
      expect(isValidStellarAddress("")).toBe(false);
      expect(isValidStellarAddress("not-a-valid-address")).toBe(false);
    });

    it("decodes Soroban contract errors into typed ContractError instances", () => {
      const adminErr = normalizeHookError(
        new Error("Error(Contract, #3)"),
        "has_role",
      );
      expect(adminErr).toBeInstanceOf(AdminUnauthorizedRoleError);

      const tokenErr = normalizeHookError("Error(Contract, #5)", "allowance");
      expect(tokenErr).toBeInstanceOf(TokenInsufficientAllowanceError);

      const genericErr = normalizeHookError(new Error("Network timeout"));
      expect(genericErr.message).toBe("Network timeout");
    });
  });

  describe("useAccountBalance (#1185)", () => {
    beforeEach(() => {
      jest.resetAllMocks();
      jest.useFakeTimers();
      mockUseWallet.mockReturnValue({
        status: "connected",
        connected: true,
        publicKey: VALID_OWNER,
      });
      mockClient.getDecimals.mockResolvedValue(7);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("fetches raw bigint balance and formats decimal string using contract decimals", async () => {
      mockClient.getBalance.mockResolvedValue(125_000_000n);

      const { result } = renderHook(() => useAccountBalance(VALID_OWNER));

      await waitFor(() => expect(result.current.rawBalance).toBe(125_000_000n));
      expect(result.current.balance).toBe(125_000_000n);
      expect(result.current.formatted).toBe("12.5");
      expect(result.current.formattedBalance).toBe("12.5");
      expect(result.current.decimals).toBe(7);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.alertMessage).toBeNull();
    });

    it("polls balance at the configured interval and cleans up on unmount", async () => {
      mockClient.getBalance
        .mockResolvedValueOnce(10_000_000n)
        .mockResolvedValueOnce(25_000_000n)
        .mockResolvedValueOnce(50_000_000n);

      const { result, unmount } = renderHook(() =>
        useAccountBalance(VALID_OWNER, { pollingInterval: 5000, decimals: 7 }),
      );

      await waitFor(() => expect(result.current.balance).toBe(10_000_000n));
      expect(result.current.formatted).toBe("1");

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      await waitFor(() => expect(result.current.balance).toBe(25_000_000n));
      expect(result.current.formatted).toBe("2.5");

      unmount();

      await act(async () => {
        jest.advanceTimersByTime(10000);
      });
      expect(mockClient.getBalance).toHaveBeenCalledTimes(2);
    });

    it("supports manual refetch and automatic refresh after transfer transactions", async () => {
      mockClient.getBalance
        .mockResolvedValueOnce(100_000_000n)
        .mockResolvedValueOnce(80_000_000n)
        .mockResolvedValueOnce(60_000_000n);
      mockClient.transfer.mockResolvedValue({ success: true, hash: "tx-xfer" });

      const { result } = renderHook(() =>
        useAccountBalance(VALID_OWNER, { pollingInterval: 0, decimals: 7 }),
      );

      await waitFor(() => expect(result.current.balance).toBe(100_000_000n));

      await act(async () => {
        await result.current.refetch();
      });
      expect(result.current.balance).toBe(80_000_000n);

      const { result: transferResult } = renderHook(() => useTransfer());
      await act(async () => {
        await transferResult.current.transfer(
          VALID_OWNER,
          VALID_OWNER,
          20_000_000n,
        );
      });

      await waitFor(() => expect(result.current.balance).toBe(60_000_000n));
      expect(result.current.formatted).toBe("6");
    });

    it("handles disconnected wallet and invalid address formats gracefully with alertMessage", async () => {
      mockUseWallet.mockReturnValue({
        status: "disconnected",
        connected: false,
        publicKey: null,
      });

      const { result: disconnectedResult } = renderHook(() =>
        useAccountBalance(undefined),
      );
      expect(disconnectedResult.current.rawBalance).toBeNull();
      expect(disconnectedResult.current.balance).toBe(0n);
      expect(disconnectedResult.current.alertMessage).toMatch(
        /Connect a wallet/i,
      );

      const { result: invalidResult } = renderHook(() =>
        useAccountBalance("BAD_ADDR"),
      );
      expect(invalidResult.current.error).toBeInstanceOf(Error);
      expect(invalidResult.current.alertMessage).toMatch(
        /Invalid Stellar address/i,
      );
      expect(mockClient.getBalance).not.toHaveBeenCalled();
    });

    it("captures RPC and contract errors cleanly without unhandled exceptions", async () => {
      mockClient.getBalance.mockRejectedValue(new Error("RPC timeout"));

      const { result } = renderHook(() =>
        useAccountBalance(VALID_OWNER, { pollingInterval: 0 }),
      );

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.error?.message).toBe("RPC timeout");
      expect(result.current.alertMessage).toContain("RPC timeout");
      expect(result.current.loading).toBe(false);
    });
  });

  describe("useTokenAllowance (#1186)", () => {
    const spenderKey = VALID_OWNER;

    beforeEach(() => {
      jest.resetAllMocks();
      mockUseWallet.mockReturnValue({
        status: "connected",
        connected: true,
        publicKey: VALID_OWNER,
      });
    });

    it("reads current allowance bigint for owner and spender", async () => {
      mockClient.getAllowance.mockResolvedValue(500_000n);

      const { result } = renderHook(() =>
        useTokenAllowance(VALID_OWNER, spenderKey),
      );

      await waitFor(() => expect(result.current.rawAllowance).toBe(500_000n));
      expect(result.current.allowance).toBe(500_000n);
      expect(result.current.data).toBe(500_000n);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockClient.getAllowance).toHaveBeenCalledWith(
        VALID_OWNER,
        spenderKey,
      );
    });

    it("automatically refetches allowance when an approve transaction confirms", async () => {
      mockClient.getAllowance
        .mockResolvedValueOnce(100n)
        .mockResolvedValueOnce(950n);
      mockClient.approve.mockResolvedValue({
        success: true,
        hash: "approve-tx-1",
      });

      const { result } = renderHook(() =>
        useTokenAllowance(VALID_OWNER, spenderKey),
      );
      await waitFor(() => expect(result.current.allowance).toBe(100n));

      const { result: approveHook } = renderHook(() => useApprove());
      await act(async () => {
        await approveHook.current.approve(VALID_OWNER, spenderKey, 950n);
      });

      await waitFor(() => expect(result.current.allowance).toBe(950n));
    });

    it("supports approveAndRefetch directly on the hook", async () => {
      mockClient.getAllowance
        .mockResolvedValueOnce(0n)
        .mockResolvedValue(2000n);
      mockClient.approve.mockResolvedValue({
        success: true,
        hash: "approve-tx-2",
      });

      const { result } = renderHook(() =>
        useTokenAllowance(VALID_OWNER, spenderKey),
      );
      await waitFor(() => expect(result.current.allowance).toBe(0n));

      await act(async () => {
        const tx = await result.current.approveAndRefetch(2000n);
        expect(tx.success).toBe(true);
      });

      await waitFor(() => expect(result.current.allowance).toBe(2000n));
    });

    it("surfaces helpful alert messages for invalid addresses and RPC errors", async () => {
      const { result: badOwner } = renderHook(() =>
        useTokenAllowance("INVALID_OWNER", spenderKey),
      );
      expect(badOwner.current.error).toBeInstanceOf(Error);
      expect(badOwner.current.alertMessage).toMatch(
        /Invalid owner Stellar address/i,
      );

      mockClient.getAllowance.mockRejectedValue(
        new Error("Error(Contract, #5)"),
      );
      const { result: contractErr } = renderHook(() =>
        useTokenAllowance(VALID_OWNER, spenderKey),
      );
      await waitFor(() =>
        expect(contractErr.current.error).toBeInstanceOf(
          TokenInsufficientAllowanceError,
        ),
      );
      expect(contractErr.current.alertMessage).toMatch(
        /TOKEN_INSUFFICIENT_ALLOWANCE/,
      );
    });
  });

  describe("useHasRole (#1188)", () => {
    beforeEach(() => {
      jest.resetAllMocks();
      mockUseWallet.mockReturnValue({
        status: "connected",
        connected: true,
        publicKey: VALID_OWNER,
      });
    });

    it("verifies whether an address possesses a given Role enum", async () => {
      mockClient.hasRole.mockResolvedValue(true);

      const { result } = renderHook(() => useHasRole(Role.Minter, VALID_OWNER));

      await waitFor(() => expect(result.current.data).toBe(true));
      expect(result.current.hasRole).toBe(true);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockClient.hasRole).toHaveBeenCalledWith(Role.Minter, VALID_OWNER);
    });

    it("supports (address, role) parameter ordering and connected wallet fallback", async () => {
      mockClient.hasRole.mockResolvedValue(false);

      const { result } = renderHook(() =>
        useHasRole(VALID_OWNER, Role.SuperAdmin),
      );
      await waitFor(() => expect(result.current.data).toBe(false));
      expect(result.current.hasRole).toBe(false);
      expect(mockClient.hasRole).toHaveBeenCalledWith(
        Role.SuperAdmin,
        VALID_OWNER,
      );

      mockClient.hasRole.mockResolvedValue(true);
      const { result: fallbackResult } = renderHook(() =>
        useHasRole(Role.Admin),
      );
      await waitFor(() => expect(fallbackResult.current.hasRole).toBe(true));
      expect(mockClient.hasRole).toHaveBeenCalledWith(Role.Admin, VALID_OWNER);
    });

    it("handles unauthenticated state, invalid address, and RPC errors with alertMessage", async () => {
      mockUseWallet.mockReturnValue({
        status: "disconnected",
        connected: false,
        publicKey: null,
      });

      const { result: disconnected } = renderHook(() => useHasRole(Role.Admin));
      expect(disconnected.current.hasRole).toBe(false);
      expect(disconnected.current.alertMessage).toMatch(/Connect a wallet/i);

      const { result: invalidAddr } = renderHook(() =>
        useHasRole(Role.Minter, "INVALID_STELLAR_KEY"),
      );
      expect(invalidAddr.current.hasRole).toBe(false);
      expect(invalidAddr.current.error).toBeInstanceOf(Error);
      expect(invalidAddr.current.alertMessage).toMatch(
        /Invalid Stellar address/i,
      );

      mockClient.hasRole.mockRejectedValue(new Error("Error(Contract, #3)"));
      const { result: rpcError } = renderHook(() =>
        useHasRole(Role.Pauser, VALID_OWNER),
      );
      await waitFor(() =>
        expect(rpcError.current.error).toBeInstanceOf(
          AdminUnauthorizedRoleError,
        ),
      );
      expect(rpcError.current.hasRole).toBe(false);
      expect(rpcError.current.alertMessage).toMatch(/ADMIN_UNAUTHORIZED_ROLE/);
    });
  });

  describe("useLatestLedger (#1194)", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("polls every 5s and stops on unmount", async () => {
      mockClient.getLatestLedgerSequence
        .mockResolvedValueOnce(100)
        .mockResolvedValue(101);
      const { result, unmount } = renderHook(() => useLatestLedger());
      await act(async () => {});
      expect(result.current.sequence).toBe(100);

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(result.current.sequence).toBe(101);
      expect(result.current.observedAt).not.toBeNull();

      unmount();
      const calls = mockClient.getLatestLedgerSequence.mock.calls.length;
      jest.advanceTimersByTime(20000);
      expect(mockClient.getLatestLedgerSequence).toHaveBeenCalledTimes(calls);
    });

    it("keeps the last sequence and sets error on failure", async () => {
      mockClient.getLatestLedgerSequence
        .mockResolvedValueOnce(7)
        .mockRejectedValueOnce(new Error("timeout"));
      const { result } = renderHook(() =>
        useLatestLedger({ pollIntervalMs: 0 }),
      );
      await act(async () => {});
      expect(result.current.sequence).toBe(7);
      await act(async () => {
        await result.current.refetch();
      });
      expect(result.current.error?.message).toBe("timeout");
      expect(result.current.sequence).toBe(7);
    });
  });

  describe("useEstimateFee (#1214)", () => {
    it("formats stroops as XLM", () => {
      expect(stroopsToXlm(100n)).toBe("0.0000100");
      expect(stroopsToXlm(12_345_678n)).toBe("1.2345678");
    });

    it("returns the fee and recipient status", async () => {
      mockClient.estimateTransferFee.mockResolvedValue({ fee: "4242" });
      mockClient.accountExists.mockResolvedValue(false);
      const { result } = renderHook(() => useEstimateFee());
      await act(async () => {
        await result.current.estimate("GFROM", "GTO", 5n);
      });
      expect(result.current.data).toEqual({
        feeStroops: 4242n,
        feeXlm: "0.0004242",
        recipientExists: false,
      });
    });

    it("surfaces simulation errors", async () => {
      mockClient.estimateTransferFee.mockRejectedValue(new Error("sim failed"));
      mockClient.accountExists.mockResolvedValue(true);
      const { result } = renderHook(() => useEstimateFee());
      await act(async () => {
        await result.current
          .estimate("GFROM", "GTO", 5n)
          .catch(() => undefined);
      });
      expect(result.current.error?.message).toBe("sim failed");
      expect(result.current.data).toBeNull();
    });
  });
});
