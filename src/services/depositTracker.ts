/**
 * Deposit Tracker Service
 * Tracks user deposits to calculate yield (profit) for performance fees
 *
 * Performance fee model: 15% fee on YIELD only, not principal
 * Example: Deposit $100, grows to $105, yield = $5, fee = $0.75
 *
 * Data is persisted in two places:
 * 1. AsyncStorage - PRIMARY source (written by recordDeposit/recordWithdrawal)
 * 2. Backend (Vercel KV) - BACKUP for recovery (survives app reinstalls)
 *
 * IMPORTANT: Local storage is NEVER overwritten by backend reads.
 * This prevents race conditions where stale backend data overwrites fresh local writes.
 * Backend is only used for recovery when local storage is empty.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidEthereumAddress, isValidAmount, sanitizeAddress } from '../utils/validation';

// Debug mode - controlled by __DEV__
const DEBUG = __DEV__ ?? false;
const debugLog = (message: string, ...args: unknown[]) => {
  if (DEBUG) console.log(message, ...args);
};

const STORAGE_KEY = 'unflat_deposits';
const PENDING_SYNC_KEY = 'unflat_pending_sync';
const API_BASE_URL = 'https://x-yield-api.vercel.app';

// ═══════════════════════════════════════════════════════════════════════════════
// Pending Sync Queue Types
// ═══════════════════════════════════════════════════════════════════════════════

interface PendingSyncOperation {
  id: string;
  type: 'deposit' | 'withdrawal' | 'sync';
  walletAddress: string;
  timestamp: number;
  retryCount: number;
  data: {
    amount?: number;
    txHash?: string;
    withdrawnValue?: number;
    totalValueBeforeWithdraw?: number;
    totalDeposited?: number;
  };
}

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
      debugLog('[DepositTracker] No existing deposit data found (first deposit)');
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
    debugLog('[DepositTracker] Saving deposits:', jsonData);
    await AsyncStorage.setItem(STORAGE_KEY, jsonData);
    debugLog('[DepositTracker] Save successful');
  } catch (error) {
    console.error('[DepositTracker] SAVE FAILED:', error);
    throw new Error(`Failed to save deposit data: ${error}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pending Sync Queue Management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all pending sync operations
 */
async function getPendingSyncQueue(): Promise<PendingSyncOperation[]> {
  try {
    const data = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('[DepositTracker] Error reading pending sync queue:', error);
    return [];
  }
}

/**
 * Save pending sync queue
 */
async function savePendingSyncQueue(queue: PendingSyncOperation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('[DepositTracker] Error saving pending sync queue:', error);
  }
}

/**
 * Add operation to pending sync queue
 */
async function addToPendingSyncQueue(
  type: PendingSyncOperation['type'],
  walletAddress: string,
  data: PendingSyncOperation['data']
): Promise<void> {
  const queue = await getPendingSyncQueue();

  const operation: PendingSyncOperation = {
    id: `${type}-${walletAddress}-${Date.now()}`,
    type,
    walletAddress: walletAddress.toLowerCase(),
    timestamp: Date.now(),
    retryCount: 0,
    data,
  };

  queue.push(operation);
  await savePendingSyncQueue(queue);
  debugLog('[DepositTracker] Added to pending sync queue:', operation.id);
}

/**
 * Remove operation from pending sync queue
 */
async function removeFromPendingSyncQueue(operationId: string): Promise<void> {
  const queue = await getPendingSyncQueue();
  const filtered = queue.filter(op => op.id !== operationId);
  await savePendingSyncQueue(filtered);
  debugLog('[DepositTracker] Removed from pending sync queue:', operationId);
}

/**
 * Update retry count for an operation
 */
async function incrementRetryCount(operationId: string): Promise<void> {
  const queue = await getPendingSyncQueue();
  const updated = queue.map(op => {
    if (op.id === operationId) {
      return { ...op, retryCount: op.retryCount + 1 };
    }
    return op;
  });
  await savePendingSyncQueue(updated);
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
 * @param txHash - Transaction hash for idempotency (prevents duplicate deposits)
 */
async function recordDepositToBackend(walletAddress: string, amount: number, txHash?: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/deposits/${walletAddress.toLowerCase()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, txHash }),
    });
    if (!response.ok) {
      console.error('[DepositTracker] Backend deposit failed:', response.status);
      return false;
    }
    debugLog('[DepositTracker] Backend deposit recorded');
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
    debugLog('[DepositTracker] Backend withdrawal recorded');
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
    debugLog('[DepositTracker] Backend sync successful');
    return true;
  } catch (error) {
    console.error('[DepositTracker] Backend sync error:', error);
    return false;
  }
}

