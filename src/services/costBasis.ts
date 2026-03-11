/**
 * Cost Basis Service
 * Backend-backed cost basis tracking for yield calculation
 *
 * Primary source of truth for "how much did the user deposit" (cost basis).
 * Earned yield = current on-chain position value - cost basis.
 *
 * Endpoints (on x-yield-api):
 * - GET  /api/deposits/:address/cost-basis          → { totalCostBasis, deposits }
 * - POST /api/deposits/:address/cost-basis          → record deposit
 * - POST /api/deposits/:address/withdrawal-record   → record withdrawal details
 * - GET  /api/deposits/:address/withdrawal-records  → get all withdrawal records
 */

// Debug mode
const DEBUG = __DEV__ ?? false;
const debugLog = (message: string, ...args: unknown[]) => {
  if (DEBUG) console.log(message, ...args);
};

const API_BASE_URL = 'https://x-yield-api.vercel.app';
const REQUEST_TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CostBasisRecord {
  amount: number;
  txHash?: string;
  timestamp: string;
}

export interface CostBasisResponse {
  totalCostBasis: number;
  deposits: CostBasisRecord[];
}

export interface WithdrawalRecord {
  withdrawnAmount: number;
  costBasisPortion: number;
  yieldPortion: number;
  feePaid: number;
  txHash: string;
  timestamp: string;
}

export interface WithdrawalRecordsResponse {
  records: WithdrawalRecord[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeAddress(address: string): string {
  return address.toLowerCase().trim();
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET cost basis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch cost basis from backend.
 * Returns totalCostBasis (sum of all deposits minus proportional reductions from withdrawals).
 */
export async function getCostBasis(
  address: string
): Promise<CostBasisResponse> {
  const addr = sanitizeAddress(address);
  const url = `${API_BASE_URL}/api/deposits/${addr}/cost-basis`;

  debugLog('[CostBasis] GET', url);

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Cost basis fetch failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as CostBasisResponse;

  debugLog('[CostBasis] Result:', {
    totalCostBasis: data.totalCostBasis,
    depositCount: data.deposits?.length ?? 0,
  });

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST deposit (record BEFORE on-chain execution)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a deposit to the backend cost basis store.
 * Called BEFORE on-chain execution (write-ahead pattern).
 * If the backend write fails, the old depositTracker records as fallback.
 */
export async function recordCostBasisDeposit(
  address: string,
  amount: number,
  txHash?: string
): Promise<void> {
  const addr = sanitizeAddress(address);
  const url = `${API_BASE_URL}/api/deposits/${addr}/cost-basis`;

  debugLog('[CostBasis] POST deposit', { address: addr, amount, txHash });

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount,
      txHash: txHash ?? null,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Cost basis deposit record failed: ${response.status} ${response.statusText}`);
  }

  debugLog('[CostBasis] Deposit recorded successfully');
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE cost basis deposit (rollback write-ahead on failed tx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rollback a write-ahead deposit record.
 * Called when an on-chain transaction FAILS after the cost basis was pre-recorded.
 * Removes the most recent deposit matching the given amount.
 */
export async function rollbackCostBasisDeposit(
  address: string,
  amount: number
): Promise<void> {
  const addr = sanitizeAddress(address);
  const url = `${API_BASE_URL}/api/deposits/${addr}/cost-basis/rollback`;

  debugLog('[CostBasis] DELETE rollback', { address: addr, amount });

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });

  if (!response.ok) {
    throw new Error(`Cost basis rollback failed: ${response.status} ${response.statusText}`);
  }

  debugLog('[CostBasis] Rollback successful');
}

// ─────────────────────────────────────────────────────────────────────────────
// POST withdrawal record (record AFTER successful on-chain tx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a withdrawal with full yield breakdown.
 * Call this AFTER a successful on-chain withdrawal.
 */
export async function recordCostBasisWithdrawal(
  address: string,
  record: {
    withdrawnAmount: number;
    costBasisPortion: number;
    yieldPortion: number;
    feePaid: number;
    txHash: string;
  }
): Promise<void> {
  const addr = sanitizeAddress(address);
  const url = `${API_BASE_URL}/api/deposits/${addr}/withdrawal-record`;

  debugLog('[CostBasis] POST withdrawal', { address: addr, ...record });

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...record,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Withdrawal record failed: ${response.status} ${response.statusText}`);
  }

  debugLog('[CostBasis] Withdrawal recorded successfully');
}

// ─────────────────────────────────────────────────────────────────────────────
// GET withdrawal records
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all withdrawal records for a wallet.
 * Used by Statements screen for realized yield display.
 */
export async function getWithdrawalRecords(
  address: string
): Promise<WithdrawalRecord[]> {
  const addr = sanitizeAddress(address);
  const url = `${API_BASE_URL}/api/deposits/${addr}/withdrawal-records`;

  debugLog('[CostBasis] GET withdrawal-records', url);

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Withdrawal records fetch failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as WithdrawalRecordsResponse;

  debugLog('[CostBasis] Withdrawal records:', {
    count: data.records?.length ?? 0,
  });

  return data.records ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sum realized yield from all withdrawal records.
 * REALIZED = sum of yieldPortion across all withdrawals.
 */
export function sumRealizedYield(records: WithdrawalRecord[]): number {
  return records.reduce((sum, r) => sum + r.yieldPortion, 0);
}

/**
 * Sum total fees paid from all withdrawal records.
 */
export function sumTotalFeesPaid(records: WithdrawalRecord[]): number {
  return records.reduce((sum, r) => sum + r.feePaid, 0);
}
