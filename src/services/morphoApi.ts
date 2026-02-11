/**
 * Morpho API Service
 * Fetches real-time APY data from Morpho vaults via their GraphQL API
 */

import { type MorphoVaultApiItem, type MorphoVaultsResponse } from '../types/api';

// Debug mode - controlled by __DEV__
const DEBUG = __DEV__ ?? false;
const debugLog = (message: string, ...args: unknown[]) => {
  if (DEBUG) console.log(message, ...args);
};

const MORPHO_API_URL = 'https://api.morpho.org/graphql';
const BASE_CHAIN_ID = 8453;

// Our vault addresses on Base (lowercase for matching)
// Verified: 2026-02-11 via on-chain data
const VAULT_ADDRESSES = {
  STEAKHOUSE_HIGH_YIELD: '0xbeeff7ae5e00aae3db302e4b0d8c883810a58100', // Steakhouse High Yield Instant (~$3.7M TVL)
  RE7_USDC: '0x618495ccc4e751178c4914b1e939c0fe0fb07b9b',              // Re7 USDC (~$1.3M TVL)
  STEAKHOUSE_PRIME: '0xbeef0e0834849acc03f0089f01f4f1eeb06873c9',      // Steakhouse Prime Instant (~$7.4M TVL)
};

// Allocation percentages for weighted APY calculation (must match strategies.ts)
const ALLOCATIONS: Record<string, number> = {
  [VAULT_ADDRESSES.STEAKHOUSE_HIGH_YIELD]: 40,
  [VAULT_ADDRESSES.RE7_USDC]: 35,
  [VAULT_ADDRESSES.STEAKHOUSE_PRIME]: 25,
};

export interface VaultApyData {
  address: string;
  name: string;
  symbol: string;
  avgApy: number;      // Average APY (7-day average, excluding rewards)
  avgNetApy: number;   // Net APY (7-day average, after fees, including rewards)
}

export interface ApyResult {
  vaults: VaultApyData[];
  weightedApy: number;      // Weighted average APY based on allocations
  weightedNetApy: number;   // Weighted average Net APY
  lastUpdated: Date;
}

/**
 * GraphQL query to fetch APY data for our vaults on Base
 * Uses SEVEN_DAYS lookback for more stable APY values (smooths out volatility)
 */
const APY_QUERY = `
  query GetVaultApys($addresses: [String!]!) {
    vaultV2s(
      where: {
        address_in: $addresses,
        chainId_in: [8453]
      }
    ) {
      items {
        address
        name
        symbol
        avgApy(lookback: SEVEN_DAYS)
        avgNetApy(lookback: SEVEN_DAYS)
        performanceFee
        totalAssets
      }
    }
  }
`;

/**
 * Alternative query - fetch all Base vaults
 */
const ALL_VAULTS_QUERY = `
  query GetAllBaseVaults {
    vaultV2s(
      first: 100,
      where: { chainId_in: [8453] }
    ) {
      items {
        address
        name
        symbol
        avgApy(lookback: SEVEN_DAYS)
        avgNetApy(lookback: SEVEN_DAYS)
        performanceFee
        totalAssets
      }
    }
  }
`;

/**
 * Query to get USDC market rates on Base as fallback
 */
const USDC_MARKET_QUERY = `
  query GetUsdcMarketRates {
    vaultV2s(
      first: 20,
      where: {
        chainId_in: [8453],
        symbol_contains_nocase: "USDC"
      }
    ) {
      items {
        address
        name
        symbol
        avgApy(lookback: SEVEN_DAYS)
        avgNetApy(lookback: SEVEN_DAYS)
        totalAssets
      }
    }
  }
`;

/**
 * Fetch real APY data from Morpho API
 */
