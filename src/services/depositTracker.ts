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
import { TOKENS } from '../constants/contracts';
import { MORPHO_VAULTS } from '../constants/strategies';

// Debug mode - controlled by __DEV__
const DEBUG = __DEV__ ?? false;
const debugLog = (message: string, ...args: unknown[]) => {
  if (DEBUG) console.log(message, ...args);
};

const STORAGE_KEY = 'unflat_deposits';
const PENDING_SYNC_KEY = 'unflat_pending_sync';
const BLOCKCHAIN_CACHE_KEY = 'unflat_blockchain_deposits';
const API_BASE_URL = 'https://x-yield-api.vercel.app';
const BLOCKSCOUT_API_URL = 'https://base.blockscout.com/api';

// Cache TTL for blockchain-calculated deposits
const BLOCKCHAIN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Vault addresses for matching (lowercase)
const VAULT_ADDRESSES_SET = new Set(
  Object.values(MORPHO_VAULTS).map(v => v.address.toLowerCase())
);

// Full withdrawal threshold - if vault balance goes below this, consider it a full withdrawal
const FULL_WITHDRAWAL_THRESHOLD = 1.0; // $1

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

// Cached blockchain calculation result
interface BlockchainDepositCache {
  walletAddress: string;
  totalDeposited: number;
  lastUpdated: number;
}

// Blockscout API response types
interface BlockscoutTokenTransfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenDecimal: string;
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
// BLOCKCHAIN-BASED DEPOSIT CALCULATION
// This is the SOURCE OF TRUTH - calculates deposits from on-chain data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get cached blockchain deposit calculation
 */
async function getBlockchainCache(walletAddress: string): Promise<BlockchainDepositCache | null> {
  try {
    const data = await AsyncStorage.getItem(BLOCKCHAIN_CACHE_KEY);
    if (!data) return null;

    const cache: Record<string, BlockchainDepositCache> = JSON.parse(data);
    const entry = cache[walletAddress.toLowerCase()];

    if (!entry) return null;

    // Check if cache is expired
    const age = Date.now() - entry.lastUpdated;
    if (age > BLOCKCHAIN_CACHE_TTL_MS) {
      debugLog('[DepositTracker] Blockchain cache expired (age:', Math.round(age / 1000), 's)');
      return null;
    }

    debugLog('[DepositTracker] Using blockchain cache (age:', Math.round(age / 1000), 's)');
    return entry;
  } catch (error) {
    console.error('[DepositTracker] Error reading blockchain cache:', error);
    return null;
  }
}

/**
 * Save blockchain deposit calculation to cache
 */
async function saveBlockchainCache(walletAddress: string, totalDeposited: number): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(BLOCKCHAIN_CACHE_KEY);
    const cache: Record<string, BlockchainDepositCache> = data ? JSON.parse(data) : {};

    cache[walletAddress.toLowerCase()] = {
      walletAddress: walletAddress.toLowerCase(),
      totalDeposited,
      lastUpdated: Date.now(),
    };

    await AsyncStorage.setItem(BLOCKCHAIN_CACHE_KEY, JSON.stringify(cache));
    debugLog('[DepositTracker] Blockchain cache saved: $' + totalDeposited.toFixed(2));
  } catch (error) {
    console.error('[DepositTracker] Error saving blockchain cache:', error);
  }
}

/**
 * Fetch ERC20 token transfers from Blockscout API
 */
async function fetchTokenTransfersForDeposits(
  walletAddress: string,
  tokenAddress: string
): Promise<BlockscoutTokenTransfer[]> {
  if (!walletAddress || walletAddress.length < 10) {
    console.error('[DepositTracker] Invalid wallet address:', walletAddress);
    return [];
  }

  try {
    const url = new URL(BLOCKSCOUT_API_URL);
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'tokentx');
    url.searchParams.set('address', walletAddress);
    url.searchParams.set('contractaddress', tokenAddress);
    url.searchParams.set('startblock', '0');
    url.searchParams.set('endblock', '99999999');
    url.searchParams.set('sort', 'asc'); // CHRONOLOGICAL order (oldest first)

    debugLog('[DepositTracker] Fetching blockchain data for:', walletAddress.slice(0, 10) + '...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[DepositTracker] Blockscout API error:', response.status);
      return [];
    }

    const data = await response.json();

    if (data.status === '1' && Array.isArray(data.result)) {
      debugLog('[DepositTracker] Found', data.result.length, 'token transfers');
      return data.result;
    }

    if (data.status === '0' && data.message === 'No transactions found') {
      debugLog('[DepositTracker] No transactions found for wallet');
      return [];
    }

    console.error('[DepositTracker] Blockscout API returned error:', data.message);
    return [];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[DepositTracker] Blockscout request timed out');
    } else {
      console.error('[DepositTracker] Error fetching from Blockscout:', error);
    }
    return [];
  }
}

