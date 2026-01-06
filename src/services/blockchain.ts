/**
 * Blockchain Service
 * Fetches wallet balances and vault positions from Base chain
 */

import { formatEther, formatUnits, type Address, encodeFunctionData } from 'viem';
import { BASE_RPC_URL, BASE_RPC_FALLBACK, TOKENS } from '../constants/contracts';
import { MORPHO_VAULTS, MORPHO_VAULT_ABI } from '../constants/strategies';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function hexToBigInt(hex: string): bigint {
  if (!hex || hex === '0x' || hex === '0x0') return BigInt(0);
  try {
    return BigInt(hex);
  } catch {
    return BigInt(0);
  }
}

export interface TokenBalance {
  symbol: string;
  balance: string;
  balanceRaw: bigint;
  decimals: number;
  usdValue: string;
}

export interface WalletBalances {
  eth: TokenBalance;
  usdc: TokenBalance | null;
  totalUsdValue: string;
  isLoading: boolean;
  error: string | null;
}

export interface VaultPosition {
  vaultId: string;
  vaultName: string;
  vaultAddress: string;
  shares: bigint;
  sharesFormatted: string;
  assets: bigint;
  assetsFormatted: string;
  usdValue: string;
}

export interface PositionsResult {
  positions: VaultPosition[];
  totalUsdValue: string;
  isLoading: boolean;
  error: string | null;
}

/**
 * RPC call with retry and fallback
 */
