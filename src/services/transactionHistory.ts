/**
 * Transaction History Service
 * Fetches and aggregates transaction data from blockchain only
 *
 * Data source: Blockscout API (on-chain ERC20 transfers)
 * - All data is verifiable on-chain via BaseScan/Blockscout
 * - No backend dependency - pure blockchain data
 *
 * Calculations (vault-based):
 * - totalDeposited = sum of 'deposit' transactions (wallet → vault)
 * - totalWithdrawn = sum of 'withdraw' transactions (vault → wallet)
 * - netDeposited = totalDeposited - totalWithdrawn (what's invested)
 * - Earnings = currentBalance - netDeposited (yield earned)
 *
 * Fee handling:
 * - Platform fees (15%) are matched to withdrawals by txHash or time window
 * - Unmatched fees are reclassified as 'send' (not platform fees)
 *
 * Caching:
 * - Transactions are cached in AsyncStorage with 5-minute TTL
 * - Cached data shown immediately, fresh data fetched in background
 * - Pull-to-refresh bypasses cache
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOKENS, UNFLAT_TREASURY_ADDRESS, MORPHO } from '../constants/contracts';
import { MORPHO_VAULTS } from '../constants/strategies';
import { type BlockscoutTokenTransfer, type BlockscoutApiResponse } from '../types/api';
import { getTotalDeposited } from './depositTracker';

// Re-export formatting utilities for backward compatibility
export {
  formatCurrency,
  formatDate,
  formatDateShort,
  shortenAddress,
  shortenTxHash,
} from '../utils/formatting';

// Import for internal use
import { shortenAddress as _shortenAddress } from '../utils/formatting';

// Debug mode
const DEBUG = __DEV__ ?? false;
const debugLog = (message: string, ...args: unknown[]) => {
  if (DEBUG) console.log(message, ...args);
};

// Blockscout API for Base chain (free, no API key required)
// BaseScan V1 is deprecated, V2 requires paid plan - using Blockscout instead
const BLOCKSCOUT_API_URL = 'https://base.blockscout.com/api';

// Cache configuration
const CACHE_KEY_PREFIX = 'tx_history_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Platform fee rate (15% of yield)
const PLATFORM_FEE_RATE = 0.15;

interface CachedTransactionData {
  transactions: Transaction[];
  timestamp: number;
  walletAddress: string;
}

// Transaction types with clear user-facing meaning:
// - 'receive': USDC coming from external wallet (Coinbase, other wallets)
// - 'send': USDC going to external wallet
// - 'deposit': USDC moving to Morpho vault (putting to work)
// - 'withdraw': USDC coming from Morpho vault (taking from savings)
// - 'fee': USDC going to treasury as platform fee (15% of earnings)
export type TransactionType = 'receive' | 'send' | 'deposit' | 'withdraw' | 'fee';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number; // In USD/USDC
  amountRaw: string; // Raw amount string
  timestamp: Date;
  txHash: string;
  fromAddress: string; // Sender address
  toAddress: string; // Recipient address
  vaultName?: string;
  vaultAddress?: string;
  balanceAfter?: number;
  // Fee associated with a withdrawal (only set on 'withdraw' type transactions)
  associatedFee?: {
    amount: number;
    txHash: string;
  };
}

/**
 * Grouped transaction - combines multiple vault transactions into one
 * Used for grouping 3 vault deposits/withdrawals into a single row
 */
export interface GroupedTransaction {
  id: string;
  type: 'deposit' | 'withdraw';
  totalAmount: number;
  timestamp: Date;
  transactions: Transaction[]; // The individual vault transactions
  isGrouped: true;
}

/**
 * Display item - either a single transaction or a grouped transaction
 */
export type TransactionDisplayItem =
  | (Transaction & { isGrouped?: false })
  | GroupedTransaction;

export interface TransactionSummary {
  // Core values
  totalDeposited: number; // Net deposited to vaults (deposits - withdrawals) = INVESTED
  totalWithdrawn: number; // Total withdrawn from vaults
  totalEarnings: number; // Unrealized earnings (currentBalance - netDeposited)
  totalFees: number; // Total fees paid to treasury
  netGain: number; // totalEarnings - totalFees (legacy, kept for compatibility)
  currentBalance: number; // Current vault balance

  // Tax-relevant values (REALIZED)
  grossYieldRealized: number; // totalFees / 0.15 (gross yield that was withdrawn)
  realizedEarnings: number; // grossYieldRealized - totalFees (net taxable income)

  // Transaction counts
  transactionCount: number;
  rawTransferCount: number; // Total raw transfers from blockchain
  skippedCount: number; // Internal/filtered transfers

  // Sanity check results
  sanityChecks: SanityCheckResults;
}

export interface SanityCheckResults {
  // a) Net deposited consistency
  netDepositedCheck: {
    deposits: number;
    withdrawals: number;
    netDeposited: number;
    passed: boolean;
  };

  // b) Realized earnings reverse check
  realizedEarningsCheck: {
    totalFees: number;
    grossYield: number;
    realizedEarnings: number;
    reverseCheckFees: number; // realizedEarnings / 0.85 * 0.15
    passed: boolean;
  };

  // c) Cash flow check (bank statement balance)
  cashFlowCheck: {
    receives: number;
    sends: number;
    feesExternal: number;
    netCashFlow: number;
    investedCapital: number; // balance - unrealizedEarnings
    difference: number;
    passed: boolean;
  };

  // d) Transaction count check
  transactionCountCheck: {
    rawTransfers: number;
    classified: number;
    skipped: number;
    passed: boolean; // raw === classified + skipped
  };

  // Overall result
  allPassed: boolean;
}

export interface TransactionHistoryResult {
  transactions: Transaction[];
  summary: TransactionSummary;
  dateRange: {
    from: Date;
    to: Date;
  };
  walletAddress: string;
}

// Vault addresses for matching (lowercase)
const VAULT_ADDRESSES_SET = new Set(
  Object.values(MORPHO_VAULTS).map(v => v.address.toLowerCase())
);

// Internal addresses to filter out (lowercase)
// These are protocol-related addresses that aren't "real" external transactions
const INTERNAL_ADDRESSES_SET = new Set([
  // Our vaults
  ...Object.values(MORPHO_VAULTS).map(v => v.address.toLowerCase()),
  // Our treasury (fee collection)
  UNFLAT_TREASURY_ADDRESS.toLowerCase(),
  // Morpho core contracts
  MORPHO.MORPHO_BLUE.toLowerCase(),
  MORPHO.BUNDLER.toLowerCase(),
]);

// Known Morpho market/underlying contract prefixes
// These are contracts involved in vault operations but not user-facing
const MORPHO_MARKET_PREFIXES = [
  '0xbeef',   // Morpho protocol contracts (Steakhouse vaults, etc.)
  '0xbbbb',   // Morpho Blue core
  '0x616a4e', // Steakhouse Prime underlying market
  '0xc1256a', // Steakhouse High Yield underlying market
];

/**
 * Check if an address is an internal/protocol address
 * Returns true if we should NOT show this as an external transaction
 */
function isInternalAddress(address: string): boolean {
  const addr = address.toLowerCase();

  // Check direct match
  if (INTERNAL_ADDRESSES_SET.has(addr)) return true;

  // Check if it's a Morpho-related contract by prefix
  for (const prefix of MORPHO_MARKET_PREFIXES) {
    if (addr.startsWith(prefix)) return true;
  }

  return false;
}


/**
 * Fetch ERC20 token transfers for a wallet from Blockscout API
 * Blockscout API is free and doesn't require an API key
 */
