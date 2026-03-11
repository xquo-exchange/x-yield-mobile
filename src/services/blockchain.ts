/**
 * Blockchain Service
 * Fetches wallet balances and vault positions from Base chain
 */

import { formatEther, formatUnits, type Address, encodeFunctionData } from 'viem';
import { TOKENS } from '../constants/contracts';
import { MORPHO_VAULTS, MORPHO_VAULT_ABI } from '../constants/strategies';
import { rpcCall, hexToBigInt } from './rpc';

// Debug mode - controlled by __DEV__
const DEBUG = __DEV__ ?? false;
const debugLog = (message: string, ...args: unknown[]) => {
  if (DEBUG) console.log(message, ...args);
};

// ETH price cache (5 minutes)
let cachedEthPrice: number | null = null;
let ethPriceFetchedAt = 0;
const ETH_PRICE_CACHE_MS = 5 * 60 * 1000;

/**
 * Fetch ETH price in USD from CoinGecko
 * Caches for 5 minutes, returns 0 on failure
 */
async function getEthPriceUsd(): Promise<number> {
  const now = Date.now();
  if (cachedEthPrice !== null && (now - ethPriceFetchedAt) < ETH_PRICE_CACHE_MS) {
    return cachedEthPrice;
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    );
    const data = await response.json();
    const price = data?.ethereum?.usd;
    if (typeof price === 'number' && price > 0) {
      cachedEthPrice = price;
      ethPriceFetchedAt = now;
      debugLog(`[Blockchain] ETH price fetched: $${price}`);
      return price;
    }
  } catch (error) {
    debugLog('[Blockchain] Failed to fetch ETH price:', error);
  }

  // Return cached value if available, otherwise 0
  return cachedEthPrice ?? 0;
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

    const ethPrice = await getEthPriceUsd();
    const ethUsd = parseFloat(ethBalance) * ethPrice;
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
    debugLog(`[Positions] Failed to get shares for vault ${vaultAddress}:`, error);
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
    debugLog(`[Positions] Failed to convert shares for vault ${vaultAddress}:`, error);
    return BigInt(0);
  }
}

/**
 * Get all vault positions for a user
 * Returns positions in USDC vaults only (Conservative strategy)
 */
export async function getVaultPositions(userAddress: Address): Promise<PositionsResult> {
  debugLog(`[Positions] Fetching positions for ${userAddress}`);

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
        debugLog(`[Positions] ${vault.name}: ${usdValue.toFixed(2)} USDC`);
      } else {
        debugLog(`[Positions] ${vault.name}: 0 USDC (no position)`);
      }
    }

    debugLog(`[Positions] Total: $${totalUsd.toFixed(2)} across ${positions.length} vaults`);

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
