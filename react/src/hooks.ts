import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBcForgeClient, useOptionalBcForgeClient } from './context';
import { Keypair } from '@stellar/stellar-sdk';
import { VaultClient } from '@bc-forge/sdk';
import type { TransactionResult, WalletAdapter } from '@bc-forge/sdk';

/**
 * Hook to read the connected wallet state: adapter name, public key,
 * connection status, and connect/disconnect actions (#902). Transactions
 * submitted while connected are signed by the adapter, so no `Keypair` is
 * required. Defined in `./context`; re-exported here alongside the write
 * hooks.
 */
export { useWallet } from './context';

/**
 * Hook to fetch basic token information (name, symbol, decimals).
 */
export function useBcForgeToken() {
  const client = useBcForgeClient();
  const [data, setData] = useState<{ name: string; symbol: string; decimals: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [name, symbol, decimals] = await Promise.all([
          client.getName(),
          client.getSymbol(),
          client.getDecimals(),
        ]);
        setData({ name, symbol, decimals });
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [client]);

  return { data, loading, error };
}

/**
 * Hook to fetch the balance of a specific address.
 */
export function useBalance(address: string | undefined) {
  const client = useBcForgeClient();
  const [data, setData] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    try {
      setLoading(true);
      const balance = await client.getBalance(address);
      setData(balance);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, address]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return { data, loading, error, refetch: fetchBalance };
}

/**
 * Hook to perform mint operations.
 *
 * `source` is optional: when omitted, the connected wallet adapter signs the
 * transaction and the connected account is the transaction source (#902).
 */
