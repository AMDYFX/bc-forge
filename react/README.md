# @bc-forge/react

React hooks and components for the bc-forge SDK.

Supported Node, React, Stellar SDK, and package ranges are in the [compatibility matrix](../docs/COMPATIBILITY.md).

## Installation

Install the package and its peer dependencies:

```bash
npm install @bc-forge/react react react-dom @stellar/stellar-sdk
```

Peer ranges are declared in `react/package.json`:

- `react` and `react-dom`: `^18.0.0 || ^19.0.0`
- `@stellar/stellar-sdk`: `^16.0.1`

`@bc-forge/sdk` is a runtime dependency and is installed with the package.

## Provider

Wrap the tree that calls hooks in `BcForgeProvider`. `config` is a `bcForgeClientConfig` (`rpcUrl`, `networkPassphrase`, `contractId`). Pass `vaultConfig` only when a screen calls `useVaultClient`.

```tsx
import { BcForgeProvider } from '@bc-forge/react';

const config = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  contractId: 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
};

export function App({ children }: { children: React.ReactNode }) {
  return <BcForgeProvider config={config}>{children}</BcForgeProvider>;
}
```

`useBcForgeClient` throws outside the provider. `useOptionalBcForgeClient` returns `null` instead, which is what the product components use when they render without a provider.

## Minimal example

```tsx
import { BcForgeProvider, useBalance } from '@bc-forge/react';

const config = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  contractId: 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
};

export function BalanceApp({ address }: { address: string }) {
  return (
    <BcForgeProvider config={config}>
      <Balance address={address} />
    </BcForgeProvider>
  );
}

function Balance({ address }: { address: string }) {
  const { data, loading, error } = useBalance(address);
  if (loading) return <p>Loading balance…</p>;
  if (error) return <p>{error.message}</p>;
  return <p>{data === null ? '—' : data.toString()}</p>;
}
```

`useBalance` reads the token balance through the SDK client created by the provider.

## Exports

Everything re-exported from `react/src/index.ts` is public. The names below are the hooks, components, and screens.

Hooks and client access:

- `BcForgeProvider`, `useBcForgeClient`, `useOptionalBcForgeClient`
- `useVaultClient`, `useOptionalVaultClient`
- `WalletProvider`, `useWallet`, `useWalletContext`, `truncatePublicKey`
- `useBcForgeToken`, `useBalance`, `useMint`, `useTotalSupply`, `useTransfer`
- `useApprove`, `useBurn`, `useAllowance`
- `useVaultDeposit`, `useVaultShareBalance`, `useProposalVote`, `useProposalVoting`

Components:

- `Alert`, `Badge`, `Dropdown`, `ConnectWallet`, `TokenCard`, `MintForm`
- `VaultDepositWidget`, `APYChart`, `ProposalVotingPanel`, `TransactionToast`
- `MINT_FORM_ERRORS`, `VAULT_DEPOSIT_NO_ACCOUNT`, `VAULT_DEPOSIT_NO_CLIENT`

Screens:

- `VaultsScreen`, `TransferScreen`, `BurnScreen`, `MintScreen`, `RolesScreen`
- `EMPTY_STATE_APY_MESSAGE`

Helpers from `react/src/utils.ts`: `isPositiveInteger`, `parsePositiveInteger`, `formatTokenAmount`, `formatApy`, `truncateMiddle`.

Prop and variant types (`AlertProps`, `BadgeVariant`, `DropdownItem`, and the rest) are exported next to the values they describe.

## Build and test

From the repository root, build the SDK first so React can compile against it:

```bash
npm run build --workspace @bc-forge/sdk
npm test --workspace @bc-forge/react
npm run build --workspace @bc-forge/react
```

The same scripts exist in `react/package.json` (`npm test`, `npm run build`) when that directory's dependencies are already installed.
