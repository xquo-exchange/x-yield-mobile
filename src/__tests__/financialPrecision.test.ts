/**
 * Tests for financial arithmetic precision across the codebase.
 *
 * Covers:
 * - calculateYield / calculatePerformanceFee (depositTracker.ts)
 * - Fee calculation in buildWithdrawBatch / buildPartialWithdrawBatch (strategyExecution.ts)
 * - Realized earnings via fee division (transactionHistory.ts)
 * - USDC BigInt ↔ Number conversions
 * - Edge cases: large amounts ($1M+), tiny amounts ($0.01), exact splits
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

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

// ── Imports ──────────────────────────────────────────────────────────────────

import { calculateYield, calculatePerformanceFee } from '../services/depositTracker';
import { buildWithdrawBatch, buildPartialWithdrawBatch } from '../services/strategyExecution';
import type { VaultPosition } from '../services/blockchain';

// ── Helpers ──────────────────────────────────────────────────────────────────

const WALLET = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`;

function makePosition(overrides: {
  vaultId?: string;
  vaultAddress?: string;
  shares?: bigint;
  assets?: bigint;
  usdValue?: string;
}): VaultPosition {
  const assets = overrides.assets ?? BigInt(0);
  const usdVal = overrides.usdValue ?? (Number(assets) / 1_000_000).toFixed(6);
  return {
    vaultId: overrides.vaultId ?? 'vault-1',
    vaultName: 'Test Vault',
    vaultAddress: overrides.vaultAddress ?? '0xVAULT1',
    shares: overrides.shares ?? BigInt(0),
    sharesFormatted: '0',
    assets,
    assetsFormatted: (Number(assets) / 1_000_000).toFixed(6),
    usdValue: usdVal,
  };
}

/** Convert a USD amount to USDC raw (6 decimal BigInt) */
function usdcRaw(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. calculateYield
// ═════════════════════════════════════════════════════════════════════════════

describe('calculateYield', () => {
  test('positive yield', () => {
    expect(calculateYield(110, 100)).toBe(10);
  });

  test('negative yield (loss)', () => {
    expect(calculateYield(95, 100)).toBe(-5);
  });

  test('zero yield (break-even)', () => {
    expect(calculateYield(100, 100)).toBe(0);
  });

  test('large amounts ($1M+)', () => {
    const result = calculateYield(1_050_000, 1_000_000);
    expect(result).toBe(50_000);
  });

  test('tiny amounts ($0.01)', () => {
    const result = calculateYield(100.01, 100);
    expect(result).toBeCloseTo(0.01, 10);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. calculatePerformanceFee
// ═════════════════════════════════════════════════════════════════════════════

describe('calculatePerformanceFee', () => {
  test('15% of positive yield', () => {
    expect(calculatePerformanceFee(100, 15)).toBeCloseTo(15, 10);
  });

  test('zero fee on zero yield', () => {
    expect(calculatePerformanceFee(0, 15)).toBe(0);
  });

  test('zero fee on negative yield', () => {
    expect(calculatePerformanceFee(-5, 15)).toBe(0);
  });

  test('fee on $0.01 yield', () => {
    const fee = calculatePerformanceFee(0.01, 15);
    expect(fee).toBeCloseTo(0.0015, 10);
  });

  test('fee on $1M yield', () => {
    const fee = calculatePerformanceFee(1_000_000, 15);
    expect(fee).toBeCloseTo(150_000, 2);
  });

  test('fee precision: $33.33 yield', () => {
    // 33.33 * 15 / 100 = 4.9995 exactly
    const fee = calculatePerformanceFee(33.33, 15);
    expect(fee).toBeCloseTo(4.9995, 4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. buildWithdrawBatch — fee precision
// ═════════════════════════════════════════════════════════════════════════════

describe('buildWithdrawBatch fee precision', () => {
  test('fee on large yield ($100K)', () => {
    const positions = [
      makePosition({
        shares: BigInt(1e18),
        assets: usdcRaw(1_100_000), // $1.1M current
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 1_000_000);

    // Yield = $100,000, Fee = $15,000
    expect(result.hasProfits).toBe(true);
    expect(parseFloat(result.feeAmount)).toBeCloseTo(15_000, 0);
    expect(result.feeAmountRaw).toBe(usdcRaw(15_000));
    expect(parseFloat(result.userReceives)).toBeCloseTo(1_085_000, 0);
  });

  test('fee on tiny yield ($0.01)', () => {
    const positions = [
      makePosition({
        shares: BigInt(1e18),
        assets: usdcRaw(100.01), // deposited $100
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 100);

    expect(result.hasProfits).toBe(true);
    expect(parseFloat(result.feeAmount)).toBeCloseTo(0.0015, 4);
  });

  test('feeAmountRaw matches feeAmount in micro-units', () => {
    const positions = [
      makePosition({
        shares: BigInt(1e18),
        assets: usdcRaw(200), // deposited $100 → yield $100
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 100);

    const feeFloat = parseFloat(result.feeAmount);
    // Raw should be within 1 micro-unit of the float value
    const expectedRaw = BigInt(Math.round(feeFloat * 1_000_000));
    const diff =
      result.feeAmountRaw > expectedRaw
        ? result.feeAmountRaw - expectedRaw
        : expectedRaw - result.feeAmountRaw;
    expect(Number(diff)).toBeLessThanOrEqual(1);
  });

  test('$33.33 yield: fee is exactly $4.9995', () => {
    // $133.33 current, $100 deposited → yield $33.33
    const positions = [
      makePosition({
        shares: BigInt(1e18),
        assets: usdcRaw(133.33),
      }),
    ];

    const result = buildWithdrawBatch(positions, WALLET, 100);
    expect(parseFloat(result.feeAmount)).toBeCloseTo(4.9995, 3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. buildPartialWithdrawBatch — ratio precision
// ═════════════════════════════════════════════════════════════════════════════

describe('buildPartialWithdrawBatch ratio precision', () => {
  test('1/3 withdrawal: minimal precision loss', () => {
    // $3000 position, withdraw $1000 (33.33%)
    const positions = [
      makePosition({
        shares: BigInt(3000n * BigInt(1e18)),
        assets: usdcRaw(3000),
        usdValue: '3000.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 1000, 2500);

    // Check that the withdrawn value is close to $1000
    const withdrawn = parseFloat(result.currentValue);
    // Should lose no more than $0.50 per position
    expect(Math.abs(withdrawn - 1000)).toBeLessThan(0.5);
  });

  test('proportional shares across 3 vaults', () => {
    // 3 vaults: $1200, $1050, $750 = $3000 total, withdraw $600 (20%)
    const positions = [
      makePosition({
        vaultId: 'a',
        vaultAddress: '0xA',
        shares: BigInt(1200n * BigInt(1e18)),
        assets: usdcRaw(1200),
        usdValue: '1200.000000',
      }),
      makePosition({
        vaultId: 'b',
        vaultAddress: '0xB',
        shares: BigInt(1050n * BigInt(1e18)),
        assets: usdcRaw(1050),
        usdValue: '1050.000000',
      }),
      makePosition({
        vaultId: 'c',
        vaultAddress: '0xC',
        shares: BigInt(750n * BigInt(1e18)),
        assets: usdcRaw(750),
        usdValue: '750.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 600, 2400);

    // All 3 vaults should be represented
    expect(result.positions).toHaveLength(3);

    // Total withdrawn should be close to $600
    const totalWithdrawn = result.positions.reduce(
      (sum, p) => sum + Number(p.assets) / 1_000_000,
      0,
    );
    expect(Math.abs(totalWithdrawn - 600)).toBeLessThan(1.0);
  });

  test('fee on proportional yield is accurate', () => {
    // $1000 position, deposited $800, withdraw $500 (50%)
    const positions = [
      makePosition({
        shares: BigInt(1000n * BigInt(1e18)),
        assets: usdcRaw(1000),
        usdValue: '1000.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 500, 800);

    // Total yield = $200, proportional yield = $200 * 0.5 = $100
    // Fee = $100 * 0.15 = $15
    expect(parseFloat(result.feeAmount)).toBeCloseTo(15, 0);
  });

  test('large partial withdraw ($500K from $1M)', () => {
    const positions = [
      makePosition({
        shares: BigInt(BigInt(1_000_000) * BigInt(1e18)),
        assets: usdcRaw(1_000_000),
        usdValue: '1000000.000000',
      }),
    ];

    const result = buildPartialWithdrawBatch(positions, WALLET, 500_000, 900_000);

    // Yield = $100K, proportional = $50K, fee = $7500
    expect(parseFloat(result.feeAmount)).toBeCloseTo(7_500, 0);
    expect(result.hasProfits).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Realized earnings fee-based calculation (transactionHistory.ts logic)
// ═════════════════════════════════════════════════════════════════════════════

describe('realized earnings fee-based math', () => {
  const PLATFORM_FEE_RATE = 0.15;

  function calculateRealized(totalFees: number) {
    const grossYield = totalFees > 0 ? totalFees / PLATFORM_FEE_RATE : 0;
    const realized = grossYield - totalFees;
    return { grossYield, realized };
  }

  test('$15 fees → $100 gross → $85 net', () => {
    const { grossYield, realized } = calculateRealized(15);
    expect(grossYield).toBeCloseTo(100, 6);
    expect(realized).toBeCloseTo(85, 6);
  });

  test('$0 fees → $0 realized', () => {
    const { grossYield, realized } = calculateRealized(0);
    expect(grossYield).toBe(0);
    expect(realized).toBe(0);
  });

  test('small fees: $0.15 → gross $1, net $0.85', () => {
    const { grossYield, realized } = calculateRealized(0.15);
    expect(grossYield).toBeCloseTo(1, 6);
    expect(realized).toBeCloseTo(0.85, 6);
  });

  test('large fees: $150,000 → gross $1M, net $850K', () => {
    const { grossYield, realized } = calculateRealized(150_000);
    expect(grossYield).toBeCloseTo(1_000_000, 2);
    expect(realized).toBeCloseTo(850_000, 2);
  });

  test('division by 0.15 precision: $7.53 fees', () => {
    // 7.53 / 0.15 = 50.2 exactly
    const { grossYield, realized } = calculateRealized(7.53);
    expect(grossYield).toBeCloseTo(50.2, 6);
    expect(realized).toBeCloseTo(42.67, 2);
  });

  test('consistency: fee = gross * 0.15', () => {
    // For any fee amount, gross * 0.15 should equal the original fee
    const testFees = [0.01, 0.15, 1.5, 15, 150, 1500, 15000, 99.999999];
    for (const fee of testFees) {
      const { grossYield } = calculateRealized(fee);
      expect(grossYield * 0.15).toBeCloseTo(fee, 4);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. USDC BigInt ↔ Number conversion precision
// ═════════════════════════════════════════════════════════════════════════════

describe('USDC conversion precision', () => {
  test('standard amounts convert accurately', () => {
    expect(Number(usdcRaw(100)) / 1e6).toBe(100);
    expect(Number(usdcRaw(0.01)) / 1e6).toBeCloseTo(0.01, 6);
    expect(Number(usdcRaw(99999.999999)) / 1e6).toBeCloseTo(99999.999999, 4);
  });

  test('$1M converts accurately', () => {
    const raw = usdcRaw(1_000_000);
    expect(raw).toBe(BigInt(1_000_000_000_000));
    expect(Number(raw) / 1e6).toBe(1_000_000);
  });

  test('$10M is within safe integer range for USDC', () => {
    const raw = usdcRaw(10_000_000);
    // 10M * 1e6 = 10^13, Number.MAX_SAFE_INTEGER = 2^53 ≈ 9 * 10^15
    expect(Number(raw)).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(Number(raw) / 1e6).toBe(10_000_000);
  });
});