async function fetchTokenTransfers(
  walletAddress: string,
  tokenAddress: string,
  startBlock: number = 0,
  endBlock: number = 99999999
): Promise<BlockscoutTokenTransfer[]> {
  // Validate wallet address
  if (!walletAddress || walletAddress.length < 10) {
    console.error('[TransactionHistory] Invalid wallet address:', walletAddress);
    return [];
  }

  try {
    // Blockscout uses same API format as Etherscan
    const url = new URL(BLOCKSCOUT_API_URL);
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'tokentx');
    url.searchParams.set('address', walletAddress);
    url.searchParams.set('contractaddress', tokenAddress);
    url.searchParams.set('startblock', startBlock.toString());
    url.searchParams.set('endblock', endBlock.toString());
    url.searchParams.set('sort', 'desc');

    debugLog('[TransactionHistory] Fetching from Blockscout for:', walletAddress);

    // Add timeout for production reliability
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[TransactionHistory] API response not OK:', response.status);
      // Don't throw, just return empty to allow graceful degradation
      return [];
    }

    const data: BlockscoutApiResponse<BlockscoutTokenTransfer[]> = await response.json();

    if (data.status === '1' && Array.isArray(data.result)) {
      debugLog('[TransactionHistory] Found', data.result.length, 'token transfers');
      return data.result;
    }

    // API returned no results - this is valid (new wallet with no history)
    if (data.status === '0' && data.message === 'No transactions found') {
      debugLog('[TransactionHistory] No transactions found for wallet');
      return [];
    }

    // API returned an error
    console.error('[TransactionHistory] API error:', data.status, data.message);
    return [];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[TransactionHistory] Request timed out');
    } else {
      console.error('[TransactionHistory] Error fetching transfers:', error);
    }
    return [];
  }
}

/**
 * Parse raw transfer into a Transaction object
 *
 * TRANSACTION TYPES:
 * - 'receive': USDC coming from external wallet (Coinbase, other wallets)
 * - 'send': USDC going to external wallet
 * - 'deposit': USDC moving to Morpho vault (putting money to work)
 * - 'withdraw': USDC coming from Morpho vault (taking from savings)
 */
function parseTransfer(
  transfer: BlockscoutTokenTransfer,
  walletAddress: string,
  decimals: number = 6,
  index: number = 0,
  otherOwnedAddress?: string // User's other wallet (EOA or smart wallet)
): Transaction | null {
  try {
    const from = transfer.from?.toLowerCase();
    const to = transfer.to?.toLowerCase();
    const wallet = walletAddress.toLowerCase();
    const otherWallet = otherOwnedAddress?.toLowerCase();
    const value = BigInt(transfer.value || '0');

    // Skip zero-value transfers
    if (value === BigInt(0)) return null;

    // Convert to human-readable amount for logging
    const divisor = BigInt(10 ** decimals);
    const amountForLog = Number(value) / Number(divisor);

    // Check if transfer involves a Morpho vault
    const isFromVault = VAULT_ADDRESSES_SET.has(from);
    const isToVault = VAULT_ADDRESSES_SET.has(to);

    // Parse timestamp - Blockscout returns Unix seconds
    const rawTimestamp = parseInt(transfer.timeStamp);
    const parsedDate = new Date(rawTimestamp * 1000);

    // Check if address is internal (including user's other wallet)
    const isAddressInternal = (addr: string): boolean => {
      if (isInternalAddress(addr)) return true;
      // User's other wallet is also "internal" (not external send/receive)
      if (otherWallet && addr === otherWallet) return true;
      return false;
    };

    const isFromInternal = isAddressInternal(from);
    const isToInternal = isAddressInternal(to);
    const treasuryAddress = UNFLAT_TREASURY_ADDRESS.toLowerCase();

    // Determine transaction type based on direction and counterparty
    let type: TransactionType;
    let vaultName: string | undefined;

    if (from === wallet && to === treasuryAddress) {
      // USDC going FROM wallet TO treasury = FEE (15% platform fee)
      type = 'fee';
    } else if (to === wallet && from === treasuryAddress) {
      // USDC coming FROM treasury TO wallet = RECEIVE (refund/rebate)
      // Count as receive for accurate accounting (sanity check requires all money movements)
      type = 'receive';
    } else if (to === wallet && isFromVault) {
      // USDC coming FROM vault TO wallet = WITHDRAW (taking from savings)
      type = 'withdraw';
      vaultName = Object.values(MORPHO_VAULTS).find(
        v => v.address.toLowerCase() === from
      )?.name;
    } else if (from === wallet && isToVault) {
      // USDC going FROM wallet TO vault = DEPOSIT (putting to work)
      type = 'deposit';
      vaultName = Object.values(MORPHO_VAULTS).find(
        v => v.address.toLowerCase() === to
      )?.name;
    } else if (to === wallet && !isFromInternal) {
      // USDC coming FROM true external address TO wallet = RECEIVE
      // Skip if from an internal/protocol address (not a real external receive)
      type = 'receive';
    } else if (from === wallet && !isToInternal) {
      // USDC going FROM wallet TO true external address = SEND
      // Skip if to an internal/protocol address (not a real external send)
      type = 'send';
    } else {
      // Internal protocol transfer or doesn't involve wallet - skip
      return null;
    }

    // Use amountForLog calculated earlier
    const amount = amountForLog;

    // Generate unique ID using hash, from, to, value, and index
    const uniqueId = `${transfer.hash}-${from}-${to}-${transfer.value}-${index}`;

    return {
      id: uniqueId,
      type,
      amount,
      amountRaw: transfer.value,
      timestamp: parsedDate,
      txHash: transfer.hash,
      fromAddress: transfer.from,
      toAddress: transfer.to,
      vaultName,
    };
  } catch (error) {
    console.error('[TransactionHistory] Error parsing transfer:', error);
    return null;
  }
}

/**
 * Filter transactions by date range
 */
function filterByDateRange(
  transactions: Transaction[],
  from: Date,
  to: Date
): Transaction[] {
  return transactions.filter(tx => {
    return tx.timestamp >= from && tx.timestamp <= to;
  });
}

/**
 * Calculate running balances for transactions
 */
function calculateBalances(
  transactions: Transaction[],
  currentBalance: number
): Transaction[] {
  // Sort by timestamp descending (newest first)
  const sorted = [...transactions].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  // Calculate balance after each transaction (working backwards)
  let balance = currentBalance;
  const withBalances: Transaction[] = [];

  for (const tx of sorted) {
    const txWithBalance = { ...tx, balanceAfter: balance };
    withBalances.push(txWithBalance);

    // Adjust balance for previous state (working backwards)
    // Money IN increases balance, money OUT decreases balance
    if (tx.type === 'receive' || tx.type === 'withdraw') {
      // Receive/Withdraw = money coming IN to wallet
      balance -= tx.amount;
    } else if (tx.type === 'send' || tx.type === 'deposit') {
      // Send/Deposit = money going OUT of wallet
      balance += tx.amount;
    }
  }

  // Return in chronological order (oldest first)
  return withBalances.reverse();
}

/**
 * Calculate summary statistics from blockchain transactions
 *
 * KEY INSIGHT: Use VAULT operations (deposit/withdraw) not external operations (receive/send)
 *
 * - totalDeposited = sum of 'deposit' transactions (wallet → vault, money put to work)
 * - totalWithdrawn = sum of 'withdraw' transactions (vault → wallet, money taken out)
 * - netDeposited = totalDeposited - totalWithdrawn (net position in vaults)
 * - totalEarnings = currentBalance - netDeposited (yield earned)
 *
 * This correctly handles:
 * - Money received but not yet deposited to vaults (doesn't affect earnings)
 * - Partial withdrawals (earnings stay accurate)
 * - Treasury transfers (ignored, they're not vault operations)
 */
