/**
 * Deposit Tracker Service
 * Tracks user deposits to calculate yield (profit) for performance fees
 *
 * Performance fee model: 15% fee on YIELD only, not principal
 * Example: Deposit $100, grows to $105, yield = $5, fee = $0.75
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'xyield_deposits';

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
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.log('[DepositTracker] Error reading deposits:', error);
    return {};
  }
}

/**
 * Save deposit data to storage
 */
async function saveDeposits(data: DepositData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.log('[DepositTracker] Error saving deposits:', error);
  }
}

/**
 * Get the total deposited amount for a wallet
 * Returns 0 if no deposits recorded (first-time user)
 */
export async function getTotalDeposited(walletAddress: string): Promise<number> {
  const deposits = await getAllDeposits();
  const record = deposits[walletAddress.toLowerCase()];
  return record?.totalDeposited || 0;
}

/**
 * Record a new deposit
 * Adds to the user's total deposited amount
 */
export async function recordDeposit(
  walletAddress: string,
  amount: number
): Promise<void> {
  const deposits = await getAllDeposits();
  const address = walletAddress.toLowerCase();

  const currentRecord = deposits[address] || { totalDeposited: 0, lastUpdated: 0 };

  deposits[address] = {
    totalDeposited: currentRecord.totalDeposited + amount,
    lastUpdated: Date.now(),
  };

  await saveDeposits(deposits);
  console.log(`[DepositTracker] Recorded deposit: +$${amount.toFixed(2)} for ${address.slice(0, 10)}...`);
  console.log(`[DepositTracker] New total deposited: $${deposits[address].totalDeposited.toFixed(2)}`);
}

/**
 * Record a withdrawal and update deposit tracking
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

    console.log(`[DepositTracker] Withdrawal: $${withdrawnValue.toFixed(2)} (${(withdrawalRatio * 100).toFixed(1)}% of holdings)`);
    console.log(`[DepositTracker] Deposit reduction: $${depositReduction.toFixed(2)}`);
    console.log(`[DepositTracker] Remaining deposits: $${newTotalDeposited.toFixed(2)}`);
  }

  await saveDeposits(deposits);
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
 * Clear all deposit data (for testing/debugging)
 */
export async function clearAllDeposits(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  console.log('[DepositTracker] Cleared all deposit data');
}