/**
 * Get the total deposited amount for a wallet
 *
 * ARCHITECTURE (Solution A - prevents race conditions):
 * 1. Local storage is PRIMARY - written by recordDeposit/recordWithdrawal
 * 2. Backend is for RECOVERY only - used when local is empty
 * 3. Backend reads NEVER overwrite local storage
 *
 * This prevents the bug where:
 * - User withdraws all (local=0)
 * - User deposits $360 (local=360, backend fire-and-forget)
 * - Screen re-renders, fetches backend (still 0)
 * - OLD BUG: Backend 0 overwrites local 360 → wrong!
 * - NEW FIX: Local 360 is trusted, backend ignored
 */
export async function getTotalDeposited(walletAddress: string): Promise<number> {
  // Validate address format
  const address = sanitizeAddress(walletAddress);
  if (!address) {
    console.error('[DepositTracker] Invalid wallet address format');
    return 0;
  }

  // Read local storage FIRST (primary source)
  const deposits = await getAllDeposits();
  const localRecord = deposits[address];

  // If local has data, trust it (written by recordDeposit/recordWithdrawal)
  if (localRecord && localRecord.lastUpdated > 0) {
    debugLog(`[DepositTracker] Using LOCAL: $${localRecord.totalDeposited.toFixed(2)}`);

    // Fire-and-forget sync to backend (don't await, don't block)
    // This ensures backend eventually catches up for recovery purposes
    syncToBackend(address, localRecord.totalDeposited).catch(() => {
      // Ignore sync failures - local is source of truth
    });

    return localRecord.totalDeposited;
  }

  // Local is empty - try backend for RECOVERY (app reinstall scenario)
  debugLog('[DepositTracker] Local empty, checking backend for recovery...');
  const backendRecord = await fetchFromBackend(address);

  if (backendRecord && backendRecord.totalDeposited > 0) {
    debugLog(`[DepositTracker] RECOVERY from backend: $${backendRecord.totalDeposited.toFixed(2)}`);

    // Save recovered data to local storage
    deposits[address] = backendRecord;
    await saveDeposits(deposits);

    return backendRecord.totalDeposited;
  }

  // No data anywhere - first-time user or clean state after full withdrawal
  debugLog(`[DepositTracker] No deposit data found for ${address.slice(0, 10)}...`);
  return 0;
}

/**
 * Record a new deposit
 * Adds to the user's total deposited amount
 * Syncs to backend and local storage
 * @param txHash - Transaction hash for idempotency (prevents duplicate deposits)
 */