export async function fetchVaultApys(): Promise<ApyResult> {
  try {
    // Try targeted query first
    const response = await fetch(MORPHO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: APY_QUERY,
        variables: {
          addresses: Object.values(VAULT_ADDRESSES),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data: MorphoVaultsResponse = await response.json();

    // Check if we got results
    let vaultItems: MorphoVaultApiItem[] = data?.data?.vaultV2s?.items || [];

    // If no results from our specific vaults, get market rates
    if (vaultItems.length === 0) {
      debugLog('[MorphoAPI] Our vaults not indexed, fetching USDC market rates...');
      const marketResponse = await fetch(MORPHO_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: USDC_MARKET_QUERY,
        }),
      });

      if (marketResponse.ok) {
        const marketData: MorphoVaultsResponse = await marketResponse.json();
        const allVaults: MorphoVaultApiItem[] = marketData?.data?.vaultV2s?.items || [];

        // Filter to vaults with meaningful APY (> 1%)
        vaultItems = allVaults.filter((v) => {
          const apy = parseFloat(v.avgApy || '0');
          return apy > 0.01; // More than 1% APY
        });

        debugLog('[MorphoAPI] Found', vaultItems.length, 'active USDC vaults');
      }
    }

    // Process vault data
    const vaults: VaultApyData[] = vaultItems.map((vault) => ({
      address: vault.address?.toLowerCase() || '',
      name: vault.name || 'Unknown',
      symbol: vault.symbol || '',
      avgApy: parseFloat(vault.avgApy || '0') * 100, // Convert to percentage
      avgNetApy: parseFloat(vault.avgNetApy || '0') * 100,
    }));

    // Calculate weighted APY from our vaults
    let weightedApy = 0;
    let weightedNetApy = 0;
    let totalWeight = 0;

    for (const vault of vaults) {
      const allocation = ALLOCATIONS[vault.address] || 0;
      if (allocation > 0) {
        weightedApy += vault.avgApy * allocation;
        weightedNetApy += vault.avgNetApy * allocation;
        totalWeight += allocation;
      }
    }

    // If we didn't find our specific vaults, calculate average market rate
    if (totalWeight === 0 && vaults.length > 0) {
      // Sort by APY and take top 5 for a reasonable average
      const sortedVaults = [...vaults].sort((a, b) => b.avgApy - a.avgApy);
      const topVaults = sortedVaults.slice(0, 5);

      const avgApy = topVaults.reduce((sum, v) => sum + v.avgApy, 0) / topVaults.length;
      const avgNetApy = topVaults.reduce((sum, v) => sum + v.avgNetApy, 0) / topVaults.length;

      weightedApy = avgApy;
      weightedNetApy = avgNetApy;

      debugLog('[MorphoAPI] Using market average from top 5 vaults:', {
        avgApy: avgApy.toFixed(2),
        topVaults: topVaults.map(v => `${v.name}: ${v.avgApy.toFixed(1)}%`),
      });
    } else if (totalWeight > 0) {
      weightedApy = weightedApy / totalWeight;
      weightedNetApy = weightedNetApy / totalWeight;
    }

    debugLog('[MorphoAPI] Final APY:', {
      vaultsFound: vaults.length,
      weightedApy: weightedApy.toFixed(2),
      weightedNetApy: weightedNetApy.toFixed(2),
    });

    return {
      vaults,
      weightedApy: weightedApy || 5.1, // Fallback if still 0
      weightedNetApy: weightedNetApy || 5.1,
      lastUpdated: new Date(),
    };
  } catch (error) {
    console.error('[MorphoAPI] Error fetching APY:', error);

    // Return fallback data on error
    return {
      vaults: [],
      weightedApy: 5.1, // Fallback to default
      weightedNetApy: 5.1,
      lastUpdated: new Date(),
    };
  }
}

/**
 * Get a single formatted APY string (for display)
 */
export async function getDisplayApy(): Promise<string> {
  const result = await fetchVaultApys();

  // Use net APY if available, otherwise use average APY
  const apy = result.weightedNetApy > 0 ? result.weightedNetApy : result.weightedApy;

  // Format to 1 decimal place
  return apy.toFixed(1);
}

/**
 * Cache for APY data (refresh every 5 minutes)
 */
let cachedApyResult: ApyResult | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached APY data (with auto-refresh)
 */
export async function getCachedApyData(): Promise<ApyResult> {
  const now = Date.now();

  if (cachedApyResult && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedApyResult;
  }

  cachedApyResult = await fetchVaultApys();
  lastFetchTime = now;

  return cachedApyResult;
}

/**
 * Force refresh APY cache
 */
export async function refreshApyCache(): Promise<ApyResult> {
  cachedApyResult = await fetchVaultApys();
  lastFetchTime = Date.now();
  return cachedApyResult;
}