export function useMint() {
  const client = useBcForgeClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mint = useCallback(async (to: string, amount: bigint, source?: Keypair) => {
    try {
      setLoading(true);
      setError(null);
      const result = await client.mint(to, amount, source);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { mint, loading, error };
}

/**
 * Hook to fetch the total supply of the token.
 */
export function useTotalSupply() {
  const client = useBcForgeClient();
  const [data, setData] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTotalSupply = useCallback(async () => {
    try {
      setLoading(true);
      const supply = await client.getTotalSupply();
      setData(supply);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchTotalSupply();
  }, [fetchTotalSupply]);

  return { data, loading, error, refetch: fetchTotalSupply };
}

/**
 * Hook to perform transfer operations.
 *
 * `source` is optional: when omitted, the connected wallet adapter signs the
 * transaction and the connected account is the transaction source (#902).
 */
export function useTransfer() {
  const client = useBcForgeClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const transfer = useCallback(async (from: string, to: string, amount: bigint, source?: Keypair) => {
    try {
      setLoading(true);
      setError(null);
      const result = await client.transfer(from, to, amount, source);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { transfer, loading, error };
}

/**
 * Hook to perform approve operations.
 */
export function useApprove() {
  const client = useBcForgeClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const approve = useCallback(async (from: string, spender: string, amount: bigint, source: Keypair) => {
    try {
      setLoading(true);
      setError(null);
      const result = await client.approve(from, spender, amount, source);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { approve, loading, error };
}

/**
 * Hook to perform burn operations.
 *
 * `source` is optional: when omitted, the connected wallet adapter signs the
 * transaction and the connected account is the transaction source (#902).
 */
export function useBurn() {
  const client = useBcForgeClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const burn = useCallback(async (from: string, amount: bigint, source?: Keypair) => {
    try {
      setLoading(true);
      setError(null);
      const result = await client.burn(from, amount, source);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { burn, loading, error };
}

/**
 * Hook to fetch the allowance between owner and spender.
 */
export function useAllowance(owner: string | undefined, spender: string | undefined) {
  const client = useBcForgeClient();
  const [data, setData] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchAllowance = useCallback(async () => {
    if (!owner || !spender) return;
    try {
      setLoading(true);
      const allowance = await client.getAllowance(owner, spender);
      setData(allowance);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, owner, spender]);

  useEffect(() => {
    fetchAllowance();
  }, [fetchAllowance]);

  return { data, loading, error, refetch: fetchAllowance };
}

// ─── Vault hooks (#950) ──────────────────────────────────────────────────────

export interface UseVaultClientOptions {
  /** Pre-instantiated {@link VaultClient}. Takes precedence over the fields below. */
  client?: VaultClient;
  /** Soroban RPC endpoint; needed to build a client from the other fields. */
  rpcUrl?: string;
  /** Stellar network passphrase. */
  networkPassphrase?: string;
  /** Deployed vault contract ID. */
  contractId?: string;
  /** Wallet adapter registered on a newly built client. */
  walletAdapter?: WalletAdapter;
}

/**
 * Resolves a {@link VaultClient} from an explicit instance or from the
 * connection fields, returning `null` when neither is available. Never throws,
 * so callers can render a read-only or disabled UI without a client.
 *
 * Memoised on the option identity: pass a pre-built `client`, or a stable
 * `walletAdapter`, to avoid rebuilding it on every render.
 */
export function useVaultClient(options: UseVaultClientOptions = {}): VaultClient | null {
  const { client, rpcUrl, networkPassphrase, contractId, walletAdapter } = options;
  return useMemo(() => {
    if (client) return client;
    if (!rpcUrl || !networkPassphrase || !contractId) return null;
    return new VaultClient({ rpcUrl, networkPassphrase, contractId, walletAdapter });
  }, [client, rpcUrl, networkPassphrase, contractId, walletAdapter]);
}

export type UseVaultDepositOptions = UseVaultClientOptions;

/**
 * Wraps {@link VaultClient.deposit} with `loading` / `error` state.
 *
 * Omit `source` to let the connected wallet adapter sign, in which case
 * `caller` is also the transaction source account.
 *
 * @throws When no {@link VaultClient} could be resolved from the options.
 */
export function useVaultDeposit(options: UseVaultDepositOptions = {}) {
  const client = useVaultClient(options);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deposit = useCallback(
    async (
      caller: string,
      amount: bigint,
      source?: Keypair,
      minSharesOut?: bigint,
    ): Promise<TransactionResult> => {
      if (!client) {
        throw new Error('useVaultDeposit requires a VaultClient via the `client` option');
      }
      try {
        setLoading(true);
        setError(null);
        return await client.deposit(caller, amount, source, minSharesOut);
      } catch (err) {
        const failure = err instanceof Error ? err : new Error(String(err));
        setError(failure);
        throw failure;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  return { deposit, client, loading, error };
}

export interface UseVaultShareBalanceOptions extends UseVaultClientOptions {
  /** Skip fetching while false. @default true */
  enabled?: boolean;
}

/**
 * Reads a depositor's vault share balance through {@link VaultClient}.
 * Returns `data: null` when no address is given or no client is available.
 */
export function useVaultShareBalance(
  address: string | undefined,
  options: UseVaultShareBalanceOptions = {},
) {
  const { enabled = true, ...clientOptions } = options;
  const client = useVaultClient(clientOptions);
  const [data, setData] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!client || !address || !enabled) return;
    try {
      setLoading(true);
      setError(null);
      setData(await client.getShareBalance(address));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, address, enabled]);

  useEffect(() => {
    void (async () => {
      await refetch();
    })();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// ─── Proposal voting (#950) ───────────────────────────────────────────────────

/**
 * Multi-sig proposal actions, backed by `bcForgeClient.approveProposal` and
 * `bcForgeClient.executeProposal`.
 *
 * Uses the optional context client so {@link ProposalVotingPanel} can also be
 * driven entirely by its `onVote` / `onExecute` props.
 */
export function useProposalVoting() {
  const client = useOptionalBcForgeClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(
    async (id: string, action: (source?: Keypair) => Promise<TransactionResult>) => {
      setPendingId(id);
      setError(null);
      try {
        return await action();
      } catch (err) {
        const failure = err instanceof Error ? err : new Error(String(err));
        setError(failure);
        throw failure;
      } finally {
        setPendingId(null);
      }
    },
    [],
  );

  const approve = useCallback(
    async (admin: string, proposalId: bigint, source?: Keypair) => {
      if (!client) {
        throw new Error('useProposalVoting requires a BcForgeProvider client');
      }
      return run(proposalId.toString(), () => client.approveProposal(admin, proposalId, source));
    },
    [client, run],
  );

  const execute = useCallback(
    async (proposalId: bigint, source?: Keypair) => {
      if (!client) {
        throw new Error('useProposalVoting requires a BcForgeProvider client');
      }
      return run(proposalId.toString(), () => client.executeProposal(proposalId, source));
    },
    [client, run],
  );

  return { approve, execute, pendingId, error, available: client !== null };
}