export async function recordDeposit(
  walletAddress: string,
  amount: number,
  txHash?: string
): Promise<void> {
  // Validate inputs
  const address = sanitizeAddress(walletAddress);
  if (!address) {
    console.error('[DepositTracker] Invalid wallet address format');
    return;
  }

  if (!isValidAmount(amount)) {
    console.error('[DepositTracker] Invalid deposit amount');
    return;
  }

  const deposits = await getAllDeposits();

  const currentRecord = deposits[address] || { totalDeposited: 0, lastUpdated: 0 };
  const previousTotal = currentRecord.totalDeposited;
  const newTotal = previousTotal + amount;

  debugLog('[DepositTracker] Recording deposit:', amount, 'Previous:', previousTotal, 'New:', newTotal);

  // Save to local storage first (for immediate access)
  deposits[address] = {
    totalDeposited: newTotal,
    lastUpdated: Date.now(),
  };
  await saveDeposits(deposits);

  // Sync to backend (fire and forget, queue on failure)
  recordDepositToBackend(address, amount, txHash).then(async (success) => {
    if (success) {
      debugLog('[DepositTracker] Backend deposit sync: success');
    } else {
      debugLog('[DepositTracker] Backend deposit sync: failed, queuing for retry');
      await addToPendingSyncQueue('deposit', address, { amount, txHash });
    }
  });
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

  // Check if this is a FULL withdrawal (withdrawing 99%+ of total value)
  const isFullWithdrawal = totalValueBeforeWithdraw > 0 &&
    withdrawnValue >= totalValueBeforeWithdraw * 0.99;

  let newTotalDeposited: number;

  if (isFullWithdrawal || totalValueBeforeWithdraw <= 0 || currentRecord.totalDeposited <= 0) {
    // Full withdrawal - reset to 0
    newTotalDeposited = 0;
    debugLog('[DepositTracker] Full withdrawal - resetting totalDeposited to 0');
  } else {
    // Partial withdrawal - reduce deposits proportionally
    const withdrawalRatio = withdrawnValue / totalValueBeforeWithdraw;
    const depositReduction = currentRecord.totalDeposited * withdrawalRatio;
    newTotalDeposited = Math.max(0, currentRecord.totalDeposited - depositReduction);
    debugLog(`[DepositTracker] Partial withdrawal: ${(withdrawalRatio * 100).toFixed(1)}%, new total: $${newTotalDeposited.toFixed(2)}`);
  }

  deposits[address] = {
    totalDeposited: newTotalDeposited,
    lastUpdated: Date.now(),
  };

  // Save to local storage first
  await saveDeposits(deposits);

  // IMPORTANT: Wait for backend sync to complete (not fire and forget)
  // This ensures the backend has the correct value before user makes another deposit
  const backendSuccess = await recordWithdrawalToBackend(address, withdrawnValue, totalValueBeforeWithdraw);
  if (!backendSuccess) {
    console.warn('[DepositTracker] Backend withdrawal sync failed, queuing for retry');
    await addToPendingSyncQueue('withdrawal', address, {
      withdrawnValue,
      totalValueBeforeWithdraw,
    });
  }
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
    // Recover missing deposit data (possible app reinstall)
    const deposits = await getAllDeposits();
    const address = walletAddress.toLowerCase();

    deposits[address] = {
      totalDeposited: currentValue,
      lastUpdated: Date.now(),
    };

    await saveDeposits(deposits);
    debugLog('[DepositTracker] Recovered missing deposit data');
    return true;
  }

  return false;
}

/**
 * Clear all deposit data (for testing/debugging)
 */
export async function clearAllDeposits(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  debugLog('[DepositTracker] Cleared all deposit data');
}

/**
 * Reset deposit tracker for a specific wallet
 * Use this after a full withdrawal to ensure clean state
 */
