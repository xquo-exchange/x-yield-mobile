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
// Verified via Morpho GraphQL API: https://api.morpho.org/graphql
// You can find more at: https://app.morpho.org/base

export const MORPHO_VAULTS: Record<string, MorphoVault> = {
  // Steakhouse High Yield Instant (bbqUSDC) - Highest TVL USDC vault
  STEAKHOUSE_HIGH_YIELD: {
    id: 'steakhouse-high-yield',
    name: 'Steakhouse High Yield',
    address: '0xbeeff7aE5E00Aae3Db302e4B0d8C883810a58100',
    asset: TOKENS.USDC as `0x${string}`,
    assetSymbol: 'USDC',
    assetDecimals: 6,
    apy: 5.4,
    tvl: '$2M',
    curator: 'Steakhouse Financial',
  },

  // Re7 USDC vault - Second highest TVL
  RE7_USDC: {
    id: 're7-usdc',
    name: 'Re7 USDC',
    address: '0x618495ccC4e751178C4914b1E939C0fe0FB07b9b',
    asset: TOKENS.USDC as `0x${string}`,
    assetSymbol: 'USDC',
    assetDecimals: 6,
    apy: 5.9,
    tvl: '$1.3M',
    curator: 'Re7 Capital',
  },

  // Steakhouse Prime Instant (steakUSDC)
  STEAKHOUSE_PRIME: {
    id: 'steakhouse-prime',
    name: 'Steakhouse Prime',
    address: '0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9',
    asset: TOKENS.USDC as `0x${string}`,
    assetSymbol: 'USDC',
    assetDecimals: 6,
    apy: 5.4,
    tvl: '$0.9M',
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
    expectedApy: 5.5,
    minDeposit: '1',
    tags: ['Stable', 'Diversified', 'Blue Chip'],
    allocations: [
      { vault: MORPHO_VAULTS.STEAKHOUSE_HIGH_YIELD, percentage: 40 },
      { vault: MORPHO_VAULTS.RE7_USDC, percentage: 35 },
      { vault: MORPHO_VAULTS.STEAKHOUSE_PRIME, percentage: 25 },
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
