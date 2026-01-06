import { TOKENS } from './contracts';

/**
 * Morpho Vault definition
 * Each vault represents a specific lending market
 */
export interface MorphoVault {
  id: string;
  name: string;
  address: `0x${string}`;
  asset: `0x${string}`; // The token being deposited (USDC, ETH, etc.)
  assetSymbol: string;
  assetDecimals: number;
  apy: number; // Current APY in percentage
  tvl: string; // Total Value Locked
  curator: string; // Who manages the vault
}

/**
 * Strategy allocation - how much goes to each vault
 */
export interface VaultAllocation {
  vault: MorphoVault;
  percentage: number; // 0-100
}

/**
 * Risk level for strategies
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Strategy definition
 */
export interface Strategy {
  id: string;
  name: string;
  description: string;
  asset: `0x${string}`; // Input token (what user deposits)
  assetSymbol: string;
  assetDecimals: number;
  riskLevel: RiskLevel;
  expectedApy: number; // Weighted average APY
  allocations: VaultAllocation[];
  minDeposit: string; // Minimum deposit in human-readable format
  tags: string[];
}

// ============================================
// MORPHO VAULTS ON BASE (Real addresses)
// ============================================

// Note: These are real Morpho vault addresses on Base mainnet
// You can find more at: https://app.morpho.org/base

export const MORPHO_VAULTS: Record<string, MorphoVault> = {
  // Gauntlet USDC Core vault
  GAUNTLET_USDC_CORE: {
    id: 'gauntlet-usdc-core',
    name: 'Gauntlet USDC Core',
    address: '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca',
    asset: TOKENS.USDC as `0x${string}`,
    assetSymbol: 'USDC',
    assetDecimals: 6,
    apy: 5.2,
    tvl: '$45M',
    curator: 'Gauntlet',
  },

  // Steakhouse Prime USDC vault (correct Base address)
  STEAKHOUSE_USDC: {
    id: 'steakhouse-usdc',
    name: 'Steakhouse Prime USDC',
    address: '0xBEEFE94c8aD530842bfE7d8B397938fFc1cb83b2',
    asset: TOKENS.USDC as `0x${string}`,
    assetSymbol: 'USDC',
    assetDecimals: 6,
    apy: 4.8,
    tvl: '$32M',
    curator: 'Steakhouse Financial',
  },

  // Re7 USDC vault
  RE7_USDC: {
    id: 're7-usdc',
    name: 'Re7 USDC',
    address: '0x616a4E1db48e22028f6bbf20444Cd3b8e3273738',
    asset: TOKENS.USDC as `0x${string}`,
    assetSymbol: 'USDC',
    assetDecimals: 6,
    apy: 5.5,
    tvl: '$28M',
    curator: 'Re7 Capital',
  },

  // Moonwell Flagship USDC
  MOONWELL_USDC: {
    id: 'moonwell-usdc',
    name: 'Moonwell Flagship USDC',
    address: '0xc72b5f5e4B2a2F91DdE7F87C5a3e2bD6b4e16A10',
    asset: TOKENS.USDC as `0x${string}`,
    assetSymbol: 'USDC',
    assetDecimals: 6,
    apy: 4.5,
    tvl: '$18M',
    curator: 'Moonwell',
  },

  // Gauntlet WETH Core
  GAUNTLET_WETH_CORE: {
    id: 'gauntlet-weth-core',
    name: 'Gauntlet WETH Core',
    address: '0x2371e134e3455e0593363cBF89d3b6cf53740618',
    asset: TOKENS.WETH as `0x${string}`,
    assetSymbol: 'WETH',
    assetDecimals: 18,
    apy: 3.2,
    tvl: '$65M',
    curator: 'Gauntlet',
  },

  // Steakhouse ETH
  STEAKHOUSE_ETH: {
    id: 'steakhouse-eth',
    name: 'Steakhouse ETH',
    address: '0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1',
    asset: TOKENS.WETH as `0x${string}`,
    assetSymbol: 'WETH',
    assetDecimals: 18,
    apy: 3.8,
    tvl: '$42M',
    curator: 'Steakhouse Financial',
  },
};

// ============================================
// YIELD STRATEGIES
// ============================================