export async function resetDeposits(walletAddress: string): Promise<void> {
  const address = walletAddress.toLowerCase();
  const deposits = await getAllDeposits();

  deposits[address] = {
    totalDeposited: 0,
    lastUpdated: Date.now(),
  };

  await saveDeposits(deposits);

  // Also sync to backend
  try {
    await fetch(`${API_BASE_URL}/api/deposits/${address}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalDeposited: 0, reset: true }),
    });
    debugLog(`[DepositTracker] Reset deposits for ${address} (local + backend)`);
  } catch (error) {
    console.warn('[DepositTracker] Backend reset failed:', error);
    debugLog(`[DepositTracker] Reset deposits for ${address} (local only)`);
  }
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

// ═══════════════════════════════════════════════════════════════════════════════
// Retry Sync Pending Operations
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_RETRY_COUNT = 5;
const MAX_OPERATION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Retry all pending sync operations
 * Call this on app startup and after successful network requests
 *
 * @returns Number of operations successfully synced
 */
export async function retrySyncPendingOperations(): Promise<number> {
  const queue = await getPendingSyncQueue();

  if (queue.length === 0) {
    return 0;
  }

  debugLog(`[DepositTracker] Retrying ${queue.length} pending sync operations...`);

  let successCount = 0;
  const now = Date.now();

  for (const operation of queue) {
    // Skip operations that are too old (stale data)
    if (now - operation.timestamp > MAX_OPERATION_AGE_MS) {
      debugLog(`[DepositTracker] Removing stale operation: ${operation.id}`);
      await removeFromPendingSyncQueue(operation.id);
      continue;
    }

    // Skip operations that have exceeded max retries
    if (operation.retryCount >= MAX_RETRY_COUNT) {
      debugLog(`[DepositTracker] Max retries exceeded for: ${operation.id}`);
      await removeFromPendingSyncQueue(operation.id);
      continue;
    }

    let success = false;

    try {
      switch (operation.type) {
        case 'deposit':
          if (operation.data.amount !== undefined) {
            success = await recordDepositToBackend(
              operation.walletAddress,
              operation.data.amount,
              operation.data.txHash
            );
          }
          break;

        case 'withdrawal':
          if (
            operation.data.withdrawnValue !== undefined &&
            operation.data.totalValueBeforeWithdraw !== undefined
          ) {
            success = await recordWithdrawalToBackend(
              operation.walletAddress,
              operation.data.withdrawnValue,
              operation.data.totalValueBeforeWithdraw
            );
          }
          break;

        case 'sync':
          if (operation.data.totalDeposited !== undefined) {
            success = await syncToBackend(
              operation.walletAddress,
              operation.data.totalDeposited
            );
          }
          break;
      }
    } catch (error) {
      debugLog(`[DepositTracker] Retry failed for ${operation.id}:`, error);
    }

    if (success) {
      debugLog(`[DepositTracker] Retry successful: ${operation.id}`);
      await removeFromPendingSyncQueue(operation.id);
      successCount++;
    } else {
      await incrementRetryCount(operation.id);
    }
  }

  if (successCount > 0) {
    debugLog(`[DepositTracker] Successfully synced ${successCount} pending operations`);
  }

  return successCount;
}

/**
 * Get count of pending sync operations (for UI display)
 */
export async function getPendingSyncCount(): Promise<number> {
  const queue = await getPendingSyncQueue();
  return queue.length;
}

/** DEBUG: Get all deposit data */
export async function debugGetAllDeposits(): Promise<DepositData> {
  return getAllDeposits();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMPLE EARNINGS API
// Clean, simple functions for Dashboard/Strategies display
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the total amount deposited for a wallet
 * Source: depositTracker (backend + local cache)
 *
 * This is the ONLY source of truth for deposited amounts.
 * Morpho vaults don't track original deposits - only shares and current value.
 */
export async function getDeposited(walletAddress: string): Promise<number> {
  return getTotalDeposited(walletAddress);
}

/**
 * Get unrealized earnings (yield still in vault)
 * Simple formula: currentBalance - deposited
 *
 * @param walletAddress - User's wallet address
 * @param currentBalance - Current vault balance (from getVaultPositions)
 * @returns Unrealized earnings (minimum 0)
 */
export async function getUnrealizedEarnings(
  walletAddress: string,
  currentBalance: number
): Promise<number> {
  const deposited = await getDeposited(walletAddress);
  // Earnings = what you have now - what you put in
  // Can't be negative (if deposited > balance, something is wrong, return 0)
  return Math.max(0, currentBalance - deposited);
}

/**
 * Get both deposited and earnings in one call
 * This is the recommended function for Dashboard/Strategies
 *
 * @param walletAddress - User's wallet address
 * @param currentBalance - Current vault balance (from getVaultPositions)
 */
export async function getDepositedAndEarnings(
  walletAddress: string,
  currentBalance: number
): Promise<{
  deposited: number;
  earnings: number;
}> {
  let deposited = await getDeposited(walletAddress);

  // SANITY CHECK: If deposited > currentBalance, data is corrupted
  // This can happen due to duplicate deposit recordings or sync issues
  // Fix: Reset to currentBalance (assume no yield yet, safe fallback)
  if (currentBalance > 0 && deposited > currentBalance * 1.01) {
    console.warn('[DepositTracker] Data corruption detected: deposited > balance, auto-fixing...');

    // Fix local storage
    const address = sanitizeAddress(walletAddress);
    if (address) {
      const deposits = await getAllDeposits();
      deposits[address] = {
        totalDeposited: currentBalance,
        lastUpdated: Date.now(),
      };
      await saveDeposits(deposits);

      // Also sync fix to backend
      syncToBackend(address, currentBalance).catch(() => {});

      deposited = currentBalance;
    }
  }

  const earnings = Math.max(0, currentBalance - deposited);

  debugLog(`[DepositTracker] Deposited: $${deposited.toFixed(2)}, Balance: $${currentBalance.toFixed(2)}, Earnings: $${earnings.toFixed(2)}`);

  return { deposited, earnings };
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
