/**
 * Cost Basis Verification Service
 * On-chain verification and reconciliation for cost basis data.
 *
 * Compares backend cost basis against live vault positions and on-chain
 * transaction history. Reconciles mismatches > $0.01 by updating the backend.
 *
 * Usage: Call verifyCostBasis() on Dashboard mount and after deposit/withdrawal.
 * All calls are non-blocking (fire-and-forget).
 */

import { type Address } from 'viem';
import { getVaultPositions } from './blockchain';
import { getCostBasis, recordCostBasisDeposit } from './costBasis';
import { calculateDepositedFromChain } from './depositTracker';

// Debug mode
const DEBUG = __DEV__ ?? false;
const debugLog = (message: string, ...args: unknown[]) => {
  if (DEBUG) console.log(message, ...args);
};

const MISMATCH_THRESHOLD = 0.01; // $0.01

export interface VerificationResult {
  matched: boolean;
  backendCostBasis: number;
  onChainDeposited: number;
  currentPositionValue: number;
  mismatchAmount: number;
  reconciled: boolean;
  source: 'skip' | 'match' | 'reconciled' | 'error';
}

/**
 * Verify backend cost basis against on-chain data.
 *
 * 1. Fetch backend cost basis
 * 2. Fetch live vault positions (current balance)
 * 3. Fetch on-chain deposit history
 * 4. Compare backend vs on-chain — if mismatch > $0.01, reconcile
 *
 * Reconciliation: If backend is empty/zero but on-chain shows deposits,
 * seed the backend with the on-chain value.
 * If backend has a value but on-chain disagrees, log a warning
 * (manual review needed — we don't overwrite existing backend data).
 */
export async function verifyCostBasis(
  address: string
): Promise<VerificationResult> {
  const addr = address.toLowerCase().trim();

  debugLog('[Verification] Starting cost basis verification for', addr.slice(0, 10) + '...');

  try {
    // Fetch all three data sources in parallel
    const [costBasis, positions, chainResult] = await Promise.all([
      getCostBasis(addr),
      getVaultPositions(addr as Address),
      calculateDepositedFromChain(addr, true), // skipCache = true for fresh data
    ]);

    const backendCostBasis = costBasis.totalCostBasis;
    const currentPositionValue = parseFloat(positions.totalUsdValue) || 0;
    const onChainDeposited = chainResult.deposited;

    debugLog('[Verification] Data:', {
      backendCostBasis: backendCostBasis.toFixed(6),
      onChainDeposited: onChainDeposited.toFixed(6),
      currentPositionValue: currentPositionValue.toFixed(6),
    });

    // If no position, nothing to verify
    if (currentPositionValue === 0) {
      debugLog('[Verification] No active position, skipping');
      return {
        matched: true,
        backendCostBasis,
        onChainDeposited,
        currentPositionValue,
        mismatchAmount: 0,
        reconciled: false,
        source: 'skip',
      };
    }

    const mismatchAmount = Math.abs(backendCostBasis - onChainDeposited);

    // Check if they match within threshold
    if (mismatchAmount <= MISMATCH_THRESHOLD) {
      debugLog('[Verification] MATCH — backend and on-chain agree');
      return {
        matched: true,
        backendCostBasis,
        onChainDeposited,
        currentPositionValue,
        mismatchAmount,
        reconciled: false,
        source: 'match',
      };
    }

    // MISMATCH detected
    debugLog('[Verification] MISMATCH detected:', {
      backend: backendCostBasis.toFixed(6),
      onChain: onChainDeposited.toFixed(6),
      diff: mismatchAmount.toFixed(6),
    });

    // Case 1: Backend is empty/zero but on-chain has data → seed backend
    const isEmptyBackend = backendCostBasis === 0 &&
      (!costBasis.deposits || costBasis.deposits.length === 0);

    if (isEmptyBackend && onChainDeposited > 0) {
      debugLog('[Verification] Backend empty, seeding from on-chain:', onChainDeposited.toFixed(6));
      try {
        await recordCostBasisDeposit(addr, onChainDeposited);
        debugLog('[Verification] Backend seeded successfully');
        return {
          matched: false,
          backendCostBasis,
          onChainDeposited,
          currentPositionValue,
          mismatchAmount,
          reconciled: true,
          source: 'reconciled',
        };
      } catch (seedError) {
        console.warn('[Verification] Failed to seed backend:', seedError);
      }
    }

    // Case 2: Both have data but disagree → log warning only
    // We don't overwrite existing backend data to avoid data loss
    if (backendCostBasis > 0 && onChainDeposited > 0) {
      console.warn('[Verification] Cost basis mismatch — manual review needed:', {
        backend: backendCostBasis.toFixed(6),
        onChain: onChainDeposited.toFixed(6),
        diff: mismatchAmount.toFixed(6),
      });
    }

    return {
      matched: false,
      backendCostBasis,
      onChainDeposited,
      currentPositionValue,
      mismatchAmount,
      reconciled: false,
      source: 'match', // not reconciled, just logged
    };
  } catch (error) {
    console.warn('[Verification] Cost basis verification failed (non-blocking):', error);
    return {
      matched: false,
      backendCostBasis: 0,
      onChainDeposited: 0,
      currentPositionValue: 0,
      mismatchAmount: 0,
      reconciled: false,
      source: 'error',
    };
  }
}