export const STRATEGIES: Strategy[] = [
  {
    id: 'conservative-usdc',
    name: 'Conservative USDC',
    description: 'Stable yield across battle-tested vaults. Diversified exposure minimizes risk while maintaining solid returns.',
    asset: TOKENS.USDC as `0x${string}`,
    assetSymbol: 'USDC',
    assetDecimals: 6,
    riskLevel: 'low',
    expectedApy: 5.1,
    minDeposit: '1',
    tags: ['Stable', 'Diversified', 'Blue Chip'],
    allocations: [
      { vault: MORPHO_VAULTS.GAUNTLET_USDC_CORE, percentage: 40 },
      { vault: MORPHO_VAULTS.STEAKHOUSE_USDC, percentage: 35 },
      { vault: MORPHO_VAULTS.RE7_USDC, percentage: 25 },
    ],
  },
  {
    id: 'balanced-usdc',
    name: 'Balanced USDC',
    description: 'Optimized allocation across four vaults for maximum diversification and consistent yield.',
    asset: TOKENS.USDC as `0x${string}`,
    assetSymbol: 'USDC',
    assetDecimals: 6,
    riskLevel: 'medium',
    expectedApy: 5.3,
    minDeposit: '1',
    tags: ['Optimized', 'Multi-Vault', 'Balanced'],
    allocations: [
      { vault: MORPHO_VAULTS.GAUNTLET_USDC_CORE, percentage: 30 },
      { vault: MORPHO_VAULTS.STEAKHOUSE_USDC, percentage: 25 },
      { vault: MORPHO_VAULTS.RE7_USDC, percentage: 25 },
      { vault: MORPHO_VAULTS.MOONWELL_USDC, percentage: 20 },
    ],
  },
  {
    id: 'max-yield-usdc',
    name: 'Max Yield USDC',
    description: 'Concentrated in highest-yielding vaults. Higher potential returns with managed risk.',
    asset: TOKENS.USDC as `0x${string}`,
    assetSymbol: 'USDC',
    assetDecimals: 6,
    riskLevel: 'medium',
    expectedApy: 5.5,
    minDeposit: '1',
    tags: ['High Yield', 'Concentrated'],
    allocations: [
      { vault: MORPHO_VAULTS.RE7_USDC, percentage: 50 },
      { vault: MORPHO_VAULTS.GAUNTLET_USDC_CORE, percentage: 50 },
    ],
  },
  {
    id: 'eth-yield',
    name: 'ETH Yield',
    description: 'Earn yield on your ETH through diversified lending strategies.',
    asset: TOKENS.WETH as `0x${string}`,
    assetSymbol: 'ETH',
    assetDecimals: 18,
    riskLevel: 'medium',
    expectedApy: 3.5,
    minDeposit: '0.01',
    tags: ['ETH', 'Lending'],
    allocations: [
      { vault: MORPHO_VAULTS.GAUNTLET_WETH_CORE, percentage: 60 },
      { vault: MORPHO_VAULTS.STEAKHOUSE_ETH, percentage: 40 },
    ],
  },
];

// ============================================
// MORPHO VAULT ABI (ERC4626 Standard)
// ============================================

export const MORPHO_VAULT_ABI = [
  // ERC4626 deposit
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  // ERC4626 withdraw
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  // ERC4626 redeem (withdraw by shares)
  {
    name: 'redeem',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: 'assets', type: 'uint256' }],
  },
  // Get shares balance
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Convert shares to assets
  {
    name: 'convertToAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Get total assets
  {
    name: 'totalAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Preview deposit
  {
    name: 'previewDeposit',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get strategy by ID
 */
export function getStrategyById(id: string): Strategy | undefined {
  return STRATEGIES.find(s => s.id === id);
}

/**
 * Get strategies by asset
 */
export function getStrategiesByAsset(assetAddress: string): Strategy[] {
  return STRATEGIES.filter(
    s => s.asset.toLowerCase() === assetAddress.toLowerCase()
  );
}

/**
 * Calculate weighted APY for a strategy
 */
export function calculateWeightedApy(allocations: VaultAllocation[]): number {
  return allocations.reduce((total, alloc) => {
    return total + (alloc.vault.apy * alloc.percentage) / 100;
  }, 0);
}

/**
 * Get risk level color
 */
export function getRiskLevelColor(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return '#22c55e'; // green
    case 'medium':
      return '#eab308'; // yellow
    case 'high':
      return '#ef4444'; // red
    default:
      return '#71717a';
  }
}

/**
 * Get risk level label
 */
export function getRiskLevelLabel(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return 'Low Risk';
    case 'medium':
      return 'Medium Risk';
    case 'high':
      return 'High Risk';
    default:
      return 'Unknown';
  }
}