/**
 * CORE ALGORITHM: Calculate deposited amount from blockchain data
 *
 * This processes transactions CHRONOLOGICALLY with stateful tracking:
 * - Deposits to vault: ADD to currentDeposited, ADD to vaultBalance
 * - Withdrawals from vault: SUBTRACT from vaultBalance
 * - When vaultBalance drops below threshold: RESET currentDeposited to 0
 *
 * The key insight is that a full withdrawal means the user took out
 * ALL their money (principal + yield), so their "deposited" amount
 * resets to 0. Any subsequent deposit starts fresh.
 *
 * Example:
 *   1. Deposit $360 → deposited=$360, balance=$360
 *   2. Yield accrues → deposited=$360, balance=$365
 *   3. Full withdraw $365 → deposited=0, balance=0 (RESET!)
 *   4. Deposit $360 → deposited=$360, balance=$360 (FRESH START)
 */
export async function calculateDepositedFromChain(
  walletAddress: string,
  skipCache: boolean = false
): Promise<{ deposited: number; fromCache: boolean }> {
  const address = walletAddress.toLowerCase();

  // Check cache first (unless skipCache is true)
  if (!skipCache) {
    const cached = await getBlockchainCache(address);
    if (cached) {
      return { deposited: cached.totalDeposited, fromCache: true };
    }
  }

  // Fetch all USDC transfers for this wallet
  const transfers = await fetchTokenTransfersForDeposits(address, TOKENS.USDC);

  if (transfers.length === 0) {
    debugLog('[DepositTracker] No transfers found, deposited = 0');
    return { deposited: 0, fromCache: false };
  }

  // Sort by block number (chronological order)
  // Blockscout already returns sorted by 'asc' but let's ensure
  transfers.sort((a, b) => parseInt(a.blockNumber) - parseInt(b.blockNumber));

  // State tracking
  let currentDeposited = 0;
  let vaultBalance = 0;

  debugLog('[DepositTracker] Processing', transfers.length, 'transfers chronologically...');

  for (const transfer of transfers) {
    const from = transfer.from.toLowerCase();
    const to = transfer.to.toLowerCase();
    const value = BigInt(transfer.value || '0');

    // Skip zero-value transfers
    if (value === BigInt(0)) continue;

    // Convert to USD (USDC has 6 decimals)
    const amount = Number(value) / 1e6;

    const isFromVault = VAULT_ADDRESSES_SET.has(from);
    const isToVault = VAULT_ADDRESSES_SET.has(to);
    const isFromWallet = from === address;
    const isToWallet = to === address;

    // DEPOSIT: wallet → vault
    if (isFromWallet && isToVault) {
      currentDeposited += amount;
      vaultBalance += amount;
      debugLog(`  [DEPOSIT] +$${amount.toFixed(2)} → deposited=$${currentDeposited.toFixed(2)}, balance=$${vaultBalance.toFixed(2)}`);
    }
    // WITHDRAW: vault → wallet
    else if (isFromVault && isToWallet) {
      vaultBalance -= amount;
      debugLog(`  [WITHDRAW] -$${amount.toFixed(2)} → balance=$${vaultBalance.toFixed(2)}`);

      // Check for full withdrawal (balance near zero)
      if (vaultBalance < FULL_WITHDRAWAL_THRESHOLD) {
        debugLog(`  [RESET] Full withdrawal detected, balance=$${vaultBalance.toFixed(2)} < $${FULL_WITHDRAWAL_THRESHOLD}`);
        currentDeposited = 0;
        vaultBalance = 0; // Reset to exactly 0
      }
    }
  }

  // Sanity check: deposited cannot be negative
  currentDeposited = Math.max(0, currentDeposited);

  debugLog('[DepositTracker] BLOCKCHAIN RESULT: deposited=$' + currentDeposited.toFixed(2));

  // Save to cache
  await saveBlockchainCache(address, currentDeposited);

  return { deposited: currentDeposited, fromCache: false };
}

/**
 * Invalidate the blockchain cache for a wallet
 * Call this after a deposit or withdrawal to force a fresh calculation
 */
export async function invalidateBlockchainCache(walletAddress: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(BLOCKCHAIN_CACHE_KEY);
    if (!data) return;

    const cache: Record<string, BlockchainDepositCache> = JSON.parse(data);
    delete cache[walletAddress.toLowerCase()];
    await AsyncStorage.setItem(BLOCKCHAIN_CACHE_KEY, JSON.stringify(cache));

    debugLog('[DepositTracker] Blockchain cache invalidated for:', walletAddress.slice(0, 10) + '...');
  } catch (error) {
    console.error('[DepositTracker] Error invalidating blockchain cache:', error);
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

  // Invalidate blockchain cache so next fetch gets fresh data
  // The cache will be repopulated on next getDepositedAndEarnings() call
  await invalidateBlockchainCache(address);

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

  // Invalidate blockchain cache so next fetch gets fresh data
  await invalidateBlockchainCache(address);

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
  }
}

/**
 * REPAIR: Set deposit amount to match on-chain reality
 * Use this to fix corrupted deposit data by setting to the correct value
 * based on actual on-chain deposit history.
 *
 * @param walletAddress - User's wallet address
 * @param correctTotal - The correct total deposited (from on-chain history)
 * @param reason - Reason for the repair (for logging)
 */
