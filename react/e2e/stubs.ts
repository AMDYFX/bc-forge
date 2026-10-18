// SPDX-License-Identifier: MIT
import { Page } from '@playwright/test';
import { xdr, nativeToScVal } from '@stellar/stellar-sdk';

export const MOCK_PUBLIC_KEY = 'GBX67B452GD67B452GD67B452GD67B452GD67B452GD67B452GD67B452';
export const MOCK_SIGNED_XDR = 'AAAAF_FAKE_SIGNED_XDR';
export const MOCK_TX_HASH = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/**
 * Installs the Freighter wallet stub script via `page.addInitScript` before navigation.
 */
export async function installFreighterStub(
  page: Page,
  options: FreighterStubOptions | string = {},
) {
  const configuredOptions =
    typeof options === "string" ? { publicKey: options } : options;
  const stubOptions = {
    publicKey: configuredOptions.publicKey ?? MOCK_PUBLIC_KEY,
    networkPassphrase:
      configuredOptions.networkPassphrase ?? TESTNET_PASSPHRASE,
    connected: configuredOptions.connected ?? true,
    connectionError: configuredOptions.connectionError,
    signingError: configuredOptions.signingError,
    signedXdr: MOCK_SIGNED_XDR,
  };

  await page.addInitScript((config) => {
    const createFakeAdapter = (
      adapterOptions: typeof config,
    ): FakeFreighterApi => ({
      isConnected: async () => adapterOptions.connected,
      getPublicKey: async () => {
        if (!adapterOptions.connected)
          throw new Error("Wallet is not connected.");
        if (adapterOptions.connectionError)
          throw new Error(adapterOptions.connectionError);
        return adapterOptions.publicKey;
      },
      getNetworkDetails: async () => ({
        networkPassphrase: 'Test SDF Network ; September 2015',
        network: 'TESTNET',
      }),
      getNetwork: async () => 'TESTNET',
      signTransaction: async (_xdr: string) => 'AAAAF_FAKE_SIGNED_XDR',
    };
  }, publicKey);
}

export interface NetworkStubOptions {
  balance?: bigint;
  hasRoles?: Record<string, boolean>;
  totalAssets?: bigint;
  totalShares?: bigint;
  sharePrice?: bigint;
  shareBalance?: bigint;
  nullApy?: boolean;
  mintError?: string;
}

/**
 * Intercepts network/RPC calls via `page.route` to eliminate testnet dependency.
 */
export async function installNetworkStubs(
  page: Page,
  options: NetworkStubOptions = {},
) {
  const balanceVal = options.balance ?? 1000n;
  const hasRoles = options.hasRoles ?? {
    Admin: false,
    SuperAdmin: true,
    Minter: true,
    Pauser: false,
  };
  const totalAssetsVal = options.totalAssets ?? 1000000n;
  const totalSharesVal = options.nullApy
    ? 0n
    : (options.totalShares ?? 100000n);
  const sharePriceVal = options.nullApy ? 0n : (options.sharePrice ?? 10n);
  const shareBalanceVal = options.shareBalance ?? 500n;

  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      return route.continue();
    }

    let body: SorobanRpcRequest;
    try {
      body = request.postDataJSON() as SorobanRpcRequest;
    } catch {
      return route.continue();
    }

    if (!body || body.jsonrpc !== '2.0') {
      return route.continue();
    }

    const id = body.id ?? 1;
    const method = body.method;

    if (method === 'getLatestLedger') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            sequence: 100000,
            id: '0000000000000000000000000000000000000000000000000000000000000000',
          },
        }),
      });
    }

    if (method === 'sendTransaction') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            status: 'PENDING',
            hash: MOCK_TX_HASH,
          },
        }),
      });
    }

    if (method === 'getTransaction') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            status: 'SUCCESS',
            latestLedger: 100000,
            createdAt: 100000,
            applicationOrder: 1,
            feeBump: false,
            envelopeXdr:
              'AAAAAgAAAADHAl7Ke2RlF4ObEDdhwkhV+HQvjgpswKreLG9GyIURgwAAAAAAAAAAAAAAZQAAAAEAAAAAAAAAAAAAAABq1ExDAAAAAAAAAAAAAAAAAAAAAA==',
            resultXdr: 'AAAAAAAAAGQAAAAAAAAAAAAAAAA=',
            resultMetaXdr: 'AAAAAAAAAAA=',
          },
        }),
      });
    }

    if (method === 'simulateTransaction') {
      const postData = request.postData() ?? '';
      let callData = postData;
      try {
        const txB64 = body?.params?.transaction;
        if (txB64) {
          callData = Buffer.from(txB64, 'base64').toString('latin1') + postData;
        }
      } catch {
        // Fallback to raw postData
      }
      let retvalXdr = 'AAAAAQAAAAA='; // default void / false

      if (callData.includes('total_assets')) {
        retvalXdr = nativeToScVal(totalAssetsVal, { type: 'i128' }).toXDR('base64');
      } else if (callData.includes('calculate_share_price')) {
        retvalXdr = nativeToScVal(sharePriceVal, { type: 'i128' }).toXDR('base64');
      } else if (callData.includes('share_balance')) {
        retvalXdr = nativeToScVal(shareBalanceVal, { type: 'i128' }).toXDR('base64');
      } else if (callData.includes('supply')) {
        retvalXdr = nativeToScVal(totalSharesVal, { type: 'i128' }).toXDR('base64');
      } else if (callData.includes('balance')) {
        retvalXdr = nativeToScVal(balanceVal, { type: 'i128' }).toXDR('base64');
      } else if (callData.includes('has_role')) {
        let granted = false;
        for (const [roleName, isGranted] of Object.entries(hasRoles)) {
          if (callData.includes(roleName) && isGranted) {
            granted = true;
            break;
          }
        }
        retvalXdr = xdr.ScVal.scvBool(granted).toXDR('base64');
      } else if (callData.includes('name')) {
        retvalXdr = xdr.ScVal.scvString('DemoToken').toXDR('base64');
      } else if (callData.includes('symbol')) {
        retvalXdr = xdr.ScVal.scvString('DEMO').toXDR('base64');
      } else if (callData.includes('decimals')) {
        retvalXdr = xdr.ScVal.scvU32(7).toXDR('base64');
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            latestLedger: 100000,
            minResourceFee: '100',
            transactionData: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            results: [
              {
                auth: [],
                xdr: retvalXdr,
              },
            ],
            retval: retvalXdr,
          },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {},
      }),
    });
  });
}