function calculateSummary(
  transactions: Transaction[],
  currentBalance: number,
  rawTransferCount: number = 0,
  skippedCount: number = 0
): TransactionSummary {
  // Uses module-level PLATFORM_FEE_RATE constant (0.15)

  // Vault operations (for earnings calculation)
  let totalDepositedToVaults = 0; // Sum of 'deposit' transactions (wallet → vault)
  let totalWithdrawnFromVaults = 0; // Sum of 'withdraw' transactions (vault → wallet)
  let totalFees = 0; // Only fees associated with withdrawals

  // External cash flows (for sanity check)
  let totalReceives = 0; // Money coming in from external sources
  let totalSends = 0; // Money going out to external addresses
  let totalFeesExternal = 0; // All fee transactions (wallet → treasury)

  for (const tx of transactions) {
    switch (tx.type) {
      case 'deposit':
        totalDepositedToVaults += tx.amount;
        break;
      case 'withdraw':
        totalWithdrawnFromVaults += tx.amount;
        if (tx.associatedFee) {
          totalFees += tx.associatedFee.amount;
        }
        break;
      case 'receive':
        totalReceives += tx.amount;
        break;
      case 'send':
        totalSends += tx.amount;
        break;
      case 'fee':
        totalFeesExternal += tx.amount;
        break;
    }
  }

  // Net deposited = what's actually "invested" in vaults = INVESTED
  const netDeposited = totalDepositedToVaults - totalWithdrawnFromVaults;

  // Unrealized earnings = current balance minus net deposited
  const totalEarnings = currentBalance - netDeposited;

  // ═══════════════════════════════════════════════════════════════════════════
  // REALIZED EARNINGS CALCULATION (Tax-Relevant)
  // Fee = 15% of gross yield → gross yield = fee / 0.15
  // Realized = gross yield - fee (what user keeps after fees)
  // ═══════════════════════════════════════════════════════════════════════════
  const grossYieldRealized = totalFees > 0 ? totalFees / PLATFORM_FEE_RATE : 0;
  const realizedEarnings = grossYieldRealized - totalFees; // Net after fees

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPREHENSIVE SANITY CHECKS
  // ═══════════════════════════════════════════════════════════════════════════

  // a) Net deposited consistency check
  const netDepositedCheck = {
    deposits: totalDepositedToVaults,
    withdrawals: totalWithdrawnFromVaults,
    netDeposited: netDeposited,
    passed: Math.abs(totalDepositedToVaults - totalWithdrawnFromVaults - netDeposited) < 0.001,
  };

  // b) Realized earnings reverse check
  // If realizedEarnings = grossYield - fees, then:
  // realizedEarnings / 0.85 * 0.15 should equal totalFees
  const reverseCheckFees = realizedEarnings > 0 ? (realizedEarnings / 0.85) * 0.15 : 0;
  const realizedEarningsCheck = {
    totalFees: totalFees,
    grossYield: grossYieldRealized,
    realizedEarnings: realizedEarnings,
    reverseCheckFees: reverseCheckFees,
    passed: Math.abs(reverseCheckFees - totalFees) < 0.01,
  };

  // c) Cash flow check (bank statement balance)
  const netCashFlow = totalReceives - totalSends - totalFeesExternal;
  const investedCapital = currentBalance - totalEarnings;
  const cashFlowDifference = Math.abs(netCashFlow - investedCapital);
  const cashFlowCheck = {
    receives: totalReceives,
    sends: totalSends,
    feesExternal: totalFeesExternal,
    netCashFlow: netCashFlow,
    investedCapital: investedCapital,
    difference: cashFlowDifference,
    passed: cashFlowDifference < 0.01,
  };

  // d) Transaction count check (only valid if rawTransferCount > 0)
  const transactionCountCheck = {
    rawTransfers: rawTransferCount,
    classified: transactions.length,
    skipped: skippedCount,
    passed: rawTransferCount === 0 || rawTransferCount === transactions.length + skippedCount,
  };

  // Overall result
  const allPassed =
    netDepositedCheck.passed &&
    realizedEarningsCheck.passed &&
    cashFlowCheck.passed &&
    transactionCountCheck.passed;

  const sanityChecks: SanityCheckResults = {
    netDepositedCheck,
    realizedEarningsCheck,
    cashFlowCheck,
    transactionCountCheck,
    allPassed,
  };

  // Log concise summary in debug mode
  debugLog(`[Sanity] INVESTED: $${netDeposited.toFixed(2)} | REALIZED: $${realizedEarnings.toFixed(2)} | ${allPassed ? '✅ All checks passed' : '❌ Some checks failed'}`);

  // Log warnings for failed checks (always, even in production)
  if (!allPassed) {
    if (!netDepositedCheck.passed) {
      console.warn('[Sanity] Net deposited check failed');
    }
    if (!realizedEarningsCheck.passed) {
      console.warn('[Sanity] Realized earnings check failed');
    }
    if (!cashFlowCheck.passed) {
      console.warn('[Sanity] Cash flow mismatch:', cashFlowCheck.difference.toFixed(6));
    }
    if (!transactionCountCheck.passed) {
      console.warn('[Sanity] Transaction count mismatch');
    }
  }

  return {
    // Core values
    totalDeposited: netDeposited, // INVESTED (net deposited to vaults)
    totalWithdrawn: totalWithdrawnFromVaults,
    totalEarnings, // Unrealized earnings
    totalFees,
    netGain: totalEarnings - totalFees, // Legacy field
    currentBalance,

    // Tax-relevant values (REALIZED)
    grossYieldRealized,
    realizedEarnings, // REALIZED (net taxable income)

    // Transaction counts
    transactionCount: transactions.length,
    rawTransferCount,
    skippedCount,

    // Sanity check results
    sanityChecks,
  };
}

/**
 * Get net deposited amount from blockchain data
 *
 * This is a lightweight function that calculates:
 *   netDeposited = sum(deposits to vaults) - sum(withdrawals from vaults)
 *
 * Uses cached data when available, otherwise fetches from blockchain.
 * This should be used for consistent "Deposited" display across all screens.
 *
 * @param walletAddress - Smart wallet address to query
 * @param otherOwnedAddress - Optional EOA address to treat as internal
 * @returns Net deposited amount in USD
 */