async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const rpcs = [BASE_RPC_URL, BASE_RPC_FALLBACK];

  for (let attempt = 0; attempt < 3; attempt++) {
    const rpcUrl = rpcs[Math.min(attempt, rpcs.length - 1)];

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });

      const data = await response.json();

      if (data.error) {
        if (data.error.message?.includes('rate') || data.error.code === -32005) {
          console.log(`[RPC] Rate limited on ${rpcUrl}, retrying...`);
        }
        if (attempt < 2) {
          await delay(1000 * (attempt + 1)); // Exponential backoff
          continue;
        }
        throw new Error(data.error.message);
      }

      return data.result;
    } catch (error) {
      if (attempt < 2) {
        console.log(`[RPC] Attempt ${attempt + 1} failed, retrying...`);
        await delay(1000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Fetch ETH balance
 */
export async function getEthBalance(address: Address): Promise<bigint> {
  try {
    const result = await rpcCall('eth_getBalance', [address, 'latest']);
    return hexToBigInt(result as string);
  } catch {
    return BigInt(0);
  }
}

/**
 * Fetch USDC balance
 */
export async function getUsdcBalance(address: Address): Promise<bigint> {
  try {
    const selector = '0x70a08231';
    const paddedAddress = address.toLowerCase().replace('0x', '').padStart(64, '0');
    const data = selector + paddedAddress;

    const result = await rpcCall('eth_call', [
      { to: TOKENS.USDC, data },
      'latest',
    ]);

    return hexToBigInt(result as string);
  } catch {
    return BigInt(0);
  }
}

/**
 * Fetch ETH and USDC balances
 */
export async function getAllBalances(address: Address): Promise<WalletBalances> {
  try {
    const [ethRaw, usdcRaw] = await Promise.all([
      getEthBalance(address),
      getUsdcBalance(address),
    ]);

    const ethBalance = formatEther(ethRaw);
    const usdcBalance = formatUnits(usdcRaw, 6);

    const ethUsd = parseFloat(ethBalance) * 3500;
    const usdcUsd = parseFloat(usdcBalance);

    return {
      eth: {
        symbol: 'ETH',
        balance: ethBalance,
        balanceRaw: ethRaw,
        decimals: 18,
        usdValue: ethUsd.toFixed(2),
      },
      usdc: {
        symbol: 'USDC',
        balance: usdcBalance,
        balanceRaw: usdcRaw,
        decimals: 6,
        usdValue: usdcUsd.toFixed(2),
      },
      totalUsdValue: (ethUsd + usdcUsd).toFixed(2),
      isLoading: false,
      error: null,
    };
  } catch (error) {
    return {
      eth: { symbol: 'ETH', balance: '0', balanceRaw: BigInt(0), decimals: 18, usdValue: '0.00' },
      usdc: null,
      totalUsdValue: '0.00',
      isLoading: false,
      error: error instanceof Error ? error.message : 'Failed to fetch balances',
    };
  }
}

/**
 * Get vault share balance for a user
 * Vault shares have 18 decimals
 */
async function getVaultShares(vaultAddress: string, userAddress: Address): Promise<bigint> {
  try {
    // balanceOf(address) selector
    const selector = '0x70a08231';
    const paddedAddress = userAddress.toLowerCase().replace('0x', '').padStart(64, '0');
    const data = selector + paddedAddress;

    const result = await rpcCall('eth_call', [
      { to: vaultAddress, data },
      'latest',
    ]);

    return hexToBigInt(result as string);
  } catch (error) {
    console.log(`[Positions] Failed to get shares for vault ${vaultAddress}:`, error);
    return BigInt(0);
  }
}

/**
 * Convert vault shares to underlying assets (USDC)
 * Uses ERC4626 convertToAssets(shares)
 */
async function convertSharesToAssets(vaultAddress: string, shares: bigint): Promise<bigint> {
  if (shares === BigInt(0)) return BigInt(0);

  try {
    // convertToAssets(uint256) selector
    const selector = '0x07a2d13a';
    const paddedShares = shares.toString(16).padStart(64, '0');
    const data = selector + paddedShares;

    const result = await rpcCall('eth_call', [
      { to: vaultAddress, data },
      'latest',
    ]);

    return hexToBigInt(result as string);
  } catch (error) {
    console.log(`[Positions] Failed to convert shares for vault ${vaultAddress}:`, error);
    return BigInt(0);
  }
}

/**
 * Get all vault positions for a user
 * Returns positions in USDC vaults only (Conservative strategy)
 */
export async function getVaultPositions(userAddress: Address): Promise<PositionsResult> {
  console.log(`[Positions] Fetching positions for ${userAddress}`);

  try {
    // Get USDC vaults from strategy (matches strategies.ts allocations)
    const usdcVaults = [
      MORPHO_VAULTS.STEAKHOUSE_HIGH_YIELD,
      MORPHO_VAULTS.RE7_USDC,
      MORPHO_VAULTS.STEAKHOUSE_PRIME,
    ];

    const positions: VaultPosition[] = [];
    let totalUsd = 0;

    // Fetch positions for each vault (show all, even with 0 balance)
    for (const vault of usdcVaults) {
      const shares = await getVaultShares(vault.address, userAddress);
      const assets = shares > BigInt(0)
        ? await convertSharesToAssets(vault.address, shares)
        : BigInt(0);

      // Shares are 18 decimals, assets (USDC) are 6 decimals
      const sharesFormatted = formatUnits(shares, 18);
      const assetsFormatted = formatUnits(assets, 6);
      const usdValue = parseFloat(assetsFormatted);

      positions.push({
        vaultId: vault.id,
        vaultName: vault.name,
        vaultAddress: vault.address,
        shares,
        sharesFormatted,
        assets,
        assetsFormatted,
        usdValue: usdValue.toFixed(6), // Full USDC precision for yield calculations
      });

      totalUsd += usdValue;

      if (shares > BigInt(0)) {
        console.log(`[Positions] ${vault.name}: ${usdValue.toFixed(2)} USDC`);
      } else {
        console.log(`[Positions] ${vault.name}: 0 USDC (no position)`);
      }
    }

    console.log(`[Positions] Total: $${totalUsd.toFixed(2)} across ${positions.length} vaults`);

    return {
      positions,
      totalUsdValue: totalUsd.toFixed(6), // Full precision for yield calculations
      isLoading: false,
      error: null,
    };
  } catch (error) {
    console.error('[Positions] Error fetching positions:', error);
    return {
      positions: [],
      totalUsdValue: '0.00',
      isLoading: false,
      error: error instanceof Error ? error.message : 'Failed to fetch positions',
    };
  }
}