export async function repairDepositData(
  walletAddress: string,
  correctTotal: number,
  reason: string = 'manual repair'
): Promise<void> {
  const address = walletAddress.toLowerCase();
  const deposits = await getAllDeposits();

  const oldValue = deposits[address]?.totalDeposited ?? 0;

  console.log('[DepositTracker] REPAIR:', {
    address: address.slice(0, 10) + '...',
    oldValue: oldValue.toFixed(6),
    newValue: correctTotal.toFixed(6),
    diff: (correctTotal - oldValue).toFixed(6),
    reason,
  });

  deposits[address] = {
    totalDeposited: correctTotal,
    lastUpdated: Date.now(),
  };

  await saveDeposits(deposits);

  // Also sync to backend
  try {
    await fetch(`${API_BASE_URL}/api/deposits/${address}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalDeposited: correctTotal, repair: true, reason }),
    });
    console.log(`[DepositTracker] Repair synced to backend`);
  } catch (error) {
    console.warn('[DepositTracker] Backend repair sync failed:', error);
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

/**
 * DEBUG: Dump all deposit data to console
 * Call this from the app to see current state
 */
export async function debugDumpDepositData(walletAddress?: string): Promise<void> {
  console.log('\n========== DEPOSIT TRACKER DEBUG DUMP ==========\n');

  // Get all local data
  const allDeposits = await getAllDeposits();
  console.log('LOCAL STORAGE DATA:');
  console.log(JSON.stringify(allDeposits, null, 2));

  // Get pending sync queue
  const pendingQueue = await getPendingSyncQueue();
  console.log('\nPENDING SYNC QUEUE:');
  console.log(JSON.stringify(pendingQueue, null, 2));

  // If wallet address provided, also fetch from backend
  if (walletAddress) {
    const address = walletAddress.toLowerCase();
    console.log(`\nBACKEND DATA for ${address.slice(0, 10)}...:`);
    try {
      const backendRecord = await fetchFromBackend(address);
      console.log(JSON.stringify(backendRecord, null, 2));
    } catch (error) {
      console.log('Error fetching from backend:', error);
    }
  }

  console.log('\n=================================================\n');
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
 * ARCHITECTURE: BLOCKCHAIN IS SOURCE OF TRUTH
 * 1. Calculate deposited from on-chain data (with 5-minute cache)
 * 2. Earnings = currentBalance - deposited
 *
 * The blockchain calculation uses stateful tracking:
 * - Processes transactions chronologically
 * - Tracks deposits to vaults
 * - RESETS when a full withdrawal is detected (balance → 0)
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
  source: 'blockchain' | 'cache' | 'fallback';
}> {
  let deposited: number;
  let source: 'blockchain' | 'cache' | 'fallback';

  try {
    // PRIMARY: Calculate from blockchain (with 5-minute cache)
    const result = await calculateDepositedFromChain(walletAddress);
    deposited = result.deposited;
    source = result.fromCache ? 'cache' : 'blockchain';

    console.log('[DEPOSIT READ]', {
      address: walletAddress.slice(0, 10) + '...',
      source: source.toUpperCase(),
      totalDeposited: deposited.toFixed(6),
    });
  } catch (error) {
    // FALLBACK: Use stored AsyncStorage value if blockchain fetch fails
    console.error('[DepositTracker] Blockchain calculation failed, using fallback:', error);
    deposited = await getDeposited(walletAddress);
    source = 'fallback';

    console.log('[DEPOSIT READ]', {
      address: walletAddress.slice(0, 10) + '...',
      source: 'FALLBACK',
      totalDeposited: deposited.toFixed(6),
    });
  }

  // SANITY CHECK: If deposited > currentBalance, log a warning
  // This can happen when:
  // 1. RPC rate limiting returns partial vault data (e.g., 2 of 3 vaults)
  // 2. There's a timing issue between deposit recording and balance fetch
  //
  // We do NOT modify the deposited value - blockchain is source of truth
  if (currentBalance > 0 && deposited > currentBalance * 1.01) {
    console.warn('[DepositTracker] Warning: deposited > balance', {
      deposited: deposited.toFixed(2),
      currentBalance: currentBalance.toFixed(2),
      diff: (deposited - currentBalance).toFixed(2),
      note: 'Balance may be partial due to RPC issues - not modifying deposited',
    });
  }

  const earnings = Math.max(0, currentBalance - deposited);

  console.log('[EARNINGS DEBUG]', {
    walletAddress: walletAddress.slice(0, 10) + '...',
    deposited: deposited.toFixed(6),
    currentBalance: currentBalance.toFixed(6),
    earnings: earnings.toFixed(6),
    formula: `${currentBalance.toFixed(2)} - ${deposited.toFixed(2)} = ${earnings.toFixed(2)}`,
  });

  debugLog(`[DepositTracker] Deposited: $${deposited.toFixed(2)}, Balance: $${currentBalance.toFixed(2)}, Earnings: $${earnings.toFixed(2)}`);

  return { deposited, earnings, source };
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
