/**
 * Deposit Tracker Service
 * Tracks user deposits to calculate yield (profit) for performance fees
 *
 * Performance fee model: 15% fee on YIELD only, not principal
 * Example: Deposit $100, grows to $105, yield = $5, fee = $0.75
 *
 * Data is persisted in two places:
 * 1. Backend (Vercel KV) - source of truth, survives app reinstalls
 * 2. AsyncStorage - local cache for offline access
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'xyield_deposits';
const API_BASE_URL = 'https://x-yield-api.vercel.app';

export interface DepositRecord {
  totalDeposited: number; // Total USDC deposited (in USD, not raw)
  lastUpdated: number; // Timestamp
}

export interface DepositData {
  [walletAddress: string]: DepositRecord;
}

/**
 * Get all deposit data from storage
 */
async function getAllDeposits(): Promise<DepositData> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) {
      console.log('[DepositTracker] No existing deposit data found (first deposit)');
      return {};
    }
    const parsed = JSON.parse(data);
    return parsed;
  } catch (error) {
    console.error('[DepositTracker] ERROR reading deposits - DATA MAY BE LOST:', error);
    // Return empty but log loudly - this is a critical issue
    return {};
  }
}

/**
 * Save deposit data to storage
 */
async function saveDeposits(data: DepositData): Promise<void> {
  try {
    const jsonData = JSON.stringify(data);
    console.log('[DepositTracker] Saving deposits:', jsonData);
    await AsyncStorage.setItem(STORAGE_KEY, jsonData);
    console.log('[DepositTracker] Save successful');
  } catch (error) {
    console.error('[DepositTracker] SAVE FAILED:', error);
    throw new Error(`Failed to save deposit data: ${error}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Backend API Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch deposit record from backend
 */
async function fetchFromBackend(walletAddress: string): Promise<DepositRecord | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/deposits/${walletAddress.toLowerCase()}`);
    if (!response.ok) {
      console.error('[DepositTracker] Backend fetch failed:', response.status);
      return null;
    }
    const data = await response.json();
    if (data.totalDeposited === 0 && data.lastUpdated === null) {
      return null; // No record exists
    }
    return {
      totalDeposited: data.totalDeposited,
      lastUpdated: data.lastUpdated,
    };
  } catch (error) {
    console.error('[DepositTracker] Backend fetch error:', error);
    return null;
  }
}

/**
 * Record deposit to backend
 */
async function recordDepositToBackend(walletAddress: string, amount: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/deposits/${walletAddress.toLowerCase()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    if (!response.ok) {
      console.error('[DepositTracker] Backend deposit failed:', response.status);
      return false;
    }
    console.log('[DepositTracker] Backend deposit recorded');
    return true;
  } catch (error) {
    console.error('[DepositTracker] Backend deposit error:', error);
    return false;
  }
}

/**
 * Record withdrawal to backend
 */
async function recordWithdrawalToBackend(
  walletAddress: string,
  withdrawnValue: number,
  totalValueBeforeWithdraw: number
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/deposits/${walletAddress.toLowerCase()}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawnValue, totalValueBeforeWithdraw }),
    });
    if (!response.ok) {
      console.error('[DepositTracker] Backend withdrawal failed:', response.status);
      return false;
    }
    console.log('[DepositTracker] Backend withdrawal recorded');
    return true;
  } catch (error) {
    console.error('[DepositTracker] Backend withdrawal error:', error);
    return false;
  }
}

/**
 * Sync local deposit to backend (for migration)
 */
async function syncToBackend(walletAddress: string, totalDeposited: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/deposits/${walletAddress.toLowerCase()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalDeposited, sync: true }),
    });
    if (!response.ok) {
      console.error('[DepositTracker] Backend sync failed:', response.status);
      return false;
    }
    console.log('[DepositTracker] Backend sync successful');
    return true;
  } catch (error) {
    console.error('[DepositTracker] Backend sync error:', error);
    return false;
  }
}

/**
 * Get the total deposited amount for a wallet
 * Fetches from backend first (source of truth), falls back to local storage
 * Returns 0 if no deposits recorded (first-time user)
 */