export async function getNetDepositedFromBlockchain(
  walletAddress: string,
  otherOwnedAddress?: string
): Promise<number> {
  // Try to get from cache first
  let transactions = await getCachedTransactions(walletAddress);

  // If no cache, fetch fresh data
  if (!transactions) {
    const fetchResult = await fetchRawTransactions(walletAddress, otherOwnedAddress);
    transactions = fetchResult.transactions;
    await saveToCache(walletAddress, transactions);
  }

  // Match fees to withdrawals so we can calculate principal vs yield
  transactions = matchFeesToWithdrawals(transactions);

  // Calculate net deposited using fee-based principal separation
  // Key insight: Fee = 15% of yield, so yieldPortion = fee / 0.15
  // principalWithdrawn = withdrawAmount - yieldPortion
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalPrincipalWithdrawn = 0;

  for (const tx of transactions) {
    if (tx.type === 'deposit') {
      totalDeposits += tx.amount;
    } else if (tx.type === 'withdraw') {
      totalWithdrawals += tx.amount;

      // Separate principal from yield using the associated fee
      if (tx.associatedFee && tx.associatedFee.amount > 0) {
        const feeAmount = tx.associatedFee.amount;
        const yieldPortion = feeAmount / PLATFORM_FEE_RATE;

        // SANITY CHECK 1: Yield cannot exceed withdrawal amount
        // If fee implies yield > withdrawal, it's a buggy/mismatched fee
        const yieldExceedsWithdrawal = yieldPortion > tx.amount;

        // SANITY CHECK 2: Fee should be reasonable relative to withdrawal
        // Max realistic: 50% yield (extreme), fee = 7.5% of withdrawal
        // If fee > 10% of withdrawal, likely a mismatched fee transaction
        const feeRatio = feeAmount / tx.amount;
        const feeUnreasonablyHigh = feeRatio > 0.10; // Fee > 10% of withdrawal is suspicious

        if (yieldExceedsWithdrawal || feeUnreasonablyHigh) {
          debugLog(`[getNetDeposited] WARNING: Suspicious fee detected. Fee $${feeAmount.toFixed(2)} (${(feeRatio * 100).toFixed(1)}% of withdrawal $${tx.amount.toFixed(2)}). Treating withdrawal as full principal.`);
          totalPrincipalWithdrawn += tx.amount;
        } else {
          const principalPortion = tx.amount - yieldPortion;
          totalPrincipalWithdrawn += principalPortion;
        }
      } else {
        // No fee = no profit (break-even or loss), entire withdrawal is principal
        totalPrincipalWithdrawn += tx.amount;
      }
    }
  }

  // Calculate net deposited
  let netDeposited = totalDeposits - totalPrincipalWithdrawn;

  // SANITY CHECK 1: Net deposited cannot be negative
  netDeposited = Math.max(0, netDeposited);

  // SANITY CHECK 2: Net deposited cannot exceed total deposits ever made
  // (You can't have deposited more than you actually deposited)
  if (netDeposited > totalDeposits) {
    debugLog(`[getNetDeposited] WARNING: Net deposited $${netDeposited.toFixed(2)} > total deposits $${totalDeposits.toFixed(2)}. Capping to total deposits.`);
    netDeposited = totalDeposits;
  }

  // SANITY CHECK 3: If we have current positions, net deposited shouldn't drastically exceed reality
  // For fresh accounts: net deposited = deposits - principal withdrawn
  // This is already handled above, but we add a final reasonableness check

  debugLog(`[getNetDeposited] Deposits: $${totalDeposits.toFixed(2)}, Withdrawals: $${totalWithdrawals.toFixed(2)}, Principal Withdrawn: $${totalPrincipalWithdrawn.toFixed(2)}, Net: $${netDeposited.toFixed(2)}`);

  return netDeposited;
}

/**
 * Get reliable deposited amount with fallback
 *
 * HYBRID APPROACH:
 * 1. Primary: Use blockchain calculation (getNetDepositedFromBlockchain)
 *    - Most accurate when transactions are correctly classified
 *    - Verifiable on-chain data
 *
 * 2. Fallback: Use depositTracker (getTotalDeposited)
 *    - Used when blockchain calculation gives suspicious results
 *    - Tracks deposits incrementally with proper withdrawal handling
 *
 * VALIDATION RULES (triggers fallback):
 * - Result is negative (impossible)
 * - Result > currentBalance + $1 buffer (deposited can't exceed balance, would cause negative earnings)
 * - Result is NaN or undefined
 *
 * KEY INSIGHT: If Deposited > Balance, then Earned = Balance - Deposited would be NEGATIVE
 * This should never happen, so we use a strict validation with only $1 buffer for timing.
 *
 * @param walletAddress - Smart wallet address
 * @param currentBalance - Current vault balance (for validation)
 * @param otherOwnedAddress - Optional EOA address to treat as internal
 * @returns Reliable deposited amount
 */
export async function getReliableDeposited(
  walletAddress: string,
  currentBalance: number,
  otherOwnedAddress?: string
): Promise<{ value: number; source: 'blockchain' | 'tracker' }> {
  // Try blockchain calculation first (primary source)
  const blockchainDeposited = await getNetDepositedFromBlockchain(walletAddress, otherOwnedAddress);

  // Also get tracker value for comparison/debugging
  const trackerDeposited = await getTotalDeposited(walletAddress);

  debugLog(`[getReliableDeposited] Blockchain: $${blockchainDeposited.toFixed(2)}, Tracker: $${trackerDeposited.toFixed(2)}, Balance: $${currentBalance.toFixed(2)}`);

  // Validation checks for blockchain value
  const isNegative = blockchainDeposited < 0;
  const isNaNValue = Number.isNaN(blockchainDeposited);

  // STRICT CHECK: Deposited should NEVER exceed current balance
  // If it does, Earned would be negative which is impossible
  // Allow only $1 buffer for timing discrepancies (e.g., just deposited, yield not accrued yet)
  const BALANCE_BUFFER = 1.0; // $1 buffer
  const maxReasonableDeposited = currentBalance > 0 ? currentBalance + BALANCE_BUFFER : Infinity;
  const exceedsBalance = blockchainDeposited > maxReasonableDeposited;

  // Check if tracker has meaningful data (> 0 means user has recorded deposits)
  // Tracker = 0 means either: (1) new user with no data, or (2) user withdrew everything
  const trackerHasData = trackerDeposited > 0;

  // Only use tracker comparison if tracker HAS data
  // This prevents false fallbacks for new users where tracker = 0 but blockchain is correct
  const SIGNIFICANT_DIFF = Math.max(10, currentBalance * 0.10); // $10 or 10% of balance, whichever is larger
  const trackerDiffersSignificantly = trackerHasData && Math.abs(blockchainDeposited - trackerDeposited) > SIGNIFICANT_DIFF;

  // Trust tracker over blockchain when:
  // 1. Tracker is close to current balance (within $1)
  // 2. Blockchain is way off (less than 50% of balance)
  // This catches: balance=$360, tracker=$360, blockchain=$1.59 (stale blockchain after withdraw/deposit cycle)
  const trackerCloseToBalance = currentBalance > 0 && Math.abs(trackerDeposited - currentBalance) < BALANCE_BUFFER;
  const blockchainWayOff = currentBalance > 0 && blockchainDeposited < currentBalance * 0.5;
  const trackerMoreReliable = trackerHasData && trackerCloseToBalance && blockchainWayOff;

  // Blockchain is invalid if fundamentally broken OR tracker clearly has better data
  const blockchainFundamentallyBroken = isNegative || isNaNValue || exceedsBalance;
  const shouldUseTracker = blockchainFundamentallyBroken || trackerDiffersSignificantly || trackerMoreReliable;

  if (shouldUseTracker) {
    // Log why we're considering fallback
    debugLog(`[getReliableDeposited] Considering tracker fallback:`);
    debugLog(`  - Blockchain negative: ${isNegative}`);
    debugLog(`  - Blockchain NaN: ${isNaNValue}`);
    debugLog(`  - Blockchain exceeds balance: ${exceedsBalance} ($${blockchainDeposited.toFixed(2)} > $${maxReasonableDeposited.toFixed(2)})`);
    debugLog(`  - Tracker has data: ${trackerHasData}`);
    debugLog(`  - Tracker differs significantly: ${trackerDiffersSignificantly} (diff: $${Math.abs(blockchainDeposited - trackerDeposited).toFixed(2)})`);
    debugLog(`  - Tracker more reliable: ${trackerMoreReliable}`);

    // IMPORTANT: If tracker = 0 (no data) and blockchain is NOT fundamentally broken,
    // use blockchain value instead of falling back to 0
    if (!trackerHasData && !blockchainFundamentallyBroken) {
      debugLog(`[getReliableDeposited] Tracker has no data (0), using blockchain: $${blockchainDeposited.toFixed(2)}`);
      return { value: blockchainDeposited, source: 'blockchain' };
    }

    // Validate tracker result
    if (trackerDeposited < 0 || Number.isNaN(trackerDeposited)) {
      debugLog(`[getReliableDeposited] Tracker value invalid ($${trackerDeposited}). Using balance as deposited.`);
      return { value: currentBalance, source: 'tracker' };
    }

    // Cap tracker value to current balance to prevent negative earnings
    const finalValue = currentBalance > 0 ? Math.min(trackerDeposited, currentBalance) : trackerDeposited;

    debugLog(`[getReliableDeposited] Using tracker fallback: $${finalValue.toFixed(2)} (raw tracker: $${trackerDeposited.toFixed(2)})`);
    return { value: finalValue, source: 'tracker' };
  }

  debugLog(`[getReliableDeposited] Using blockchain value: $${blockchainDeposited.toFixed(2)}`);
  return { value: blockchainDeposited, source: 'blockchain' };
}

