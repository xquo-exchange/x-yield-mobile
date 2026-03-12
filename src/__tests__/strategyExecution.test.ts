/**
 * Tests for critical financial logic in strategyExecution.ts
 *
 * buildWithdrawBatch: full withdrawal with fee calculation
 * buildPartialWithdrawBatch: partial withdrawal with proportional distribution
 */

// Mock dependencies before importing anything
jest.mock('viem', () => ({
  encodeFunctionData: jest.fn(() => '0xmockdata'),
  parseUnits: jest.fn((value: string, decimals: number) =>
    BigInt(Math.floor(parseFloat(value) * 10 ** decimals)),
  ),
}));

jest.mock('../services/notifications', () => ({
  sendTransactionNotification: jest.fn(),
}));

jest.mock('../services/rpc', () => ({
  rpcCall: jest.fn(),
  hexToBigInt: jest.fn((hex: string) => BigInt(hex)),
  delay: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { buildWithdrawBatch, buildPartialWithdrawBatch } from '../services/strategyExecution';
import type { VaultPosition } from '../services/blockchain';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`;
const FEE_PERCENT = 15;
const MIN_FEE = 0.000001;

/** Helper to create a VaultPosition with known values */
function makePosition(overrides: {
  vaultId?: string;
  vaultName?: string;
  vaultAddress?: string;
  shares?: bigint;
  assets?: bigint;
  usdValue?: string;
}): VaultPosition {
  const assets = overrides.assets ?? BigInt(0);
  const usdVal = overrides.usdValue ?? (Number(assets) / 1_000_000).toFixed(6);
  return {
    vaultId: overrides.vaultId ?? 'vault-1',
    vaultName: overrides.vaultName ?? 'Test Vault',
    vaultAddress: overrides.vaultAddress ?? '0xVAULT1',
    shares: overrides.shares ?? BigInt(0),
    sharesFormatted: (Number(overrides.shares ?? BigInt(0)) / 1e18).toString(),
    assets,
    assetsFormatted: (Number(assets) / 1_000_000).toFixed(6),
    usdValue: usdVal,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// buildWithdrawBatch
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildWithdrawBatch', () => {
  test('calculates 15% fee on yield only', () => {
    // Deposited $100, now worth $110 → yield = $10 → fee = $1.50
    const positions = [
      makePosition({
        shares: BigInt(100e18),
        assets: BigInt(110_000_000), // $110 in USDC (6 decimals)
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 100);

    expect(result.hasProfits).toBe(true);
    expect(result.currentValue).toBe('110.000000');
    expect(result.totalDeposited).toBe('100.000000');
    expect(result.yieldAmount).toBe('10.000000');
    expect(result.feeAmount).toBe('1.500000');
    expect(result.userReceives).toBe('108.500000');
    expect(result.feePercent).toBe(FEE_PERCENT);
  });

  test('charges no fee when no yield (break-even)', () => {
    // Deposited $100, still worth $100
    const positions = [
      makePosition({
        shares: BigInt(100e18),
        assets: BigInt(100_000_000),
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 100);

    expect(result.hasProfits).toBe(false);
    expect(result.feeAmount).toBe('0.000000');
    expect(result.feeAmountRaw).toBe(BigInt(0));
    expect(result.userReceives).toBe('100.000000');
  });

  test('charges no fee on loss', () => {
    // Deposited $100, now worth $95
    const positions = [
      makePosition({
        shares: BigInt(100e18),
        assets: BigInt(95_000_000),
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 100);

    expect(result.hasProfits).toBe(false);
    expect(result.yieldAmount).toBe('-5.000000');
    expect(result.feeAmount).toBe('0.000000');
    expect(result.feeAmountRaw).toBe(BigInt(0));
    expect(result.userReceives).toBe('95.000000');
  });

  test('handles zero balance positions (no shares)', () => {
    const positions = [makePosition({ shares: BigInt(0), assets: BigInt(0) })];

    const result = buildWithdrawBatch(positions, WALLET, 0);

    expect(result.calls).toHaveLength(0);
    expect(result.positions).toHaveLength(0);
    expect(result.currentValue).toBe('0.000000');
    expect(result.hasProfits).toBe(false);
  });

  test('aggregates multiple vaults correctly', () => {
    // Vault A: $60, Vault B: $50 → total $110. Deposited $100.
    const positions = [
      makePosition({
        vaultId: 'vault-a',
        vaultAddress: '0xA',
        shares: BigInt(60e18),
        assets: BigInt(60_000_000),
      }),
      makePosition({
        vaultId: 'vault-b',
        vaultAddress: '0xB',
        shares: BigInt(50e18),
        assets: BigInt(50_000_000),
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 100);

    expect(result.positions).toHaveLength(2);
    expect(result.currentValue).toBe('110.000000');
    expect(result.yieldAmount).toBe('10.000000');
    expect(result.feeAmount).toBe('1.500000');
    expect(result.userReceives).toBe('108.500000');
    // 2 redeem calls + 1 fee transfer = 3
    expect(result.calls).toHaveLength(3);
  });

  test('skips zero-share positions in multi-vault', () => {
    const positions = [
      makePosition({
        vaultId: 'vault-a',
        shares: BigInt(50e18),
        assets: BigInt(50_000_000),
      }),
      makePosition({
        vaultId: 'vault-b',
        shares: BigInt(0),
        assets: BigInt(0),
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 40);

    expect(result.positions).toHaveLength(1);
    // 1 redeem + 1 fee transfer
    expect(result.calls).toHaveLength(2);
    expect(result.yieldAmount).toBe('10.000000');
  });

  test('security safeguard: no deposit record treats current as deposit (no fee)', () => {
    // totalDeposited = 0 but positions exist (e.g. app reinstall)
    const positions = [
      makePosition({
        shares: BigInt(100e18),
        assets: BigInt(100_000_000),
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 0);

    expect(result.hasProfits).toBe(false);
    expect(result.feeAmount).toBe('0.000000');
    expect(result.totalDeposited).toBe('100.000000');
    expect(result.currentValue).toBe('100.000000');
    expect(result.userReceives).toBe('100.000000');
  });

  test('feeAmountRaw is set to 0 when fee below minimum threshold', () => {
    // Very tiny yield: $0.000001 → fee = $0.00000015 (below MIN_FEE of $0.000001)
    // Deposited $100, now worth $100.000001
    const positions = [
      makePosition({
        shares: BigInt(100e18),
        assets: BigInt(100_000_001), // $100.000001
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 100);

    expect(result.hasProfits).toBe(true);
    // Fee = 0.000001 * 0.15 = 0.00000015, below min fee
    expect(result.feeAmountRaw).toBe(BigInt(0));
  });

  test('yield percent calculation is correct', () => {
    // Deposited $200, now worth $220 → yield = $20 → 10%
    const positions = [
      makePosition({
        shares: BigInt(200e18),
        assets: BigInt(220_000_000),
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 200);

    expect(result.yieldPercent).toBe('10.0');
  });

  test('fee transfer call is included when fee above minimum', () => {
    // Deposited $100, now $200 → yield $100 → fee $15
    const positions = [
      makePosition({
        shares: BigInt(100e18),
        assets: BigInt(200_000_000),
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 100);

    expect(result.feeAmount).toBe('15.000000');
    expect(result.feeAmountRaw).toBe(BigInt(15_000_000));
    // 1 redeem + 1 fee transfer
    expect(result.calls).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPartialWithdrawBatch
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPartialWithdrawBatch', () => {
  test('withdraws proportionally from single vault', () => {
    // $100 position, withdraw $50 (50%)
    const positions = [
      makePosition({
        shares: BigInt(100e18),
        assets: BigInt(100_000_000),
        usdValue: '100.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 50, 80);

    // withdrawRatio = 50/100 = 0.5
    // proportional deposit = 80 * 0.5 = 40
    // total yield = max(0, 100 - 80) = 20
    // proportional yield = 20 * 0.5 = 10
    // fee = 10 * 0.15 = 1.5
    expect(result.hasProfits).toBe(true);
    expect(result.feePercent).toBe(FEE_PERCENT);
    expect(parseFloat(result.yieldAmount)).toBeCloseTo(10, 1);
    expect(parseFloat(result.feeAmount)).toBeCloseTo(1.5, 1);
  });

  test('distributes proportionally across multiple vaults', () => {
    // Vault A: $60, Vault B: $40 → total $100, withdraw $30 (30%)
    const positions = [
      makePosition({
        vaultId: 'vault-a',
        vaultAddress: '0xA',
        shares: BigInt(60e18),
        assets: BigInt(60_000_000),
        usdValue: '60.000000',
      }),
      makePosition({
        vaultId: 'vault-b',
        vaultAddress: '0xB',
        shares: BigInt(40e18),
        assets: BigInt(40_000_000),
        usdValue: '40.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 30, 80);

    // Both vaults should be represented
    expect(result.positions).toHaveLength(2);

    // Check proportional shares
    // withdrawRatio = 30/100 = 0.3, round(0.3 * 1000000) = 300000
    // Vault A: 60e18 * 300000 / 1000000 = 18e18
    // Vault B: 40e18 * 300000 / 1000000 = 12e18
    expect(result.positions[0].shares).toBe((BigInt(60e18) * BigInt(300000)) / BigInt(1000000));
    expect(result.positions[1].shares).toBe((BigInt(40e18) * BigInt(300000)) / BigInt(1000000));
  });

  test('delegates to full withdraw when amount >= 99% of total', () => {
    const positions = [
      makePosition({
        shares: BigInt(100e18),
        assets: BigInt(100_000_000),
        usdValue: '100.000000',
      }),
    ];

    // Withdrawing $99.50 out of $100 → >= 99% threshold
    const result = buildPartialWithdrawBatch(positions, WALLET, 99.5, 90);

    // Should use full withdraw logic (totalDeposited format from buildWithdrawBatch)
    expect(result.currentValue).toBe('100.000000');
  });

  test('no fee when no yield exists', () => {
    // $100 position, deposited $100 (no yield), withdraw $50
    const positions = [
      makePosition({
        shares: BigInt(100e18),
        assets: BigInt(100_000_000),
        usdValue: '100.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 50, 100);

    expect(result.hasProfits).toBe(false);
    expect(result.feeAmount).toBe('0.000000');
    expect(result.feeAmountRaw).toBe(BigInt(0));
  });

  test('no fee when position is at a loss', () => {
    // Deposited $120, now worth $100, withdraw $50
    const positions = [
      makePosition({
        shares: BigInt(100e18),
        assets: BigInt(100_000_000),
        usdValue: '100.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 50, 120);

    // totalYield = max(0, 100 - 120) = 0
    expect(result.hasProfits).toBe(false);
    expect(result.feeAmount).toBe('0.000000');
  });

  test('skips zero-share positions', () => {
    const positions = [
      makePosition({
        vaultId: 'vault-a',
        shares: BigInt(100e18),
        assets: BigInt(100_000_000),
        usdValue: '100.000000',
      }),
      makePosition({
        vaultId: 'vault-b',
        shares: BigInt(0),
        assets: BigInt(0),
        usdValue: '0.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 30, 80);

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].vaultId).toBe('vault-a');
  });

  test('proportional yield percent is calculated correctly', () => {
    // $200 total, deposited $150, withdraw $100 (50%)
    const positions = [
      makePosition({
        shares: BigInt(200e18),
        assets: BigInt(200_000_000),
        usdValue: '200.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 100, 150);

    // withdrawRatio = 100/200 = 0.5
    // depositPortion = 150 * 0.5 = 75
    // totalYield = max(0, 200 - 150) = 50
    // proportionalYield = 50 * 0.5 = 25
    // yieldPercent = (25 / 75) * 100 = 33.3%
    expect(result.yieldPercent).toBe('33.3');
    expect(result.hasProfits).toBe(true);
    expect(parseFloat(result.feeAmount)).toBeCloseTo(3.75, 1); // 25 * 0.15
  });

  test('small partial withdrawal calculates correct fee', () => {
    // $1000 total, deposited $800 (yield $200), withdraw $100 (10%)
    const positions = [
      makePosition({
        shares: BigInt(1000e18),
        assets: BigInt(1_000_000_000),
        usdValue: '1000.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 100, 800);

    // withdrawRatio = 100/1000 = 0.1
    // totalYield = 200, proportionalYield = 200 * 0.1 = 20
    // fee = 20 * 0.15 = 3
    expect(parseFloat(result.yieldAmount)).toBeCloseTo(20, 1);
    expect(parseFloat(result.feeAmount)).toBeCloseTo(3, 1);
    expect(parseFloat(result.totalDeposited)).toBeCloseTo(80, 1); // 800 * 0.1
  });
});