export async function getTotalDeposited(walletAddress: string): Promise<number> {
  const address = walletAddress.toLowerCase();

  // Try backend first (source of truth)
  const backendRecord = await fetchFromBackend(address);
  if (backendRecord) {
    console.log(`[DepositTracker] Got from backend: $${backendRecord.totalDeposited.toFixed(6)}`);

    // Update local cache
    const deposits = await getAllDeposits();
    deposits[address] = backendRecord;
    await saveDeposits(deposits);

    return backendRecord.totalDeposited;
  }

  // Fallback to local storage
  const deposits = await getAllDeposits();
  const localRecord = deposits[address];
  const totalDeposited = localRecord?.totalDeposited || 0;

  // If we have local data but backend doesn't, sync it
  if (totalDeposited > 0) {
    console.log('[DepositTracker] Local data exists but not in backend, syncing...');
    await syncToBackend(address, totalDeposited);
  }

  console.log(`[DepositTracker] getTotalDeposited for ${walletAddress.slice(0, 10)}...: $${totalDeposited.toFixed(6)}`);
  return totalDeposited;
}

/**
 * Record a new deposit
 * Adds to the user's total deposited amount
 * Syncs to backend and local storage
 */
export async function recordDeposit(
  walletAddress: string,
  amount: number
): Promise<void> {
  const deposits = await getAllDeposits();
  const address = walletAddress.toLowerCase();

  const currentRecord = deposits[address] || { totalDeposited: 0, lastUpdated: 0 };
  const previousTotal = currentRecord.totalDeposited;
  const newTotal = previousTotal + amount;

  console.log('[DepositTracker] ══════════════════════════════════════════════════════');
  console.log('[DepositTracker] Recording deposit:', amount);
  console.log('[DepositTracker] Previous total:', previousTotal);
  console.log('[DepositTracker] New total:', newTotal);
  console.log('[DepositTracker] ══════════════════════════════════════════════════════');

  // Save to local storage first (for immediate access)
  deposits[address] = {
    totalDeposited: newTotal,
    lastUpdated: Date.now(),
  };
  await saveDeposits(deposits);

  // Sync to backend (fire and forget, but log result)
  recordDepositToBackend(address, amount).then((success) => {
    if (success) {
      console.log('[DepositTracker] Backend sync complete');
    } else {
      console.warn('[DepositTracker] Backend sync failed, will retry on next read');
    }
  });

  // Verify it was saved correctly
  const verifyDeposits = await getAllDeposits();
  const verifyRecord = verifyDeposits[address];
  console.log('[DepositTracker] Verified saved total:', verifyRecord?.totalDeposited);
}

/**
 * Record a withdrawal and update deposit tracking
 * Syncs to backend and local storage
 *
 * When user withdraws, we need to reduce their "totalDeposited" proportionally
 * to maintain accurate yield calculations for future withdrawals.
 *
 * Example:
 * - User deposited $100, value grew to $120
 * - User withdraws all ($120)
 * - We reset their totalDeposited to $0
 *
 * For partial withdrawals:
 * - User deposited $100, value is $120
 * - User withdraws $60 (50% of value)
 * - We reduce totalDeposited by 50% → $50 remaining
 */
export async function recordWithdrawal(
  walletAddress: string,
  withdrawnValue: number,
  totalValueBeforeWithdraw: number
): Promise<void> {
  const deposits = await getAllDeposits();
  const address = walletAddress.toLowerCase();

  const currentRecord = deposits[address] || { totalDeposited: 0, lastUpdated: 0 };

  if (totalValueBeforeWithdraw <= 0 || currentRecord.totalDeposited <= 0) {
    // Full withdrawal or no deposits recorded - reset to 0
    deposits[address] = {
      totalDeposited: 0,
      lastUpdated: Date.now(),
    };
  } else {
    // Partial withdrawal - reduce deposits proportionally
    const withdrawalRatio = withdrawnValue / totalValueBeforeWithdraw;
    const depositReduction = currentRecord.totalDeposited * withdrawalRatio;
    const newTotalDeposited = Math.max(0, currentRecord.totalDeposited - depositReduction);

    deposits[address] = {
      totalDeposited: newTotalDeposited,
      lastUpdated: Date.now(),
    };

    console.log(`[DepositTracker] Withdrawal: $${withdrawnValue.toFixed(6)} (${(withdrawalRatio * 100).toFixed(4)}% of holdings)`);
    console.log(`[DepositTracker] Deposit reduction: $${depositReduction.toFixed(6)}`);
    console.log(`[DepositTracker] Remaining deposits: $${newTotalDeposited.toFixed(6)}`);
  }

  // Save to local storage first
  await saveDeposits(deposits);

  // Sync to backend (fire and forget, but log result)
  recordWithdrawalToBackend(address, withdrawnValue, totalValueBeforeWithdraw).then((success) => {
    if (success) {
      console.log('[DepositTracker] Backend withdrawal sync complete');
    } else {
      console.warn('[DepositTracker] Backend withdrawal sync failed, will retry on next read');
    }
  });
}