/**
 * Get REALIZED earnings directly from fee transactions
 *
 * This is the MOST RELIABLE way to calculate earnings because:
 * - It's based on actual fee transactions (verifiable on-chain)
 * - Fee = 15% of yield, so: grossYield = fees / 0.15
 * - realizedEarnings = grossYield - fees = grossYield * 0.85
 *
 * NOTE: This only counts REALIZED earnings (yield that was withdrawn).
 * Unrealized yield (still in vault) is NOT included.
 *
 * @param walletAddress - Smart wallet address
 * @param otherOwnedAddress - Optional EOA address to treat as internal
 * @returns Realized earnings breakdown
 */
export async function getRealizedEarnings(
  walletAddress: string,
  otherOwnedAddress?: string
): Promise<{
  totalFees: number;
  grossYield: number;
  realizedEarnings: number;
}> {
  // Get cached transactions or fetch fresh
  let transactions = await getCachedTransactions(walletAddress);

  if (!transactions) {
    const fetchResult = await fetchRawTransactions(walletAddress, otherOwnedAddress);
    transactions = fetchResult.transactions;
    await saveToCache(walletAddress, transactions);
  }

  // Match fees to withdrawals for accurate calculation
  transactions = matchFeesToWithdrawals(transactions);

  // Sum all fee transactions
  let totalFees = 0;
  for (const tx of transactions) {
    if (tx.type === 'fee') {
      totalFees += tx.amount;
    }
  }

  // Calculate yield from fees (Fee = 15% of gross yield)
  const grossYield = totalFees > 0 ? totalFees / PLATFORM_FEE_RATE : 0;
  const realizedEarnings = grossYield - totalFees; // Net after fees (85% of gross)

  debugLog(`[getRealizedEarnings] Fees: $${totalFees.toFixed(2)}, Gross: $${grossYield.toFixed(2)}, Net: $${realizedEarnings.toFixed(2)}`);

  return {
    totalFees,
    grossYield,
    realizedEarnings,
  };
}

/**
 * Get TOTAL earnings (realized + unrealized)
 *
 * Total = Realized (withdrawn yield) + Unrealized (still in vault)
 *
 * - Realized: Calculated from fees (reliable, verifiable)
 * - Unrealized: currentBalance - netDeposited (less reliable)
 *
 * For display, we prioritize showing the reliable realized portion.
 *
 * @param walletAddress - Smart wallet address
 * @param currentBalance - Current vault balance
 * @param otherOwnedAddress - Optional EOA address to treat as internal
 */
export async function getTotalEarnings(
  walletAddress: string,
  currentBalance: number,
  otherOwnedAddress?: string
): Promise<{
  realized: number;
  unrealized: number;
  total: number;
  source: 'fees' | 'estimated';
}> {
  // Get realized earnings (reliable - from fees)
  const { realizedEarnings } = await getRealizedEarnings(walletAddress, otherOwnedAddress);

  // Get deposited amount for unrealized calculation
  const { value: deposited } = await getReliableDeposited(walletAddress, currentBalance, otherOwnedAddress);

  // Unrealized = current balance - what was deposited (could still be inaccurate)
  // Only positive unrealized makes sense
  const unrealized = Math.max(0, currentBalance - deposited);

  // Total earnings
  const total = realizedEarnings + unrealized;

  debugLog(`[getTotalEarnings] Realized: $${realizedEarnings.toFixed(2)}, Unrealized: $${unrealized.toFixed(2)}, Total: $${total.toFixed(2)}`);

  return {
    realized: realizedEarnings,
    unrealized,
    total,
    source: realizedEarnings > 0 ? 'fees' : 'estimated',
  };
}

/**
 * Date range preset type
 */
export type DateRangePresetType = 'this_year' | 'last_year' | 'all_time' | 'ytd' | 'custom';

/**
 * Get date range presets
 * For 'custom' preset, pass customRange parameter
 */