/**
 * Calculate yield (profit) based on current value and deposits
 *
 * @param currentValue - Current total value of positions
 * @param totalDeposited - Total amount user has deposited
 * @returns Yield amount (can be negative if in loss)
 */
export function calculateYield(
  currentValue: number,
  totalDeposited: number
): number {
  return currentValue - totalDeposited;
}

/**
 * Calculate performance fee (15% of positive yield only)
 *
 * @param yieldAmount - The profit amount
 * @param feePercent - Fee percentage (e.g., 15 for 15%)
 * @returns Fee amount (0 if yield is negative or zero)
 */
export function calculatePerformanceFee(
  yieldAmount: number,
  feePercent: number
): number {
  if (yieldAmount <= 0) {
    return 0; // No fee if no profit
  }
  return yieldAmount * (feePercent / 100);
}

/**
 * Get complete yield breakdown for a wallet
 */
export interface YieldBreakdown {
  totalDeposited: number;
  currentValue: number;
  yieldAmount: number;
  yieldPercent: number;
  fee: number;
  userReceives: number;
  hasProfits: boolean;
}

export async function getYieldBreakdown(
  walletAddress: string,
  currentValue: number,
  feePercent: number
): Promise<YieldBreakdown> {
  const totalDeposited = await getTotalDeposited(walletAddress);
  const yieldAmount = calculateYield(currentValue, totalDeposited);
  const hasProfits = yieldAmount > 0;
  const fee = calculatePerformanceFee(yieldAmount, feePercent);
  const userReceives = currentValue - fee;
  const yieldPercent = totalDeposited > 0 ? (yieldAmount / totalDeposited) * 100 : 0;

  return {
    totalDeposited,
    currentValue,
    yieldAmount,
    yieldPercent,
    fee,
    userReceives,
    hasProfits,
  };
}

/**
 * SECURITY: Recover deposit data when missing (e.g., after app reinstall)
 *
 * When user has vault positions but no deposit record, we treat the current
 * value as their deposit to prevent fee avoidance. This function persists
 * that recovered value so future operations don't need the safeguard.
 *
 * @param walletAddress - User's wallet address
 * @param currentValue - Current value of their positions
 * @returns true if recovery was performed, false if not needed
 */
export async function recoverMissingDeposit(
  walletAddress: string,
  currentValue: number
): Promise<boolean> {
  const existingDeposit = await getTotalDeposited(walletAddress);

  if (existingDeposit === 0 && currentValue > 0) {
    console.warn('[SECURITY] Recovering missing deposit data');
    console.warn(`[SECURITY] Setting deposit to current value: $${currentValue.toFixed(6)}`);

    const deposits = await getAllDeposits();
    const address = walletAddress.toLowerCase();

    deposits[address] = {
      totalDeposited: currentValue,
      lastUpdated: Date.now(),
    };

    await saveDeposits(deposits);
    console.warn('[SECURITY] Deposit data recovered and saved');
    return true;
  }

  return false;
}

/**
 * Clear all deposit data (for testing/debugging)
 */
export async function clearAllDeposits(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  console.log('[DepositTracker] Cleared all deposit data');
}

/**
 * DEBUG: Set deposit amount manually (for testing fee calculation)
 * This allows simulating yield by setting a lower deposit than current value
 *
 * Example: If current value is $2.00 and you set deposit to $1.50,
 * yield will be $0.50 and fee will be 15% of $0.50 = $0.075
 */