export function getDateRangePreset(
  preset: DateRangePresetType,
  customRange?: { from: Date; to: Date }
): { from: Date; to: Date } {
  const now = new Date();
  const currentYear = now.getFullYear();

  switch (preset) {
    case 'this_year':
      return {
        from: new Date(currentYear, 0, 1), // Jan 1 of current year
        to: now,
      };
    case 'last_year':
      return {
        from: new Date(currentYear - 1, 0, 1), // Jan 1 of last year
        to: new Date(currentYear - 1, 11, 31, 23, 59, 59), // Dec 31 of last year
      };
    case 'ytd':
      return {
        from: new Date(currentYear, 0, 1),
        to: now,
      };
    case 'custom':
      if (customRange) {
        return {
          from: customRange.from,
          to: customRange.to,
        };
      }
      // Fallback to all time if no custom range provided
      return {
        from: new Date(2024, 0, 1),
        to: now,
      };
    case 'all_time':
    default:
      return {
        from: new Date(2024, 0, 1), // Base chain started 2023, Morpho later
        to: now,
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM DATE RANGE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

const CUSTOM_DATE_RANGE_KEY = 'custom_date_range';

interface SavedCustomDateRange {
  from: string; // ISO date string
  to: string; // ISO date string
}

/**
 * Save custom date range to AsyncStorage
 */
export async function saveCustomDateRange(from: Date, to: Date): Promise<void> {
  try {
    const data: SavedCustomDateRange = {
      from: from.toISOString(),
      to: to.toISOString(),
    };
    await AsyncStorage.setItem(CUSTOM_DATE_RANGE_KEY, JSON.stringify(data));
    debugLog('[TransactionHistory] Custom date range saved');
  } catch (error) {
    console.error('[TransactionHistory] Error saving custom date range:', error);
  }
}

/**
 * Load custom date range from AsyncStorage
 */
export async function loadCustomDateRange(): Promise<{ from: Date; to: Date } | null> {
  try {
    const data = await AsyncStorage.getItem(CUSTOM_DATE_RANGE_KEY);
    if (!data) return null;

    const parsed: SavedCustomDateRange = JSON.parse(data);
    return {
      from: new Date(parsed.from),
      to: new Date(parsed.to),
    };
  } catch (error) {
    console.error('[TransactionHistory] Error loading custom date range:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get cache key for a wallet address
 */
function getCacheKey(walletAddress: string): string {
  return `${CACHE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
}

/**
 * Get cached transactions for a wallet
 * Returns null if cache is expired or doesn't exist
 */
export async function getCachedTransactions(
  walletAddress: string
): Promise<Transaction[] | null> {
  try {
    const cacheKey = getCacheKey(walletAddress);
    const cached = await AsyncStorage.getItem(cacheKey);

    if (!cached) {
      debugLog('[TransactionHistory] No cache found');
      return null;
    }

    const data: CachedTransactionData = JSON.parse(cached);

    // Check if cache is expired
    const age = Date.now() - data.timestamp;
    if (age > CACHE_TTL_MS) {
      debugLog('[TransactionHistory] Cache expired (age:', Math.round(age / 1000), 's)');
      return null;
    }

    debugLog('[TransactionHistory] Using cached data (age:', Math.round(age / 1000), 's)');

    // Restore Date objects (JSON.parse converts them to strings)
    return data.transactions.map(tx => ({
      ...tx,
      timestamp: new Date(tx.timestamp),
    }));
  } catch (error) {
    console.error('[TransactionHistory] Error reading cache:', error);
    return null;
  }
}

/**
 * Save transactions to cache
 */
async function saveToCache(
  walletAddress: string,
  transactions: Transaction[]
): Promise<void> {
  try {
    const cacheKey = getCacheKey(walletAddress);
    const data: CachedTransactionData = {
      transactions,
      timestamp: Date.now(),
      walletAddress: walletAddress.toLowerCase(),
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    debugLog('[TransactionHistory] Saved', transactions.length, 'transactions to cache');
  } catch (error) {
    console.error('[TransactionHistory] Error saving cache:', error);
  }
}

/**
 * Clear transaction cache for a wallet
 */
export async function clearTransactionCache(walletAddress: string): Promise<void> {
  try {
    const cacheKey = getCacheKey(walletAddress);
    await AsyncStorage.removeItem(cacheKey);
    debugLog('[TransactionHistory] Cache cleared');
  } catch (error) {
    console.error('[TransactionHistory] Error clearing cache:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEE MATCHING LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Match fee transactions to their associated withdrawals
 *
 * Fees are only valid if they're part of a withdrawal operation:
 * 1. User withdraws from vault → USDC comes to wallet
 * 2. Fee (15% of earnings) is sent to treasury
 * 3. These happen in the same tx or within a few seconds
 *
 * This function:
 * - Finds 'withdraw' and 'fee' transactions
 * - Matches fees to withdrawals by txHash or timestamp proximity
 * - Sets associatedFee on matched withdrawals
 * - Logs warnings for unmatched fees
 */
function matchFeesToWithdrawals(transactions: Transaction[]): Transaction[] {
  const withdrawals = transactions.filter(tx => tx.type === 'withdraw');
  const fees = transactions.filter(tx => tx.type === 'fee');
  const matchedFeeIds = new Set<string>();

  // Time window for matching (5 minutes)
  const TIME_WINDOW_MS = 5 * 60 * 1000;

  for (const withdrawal of withdrawals) {
    // First, try to find a fee with the same txHash
    let matchedFee = fees.find(
      fee => fee.txHash === withdrawal.txHash && !matchedFeeIds.has(fee.id)
    );

    // If no exact match, look for a fee within the time window
    if (!matchedFee) {
      for (const fee of fees) {
        if (matchedFeeIds.has(fee.id)) continue;
        const timeDiff = Math.abs(fee.timestamp.getTime() - withdrawal.timestamp.getTime());
        if (timeDiff <= TIME_WINDOW_MS) {
          matchedFee = fee;
          break;
        }
      }
    }

    if (matchedFee) {
      withdrawal.associatedFee = {
        amount: matchedFee.amount,
        txHash: matchedFee.txHash,
      };
      matchedFeeIds.add(matchedFee.id);
    }
  }

  // Reclassify unmatched fees as 'send' - they're not platform fees, just regular sends to treasury
  const unmatchedFees = fees.filter(fee => !matchedFeeIds.has(fee.id));
  unmatchedFees.forEach(fee => {
    (fee as { type: string }).type = 'send';
  });

  // Log summary
  const matchedFees = fees.filter(fee => matchedFeeIds.has(fee.id));
  const totalMatchedFees = matchedFees.reduce((sum, fee) => sum + fee.amount, 0);
  debugLog(`[FeeMatching] Matched ${matchedFees.length} fees ($${totalMatchedFees.toFixed(2)}), reclassified ${unmatchedFees.length} as sends`);

  // Return all transactions (fees are still in the list but won't be counted in summary)
  return transactions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of fetching and parsing raw transactions
 */
interface FetchResult {
  transactions: Transaction[];
  rawTransferCount: number;
  skippedCount: number;
}

/**
 * Fetch raw transactions from BaseScan (internal use)
 * @param walletAddress - Primary wallet address to query (smart wallet)
 * @param otherOwnedAddress - Optional other owned address (EOA) to treat as internal
 */
async function fetchRawTransactions(
  walletAddress: string,
  otherOwnedAddress?: string
): Promise<FetchResult> {
  // Fetch USDC transfers (primary token for this app)
  const usdcTransfers = await fetchTokenTransfers(walletAddress, TOKENS.USDC);

  debugLog('[TransactionHistory] Found', usdcTransfers.length, 'USDC transfers from API');

  // Parse transfers into transactions
  const transactions: Transaction[] = [];
  for (let i = 0; i < usdcTransfers.length; i++) {
    const tx = parseTransfer(usdcTransfers[i], walletAddress, 6, i, otherOwnedAddress);
    if (tx) {
      transactions.push(tx);
    }
  }

  // Match fees to withdrawals (fees are only valid when associated with a withdrawal)
  const transactionsWithFees = matchFeesToWithdrawals(transactions);

  const rawTransferCount = usdcTransfers.length;
  const skippedCount = rawTransferCount - transactionsWithFees.length;

  debugLog(`[TransactionHistory] Classified ${transactionsWithFees.length}, skipped ${skippedCount}`);

  return {
    transactions: transactionsWithFees,
    rawTransferCount,
    skippedCount,
  };
}

/**
 * Build transaction history result from blockchain transactions
 * All calculations are from on-chain data only - no backend dependency
 */
function buildHistoryResult(
  walletAddress: string,
  transactions: Transaction[],
  dateRange: { from: Date; to: Date },
  currentBalance: number,
  rawTransferCount: number = 0,
  skippedCount: number = 0
): TransactionHistoryResult {
  // Filter by date range
  const filteredTransactions = filterByDateRange(transactions, dateRange.from, dateRange.to);

  // Sort chronologically
  filteredTransactions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Calculate running balances
  const transactionsWithBalances = calculateBalances(filteredTransactions, currentBalance);

  // Calculate summary from blockchain data only (with sanity checks)
  const summary = calculateSummary(transactionsWithBalances, currentBalance, rawTransferCount, skippedCount);

  return {
    transactions: transactionsWithBalances,
    summary,
    dateRange,
    walletAddress,
  };
}

/**
 * Fetch complete transaction history for a wallet
 * @param walletAddress - Primary wallet address (smart wallet)
 * @param dateRange - Date range to filter transactions
 * @param currentBalance - Current balance for calculations
 * @param forceRefresh - If true, bypasses cache and fetches fresh data
 * @param otherOwnedAddress - Optional EOA address to treat as internal (not external send/receive)
 */
export async function fetchTransactionHistory(
  walletAddress: string,
  dateRange: { from: Date; to: Date },
  currentBalance: number = 0,
  forceRefresh: boolean = false,
  otherOwnedAddress?: string
): Promise<TransactionHistoryResult> {
  debugLog('[TransactionHistory] Fetching for:', walletAddress, 'forceRefresh:', forceRefresh);

  // Validate wallet address early
  if (!walletAddress || walletAddress.length < 10) {
    console.error('[TransactionHistory] Invalid wallet address provided');
    return buildHistoryResult(walletAddress || '', [], dateRange, currentBalance, 0, 0);
  }

  if (!forceRefresh) {
    // Try to get from cache first
    const cached = await getCachedTransactions(walletAddress);
    if (cached) {
      // Cached data doesn't have raw counts, will be populated on next fresh fetch
      return buildHistoryResult(walletAddress, cached, dateRange, currentBalance, 0, 0);
    }
  }

  // Fetch fresh data from API (pass EOA to filter internal transfers)
  const fetchResult = await fetchRawTransactions(walletAddress, otherOwnedAddress);

  // Save to cache for next time
  await saveToCache(walletAddress, fetchResult.transactions);

  return buildHistoryResult(
    walletAddress,
    fetchResult.transactions,
    dateRange,
    currentBalance,
    fetchResult.rawTransferCount,
    fetchResult.skippedCount
  );
}

/**
 * Get cached data immediately, then fetch fresh in background
 * Returns cached data first (if available), then calls onFreshData when new data arrives
 * @param otherOwnedAddress - Optional EOA address to treat as internal (not external send/receive)
 */
export async function fetchTransactionHistoryWithCache(
  walletAddress: string,
  dateRange: { from: Date; to: Date },
  currentBalance: number,
  onFreshData: (result: TransactionHistoryResult) => void,
  otherOwnedAddress?: string
): Promise<TransactionHistoryResult | null> {
  debugLog('[TransactionHistory] Fetching with cache strategy');

  // Try to return cached data immediately
  const cached = await getCachedTransactions(walletAddress);
  let cachedResult: TransactionHistoryResult | null = null;

  if (cached) {
    // Cached data doesn't have raw counts, will be populated on next fresh fetch
    cachedResult = buildHistoryResult(walletAddress, cached, dateRange, currentBalance, 0, 0);
    debugLog('[TransactionHistory] Returning cached result immediately');
  }

  // Fetch fresh data in background (pass EOA to filter internal transfers)
  fetchRawTransactions(walletAddress, otherOwnedAddress).then(async (fetchResult) => {
    await saveToCache(walletAddress, fetchResult.transactions);
    const freshResult = buildHistoryResult(
      walletAddress,
      fetchResult.transactions,
      dateRange,
      currentBalance,
      fetchResult.rawTransferCount,
      fetchResult.skippedCount
    );
    debugLog('[TransactionHistory] Fresh data ready, calling callback');
    onFreshData(freshResult);
  }).catch((error) => {
    console.error('[TransactionHistory] Background fetch failed:', error);
  });

  return cachedResult;
}


/**
 * Get transaction type label
 *
 * User-friendly labels:
 * - receive: "Receive" (got USDC from outside)
 * - send: "Send" (sent USDC out)
 * - deposit: "Add to Savings" (moved to savings/yield)
 * - withdraw: "Withdraw from Savings" (took from savings)
 * - fee: "Fee" (platform fee to treasury)
 */
export function getTransactionTypeLabel(type: TransactionType): string {
  switch (type) {
    case 'receive':
      return 'Receive';
    case 'send':
      return 'Send';
    case 'deposit':
      return 'Add to Savings';
    case 'withdraw':
      return 'Withdraw from Savings';
    case 'fee':
      return 'Fee';
    default:
      return 'Unknown';
  }
}

/**
 * Get transaction type color
 */
export function getTransactionTypeColor(type: TransactionType): string {
  switch (type) {
    case 'receive':
      return '#22c55e'; // green - money coming in
    case 'send':
      return '#ef4444'; // red - money going out
    case 'deposit':
      return '#6366f1'; // purple - adding to savings
    case 'withdraw':
      return '#f59e0b'; // amber - withdrawing from savings
    case 'fee':
      return '#f97316'; // orange - platform fee
    default:
      return '#71717a'; // gray
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTION GROUPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Group vault transactions that happen at the same time
 *
 * When user deposits, we split across 3 vaults in a single transaction.
 * This groups them into one display item with expandable details.
 *
 * @param transactions - Array of transactions to group
 * @returns Array of display items (singles + grouped), sorted by date descending
 */
export function groupTransactionsForDisplay(
  transactions: Transaction[]
): TransactionDisplayItem[] {
  if (!transactions || transactions.length === 0) return [];

  // Sort by timestamp descending (most recent first)
  const sorted = [...transactions].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  const displayItems: TransactionDisplayItem[] = [];
  const processedIds = new Set<string>();

  for (const tx of sorted) {
    // Skip if already processed as part of a group
    if (processedIds.has(tx.id)) continue;

    // Only group deposit/withdraw vault transactions
    if (tx.type !== 'deposit' && tx.type !== 'withdraw') {
      displayItems.push({ ...tx, isGrouped: false });
      processedIds.add(tx.id);
      continue;
    }

    // Find other vault transactions with the same timestamp (within 5 seconds)
    const sameTimeVaultTxs = sorted.filter(
      other =>
        !processedIds.has(other.id) &&
        other.type === tx.type &&
        other.vaultName && // Must be a vault transaction
        Math.abs(other.timestamp.getTime() - tx.timestamp.getTime()) <= 5000
    );

    if (sameTimeVaultTxs.length > 1) {
      // Group these transactions
      const totalAmount = sameTimeVaultTxs.reduce((sum, t) => sum + t.amount, 0);

      const grouped: GroupedTransaction = {
        id: `group-${tx.timestamp.getTime()}-${tx.type}`,
        type: tx.type as 'deposit' | 'withdraw',
        totalAmount,
        timestamp: tx.timestamp,
        transactions: sameTimeVaultTxs,
        isGrouped: true,
      };

      displayItems.push(grouped);

      // Mark all grouped transactions as processed
      sameTimeVaultTxs.forEach(t => processedIds.add(t.id));
    } else {
      // Single vault transaction - don't group
      displayItems.push({ ...tx, isGrouped: false });
      processedIds.add(tx.id);
    }
  }

  return displayItems;
}

/**
 * Get label for grouped transaction
 */
export function getGroupedTransactionLabel(type: 'deposit' | 'withdraw'): string {
  return type === 'deposit' ? 'Add to Savings' : 'Withdraw from Savings';
}

/**
 * Count user-initiated savings actions
 *
 * This counts "Add to Savings" as a single action even if internally
 * the funds are allocated across multiple vaults.
 *
 * For example: User adds $100 → allocated to 3 vaults = 1 action (not 3)
 *
 * Uses the same grouping logic as the transaction display.
 */
export function countUserSavingsActions(transactions: Transaction[]): { addToSavingsCount: number; withdrawCount: number } {
  const displayItems = groupTransactionsForDisplay(transactions);

  let addToSavingsCount = 0;
  let withdrawCount = 0;

  for (const item of displayItems) {
    if ('type' in item) {
      if (item.type === 'deposit') {
        addToSavingsCount++;
      } else if (item.type === 'withdraw') {
        withdrawCount++;
      }
    }
  }

  return { addToSavingsCount, withdrawCount };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADDRESS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// Known exchange/service addresses on Base
const KNOWN_ADDRESSES: Record<string, string> = {
  // Coinbase hot wallets on Base (common patterns)
  '0x6269c30f': 'Coinbase',
  '0x40ebc1ac': 'Coinbase',
  '0xd4e76fab': 'Coinbase',
  '0x3154cf16': 'Coinbase',
  '0x9858e47b': 'Coinbase',
  '0xa9d1e08c': 'Coinbase',
};

// shortenAddress and shortenTxHash moved to utils/formatting.ts

/**
 * Get a friendly name for an address if known, otherwise return shortened address
 */
export function getAddressLabel(address: string): string {
  if (!address) return 'Unknown';
  const lowerAddr = address.toLowerCase();

  // Check known addresses by prefix
  for (const [prefix, name] of Object.entries(KNOWN_ADDRESSES)) {
    if (lowerAddr.startsWith(prefix)) {
      return name;
    }
  }

  return _shortenAddress(address);
}

/**
 * Check if an address is a known exchange/service
 */
export function isKnownAddress(address: string): boolean {
  if (!address) return false;
  const lowerAddr = address.toLowerCase();
  return Object.keys(KNOWN_ADDRESSES).some(prefix => lowerAddr.startsWith(prefix));
}

/**
 * Get BaseScan URL for a transaction
 */
export function getBaseScanTxUrl(txHash: string): string {
  return `https://basescan.org/tx/${txHash}`;
}

/**
 * Get BaseScan URL for an address
 */
export function getBaseScanAddressUrl(address: string): string {
  return `https://basescan.org/address/${address}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINE-BY-LINE AUDIT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run a line-by-line audit trail like a bank statement
 *
 * This function processes each transaction chronologically and tracks:
 * - Wallet balance (USDC in wallet)
 * - Vault position (USDC in Morpho vaults)
 * - Realized yield (actual yield extracted from vaults)
 *
 * The goal is to verify the REALIZED earnings calculation by showing
 * how each withdrawal extracts proportional yield based on the fee paid.
 *
 * Fee = 15% of gross yield → gross yield = fee / 0.15
 * Realized = gross yield - fee (what user keeps after fees)
 */
function runLineByLineAudit(transactions: Transaction[], totalFees: number): void {
  // Only run in development mode
  if (!__DEV__) return;

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('                       LINE-BY-LINE AUDIT TRAIL                                ');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Sort transactions chronologically (oldest first)
  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Running totals
  let walletBalance = 0;
  let vaultPosition = 0;
  let totalDeposited = 0; // Cumulative deposits to vaults
  let totalWithdrawn = 0; // Cumulative withdrawals from vaults (principal + yield)
  let accumulatedRealizedYield = 0; // Sum of yield portions from withdrawals
  let accumulatedFees = 0; // Sum of fees paid

  console.log('Processing', sorted.length, 'transactions chronologically:\n');
  console.log('─'.repeat(100));
  console.log(
    'Line'.padEnd(6) +
    'Date'.padEnd(12) +
    'Type'.padEnd(10) +
    'Amount'.padEnd(14) +
    'Wallet'.padEnd(14) +
    'Vault'.padEnd(14) +
    'Realized'.padEnd(14) +
    'Notes'
  );
  console.log('─'.repeat(100));

  sorted.forEach((tx, index) => {
    const lineNum = index + 1;
    const date = tx.timestamp.toISOString().split('T')[0];
    const type = tx.type.toUpperCase();
    let notes = '';

    // Process based on transaction type
    switch (tx.type) {
      case 'receive':
        // Money coming into wallet from external source
        walletBalance += tx.amount;
        notes = 'External receive';
        break;

      case 'send':
        // Money leaving wallet to external address
        walletBalance -= tx.amount;
        notes = 'External send';
        break;

      case 'deposit':
        // Move money from wallet to vault
        walletBalance -= tx.amount;
        vaultPosition += tx.amount;
        totalDeposited += tx.amount;
        notes = tx.vaultName ? `→ ${tx.vaultName.slice(0, 20)}` : '→ Vault';
        break;

      case 'withdraw':
        // Money coming from vault to wallet
        // Withdrawal contains: principal portion + yield portion
        walletBalance += tx.amount;
        vaultPosition -= tx.amount;
        totalWithdrawn += tx.amount;

        // If this withdrawal has an associated fee, calculate the yield portion
        if (tx.associatedFee) {
          const feeAmount = tx.associatedFee.amount;
          // Fee = 15% of gross yield → gross yield = fee / 0.15
          const grossYield = feeAmount / 0.15;
          const netYield = grossYield - feeAmount; // What user keeps
          accumulatedRealizedYield += netYield;
          accumulatedFees += feeAmount;
          notes = `Yield: +$${netYield.toFixed(2)} (fee: $${feeAmount.toFixed(2)})`;
        } else {
          // Withdrawal without fee - could be pure principal or unreported
          notes = 'No fee (principal only?)';
        }
        break;

      case 'fee':
        // Fee going to treasury (already counted via associatedFee on withdrawals)
        walletBalance -= tx.amount;
        notes = '→ Treasury';
        break;
    }

    // Format the line
    const amountStr = (tx.type === 'receive' || tx.type === 'withdraw' ? '+' : '-') +
                      '$' + tx.amount.toFixed(2);
    const walletStr = '$' + walletBalance.toFixed(2);
    const vaultStr = '$' + vaultPosition.toFixed(2);
    const realizedStr = '$' + accumulatedRealizedYield.toFixed(2);

    console.log(
      `[${lineNum}]`.padEnd(6) +
      date.padEnd(12) +
      type.padEnd(10) +
      amountStr.padEnd(14) +
      walletStr.padEnd(14) +
      vaultStr.padEnd(14) +
      realizedStr.padEnd(14) +
      notes
    );
  });

  console.log('─'.repeat(100));

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('                              AUDIT SUMMARY                                     ');
  console.log('═══════════════════════════════════════════════════════════════════════════════');

  console.log('\n📊 Vault Operations:');
  console.log(`   Total deposited to vaults:    $${totalDeposited.toFixed(2)}`);
  console.log(`   Total withdrawn from vaults:  $${totalWithdrawn.toFixed(2)}`);
  console.log(`   Net vault position:           $${vaultPosition.toFixed(2)}`);

  console.log('\n💰 Realized Earnings Calculation:');
  console.log(`   Accumulated fees paid:        $${accumulatedFees.toFixed(2)}`);
  console.log(`   Gross yield (fees / 0.15):    $${(accumulatedFees / 0.15).toFixed(2)}`);
  console.log(`   Net realized yield:           $${accumulatedRealizedYield.toFixed(2)}`);

  // Calculate expected realized using the formula from the summary
  const expectedRealizedFromFees = totalFees > 0 ? (totalFees / 0.15) - totalFees : 0;

  console.log('\n🔍 Verification:');
  console.log(`   Realized from audit:          $${accumulatedRealizedYield.toFixed(2)}`);
  console.log(`   Expected (totalFees formula): $${expectedRealizedFromFees.toFixed(2)}`);

  const diff = Math.abs(accumulatedRealizedYield - expectedRealizedFromFees);
  if (diff < 0.01) {
    console.log(`   ✅ MATCH - Audit trail matches formula calculation`);
  } else {
    console.log(`   ⚠️ DIFFERENCE: $${diff.toFixed(2)}`);
    console.log(`   This may be due to unmatched fees or rounding`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════\n');
}