export async function debugSetDeposit(
  walletAddress: string,
  amount: number
): Promise<void> {
  const deposits = await getAllDeposits();
  const address = walletAddress.toLowerCase();
  deposits[address] = {
    totalDeposited: amount,
    lastUpdated: Date.now(),
  };
  await saveDeposits(deposits);
}

/** DEBUG: Get all deposit data */
export async function debugGetAllDeposits(): Promise<DepositData> {
  return getAllDeposits();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SCENARIOS - Fee Calculation Verification
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DEV ONLY: Simulate fee calculation scenarios
 * Call this from console to verify math is correct
 */
export function runFeeCalculationTests(): void {

  const FEE_PERCENT = 15;

  // Test 1: $10,000 deposit, 5% yield
  testScenario({
    name: 'Test 1: $10,000 deposit with 5% yield',
    deposited: 10000,
    currentValue: 10500,
    feePercent: FEE_PERCENT,
    expectedYield: 500,
    expectedFee: 75,
    expectedReceive: 10425,
  });

  // Test 2: $1,000 deposit, no yield (break-even)
  testScenario({
    name: 'Test 2: $1,000 deposit with no yield',
    deposited: 1000,
    currentValue: 1000,
    feePercent: FEE_PERCENT,
    expectedYield: 0,
    expectedFee: 0,
    expectedReceive: 1000,
  });

  // Test 3: $1,000 deposit, loss (value dropped)
  testScenario({
    name: 'Test 3: $1,000 deposit with loss',
    deposited: 1000,
    currentValue: 950,
    feePercent: FEE_PERCENT,
    expectedYield: -50,
    expectedFee: 0, // No fee on loss
    expectedReceive: 950,
  });

  // Test 4: Large amount - $1,000,000 with 10% yield
  testScenario({
    name: 'Test 4: $1,000,000 deposit with 10% yield',
    deposited: 1000000,
    currentValue: 1100000,
    feePercent: FEE_PERCENT,
    expectedYield: 100000,
    expectedFee: 15000,
    expectedReceive: 1085000,
  });

  // Test 5: Small amount - $10 with 5% yield
  testScenario({
    name: 'Test 5: $10 deposit with 5% yield',
    deposited: 10,
    currentValue: 10.50,
    feePercent: FEE_PERCENT,
    expectedYield: 0.50,
    expectedFee: 0.075, // May be below minimum
    expectedReceive: 10.425,
  });

  // Test 6: Multiple deposits - $100 + $200 + $300 = $600 deposited
  testScenario({
    name: 'Test 6: Multiple deposits ($100+$200+$300) with 5% yield',
    deposited: 600,
    currentValue: 630,
    feePercent: FEE_PERCENT,
    expectedYield: 30,
    expectedFee: 4.50,
    expectedReceive: 625.50,
  });

  // Test 7: Edge case - very small yield (precision test)
  testScenario({
    name: 'Test 7: Precision test - $1000 with $0.01 yield',
    deposited: 1000,
    currentValue: 1000.01,
    feePercent: FEE_PERCENT,
    expectedYield: 0.01,
    expectedFee: 0.0015,
    expectedReceive: 1000.0085,
  });

}

interface TestScenarioParams {
  name: string;
  deposited: number;
  currentValue: number;
  feePercent: number;
  expectedYield: number;
  expectedFee: number;
  expectedReceive: number;
}

function testScenario(params: TestScenarioParams): boolean {
  const { deposited, currentValue, feePercent, expectedYield, expectedFee, expectedReceive } = params;
  const actualYield = calculateYield(currentValue, deposited);
  const actualFee = calculatePerformanceFee(actualYield, feePercent);
  const actualReceive = currentValue - actualFee;
  const yieldMatch = Math.abs(actualYield - expectedYield) < 0.0001;
  const feeMatch = Math.abs(actualFee - expectedFee) < 0.0001;
  const receiveMatch = Math.abs(actualReceive - expectedReceive) < 0.0001;
  return yieldMatch && feeMatch && receiveMatch;
}
