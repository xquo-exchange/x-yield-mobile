/**
 * Strategy Execution Service
 * Builds and executes deposit and withdraw transactions for DeFi strategies
 */

import { type Address, encodeFunctionData, parseUnits, maxUint256 } from 'viem';
import { Strategy, MORPHO_VAULT_ABI } from '../constants/strategies';
import {
  ERC20_ABI,
  BASE_RPC_URL,
  BASE_RPC_FALLBACK,
  TOKENS,
  XYIELD_FEE_PERCENT,
  XYIELD_TREASURY_ADDRESS,
  XYIELD_MIN_FEE_USDC,
} from '../constants/contracts';
import { type VaultPosition } from './blockchain';

export interface TransactionCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

export interface AllocationBreakdown {
  vault: {
    id: string;
    name: string;
    address: string;
    apy: number;
  };
  amount: string;
  amountRaw: bigint;
  percentage: number;
}

export interface StrategyBatch {
  calls: TransactionCall[];
  allocations: AllocationBreakdown[];
  totalAmount: string;
}

export interface WithdrawBatch {
  calls: TransactionCall[];
  positions: VaultPosition[];
  // Value breakdown
  totalDeposited: string;
  currentValue: string;
  yieldAmount: string;
  yieldPercent: string;
  // Fee breakdown (15% of yield only)
  feeAmount: string;
  feeAmountRaw: bigint;
  userReceives: string;
  feePercent: number;
  hasProfits: boolean;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function hexToBigInt(hex: string): bigint {
  if (!hex || hex === '0x' || hex === '0x0') return BigInt(0);
  try {
    return BigInt(hex);
  } catch {
    return BigInt(0);
  }
}

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const rpcs = [BASE_RPC_URL, BASE_RPC_FALLBACK];

  for (let attempt = 0; attempt < 3; attempt++) {
    const rpcUrl = rpcs[Math.min(attempt, rpcs.length - 1)];

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });

      const data = await response.json();

      if (data.error) {
        if (attempt < 2) {
          await delay(1000);
          continue;
        }
        throw new Error(data.error.message);
      }

      return data.result;
    } catch (error) {
      if (attempt < 2) {
        await delay(1000);
        continue;
      }
      throw error;
    }
  }
}

interface TransactionReceipt {
  status: string;
  blockNumber: string;
  gasUsed: string;
}

/**
 * Simulate a transaction using eth_call
 * This validates the transaction would succeed before submitting to the bundler
 * Saves gas credits and provides faster feedback on errors
 */
async function simulateTransaction(
  call: TransactionCall,
  fromAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await rpcCall('eth_call', [
      {
        from: fromAddress,
        to: call.to,
        data: call.data,
        value: call.value ? `0x${call.value.toString(16)}` : '0x0',
      },
      'latest',
    ]);
    return { success: true };
  } catch (error) {
    const msg = (error as Error)?.message || 'Unknown error';

    // Parse common revert reasons
    if (msg.includes('insufficient allowance')) {
      return { success: false, error: 'Insufficient token allowance. Approve needed first.' };
    }
    if (msg.includes('insufficient balance') || msg.includes('transfer amount exceeds balance')) {
      return { success: false, error: 'Insufficient token balance for this deposit.' };
    }
    if (msg.includes('execution reverted')) {
      return { success: false, error: 'Transaction would revert. Check your balance and allowances.' };
    }

    // For other errors, return the raw message (truncated)
    return { success: false, error: msg.length > 80 ? msg.substring(0, 80) + '...' : msg };
  }
}

/**
 * Simulate all transactions in a batch
 * Returns on first failure for fast feedback
 */
async function simulateBatch(
  calls: TransactionCall[],
  fromAddress: string
): Promise<{ success: boolean; error?: string; failedIndex?: number }> {
  for (let i = 0; i < calls.length; i++) {
    const result = await simulateTransaction(calls[i], fromAddress);
    if (!result.success) {
      return {
        success: false,
        error: `Call ${i + 1}/${calls.length} would fail: ${result.error}`,
        failedIndex: i
      };
    }
  }
  return { success: true };
}

async function waitForTransaction(
  txHash: string,
  maxWaitMs = 60000,
  pollIntervalMs = 3000
): Promise<{ found: boolean; status: string; blockNumber: string | null }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const tx = await rpcCall('eth_getTransactionByHash', [txHash]);
      if (!tx) {
        await delay(pollIntervalMs);
        continue;
      }

      const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]) as TransactionReceipt | null;
      if (!receipt) {
        await delay(pollIntervalMs);
        continue;
      }

      const status = receipt.status === '0x1' ? 'success' : 'failed';
      const blockNumber = hexToBigInt(receipt.blockNumber).toString();

      return { found: true, status, blockNumber };
    } catch {
      await delay(pollIntervalMs);
    }
  }

  return { found: false, status: 'timeout', blockNumber: null };
}

function buildApproveCall(tokenAddress: Address, spenderAddress: Address): TransactionCall {
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress, maxUint256],
  });

  return {
    to: tokenAddress as `0x${string}`,
    data: data as `0x${string}`,
  };
}

function buildVaultDepositCall(
  vaultAddress: Address,
  amount: bigint,
  receiver: Address
): TransactionCall {
  const data = encodeFunctionData({
    abi: MORPHO_VAULT_ABI,
    functionName: 'deposit',
    args: [amount, receiver],
  });

  return {
    to: vaultAddress as `0x${string}`,
    data: data as `0x${string}`,
  };
}

/**
 * Build a redeem call for withdrawing shares from a vault
 * Uses ERC-4626 redeem(shares, receiver, owner)
 */
function buildVaultRedeemCall(
  vaultAddress: Address,
  shares: bigint,
  receiver: Address,
  owner: Address
): TransactionCall {
  const data = encodeFunctionData({
    abi: MORPHO_VAULT_ABI,
    functionName: 'redeem',
    args: [shares, receiver, owner],
  });

  return {
    to: vaultAddress as `0x${string}`,
    data: data as `0x${string}`,
  };
}

/**
 * Build a USDC transfer call for fee payment
 */
function buildTransferCall(
  tokenAddress: Address,
  recipient: Address,
  amount: bigint
): TransactionCall {
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipient, amount],
  });

  return {
    to: tokenAddress as `0x${string}`,
    data: data as `0x${string}`,
  };
}

/**
 * Build a batch of withdraw transactions for all positions
 * Includes X-Yield performance fee transfer (15% of YIELD only, not principal)
 *
 * Performance fee model:
 * - Fee is calculated on PROFIT only, not total withdrawal
 * - If user deposited $100 and it grew to $105, yield = $5
 * - Fee = 15% of $5 = $0.75 (not 15% of $105)
 * - If no profit (loss or break-even), no fee is charged
 */
export function buildWithdrawBatch(
  positions: VaultPosition[],
  walletAddress: Address,
  totalDeposited: number // Original deposit amount from deposit tracker
): WithdrawBatch {
  const calls: TransactionCall[] = [];
  const positionsWithBalance: VaultPosition[] = [];
  let totalAssets = BigInt(0); // Track total USDC (6 decimals)

  for (const position of positions) {
    // Only withdraw from vaults with positive balance
    if (position.shares > BigInt(0)) {
      calls.push(
        buildVaultRedeemCall(
          position.vaultAddress as Address,
          position.shares,
          walletAddress,
          walletAddress
        )
      );
      positionsWithBalance.push(position);
      totalAssets += position.assets; // assets is in USDC (6 decimals)
    }
  }

  // Convert to USD values (USDC has 6 decimals)
  const currentValue = Number(totalAssets) / 1_000_000;

  // SAFEGUARD: If totalDeposited is 0 but currentValue > 0, treat as principal
  if (totalDeposited === 0 && currentValue > 0) {
    return {
      calls,
      positions: positionsWithBalance,
      totalDeposited: currentValue.toFixed(2),
      currentValue: currentValue.toFixed(2),
      yieldAmount: '0.00',
      yieldPercent: '0.0',
      feeAmount: '0.00',
      feeAmountRaw: BigInt(0),
      userReceives: currentValue.toFixed(2),
      feePercent: XYIELD_FEE_PERCENT,
      hasProfits: false,
    };
  }

  // Calculate yield (profit)
  const yieldAmount = currentValue - totalDeposited;
  const hasProfits = yieldAmount > 0;
  const yieldPercent = totalDeposited > 0 ? (yieldAmount / totalDeposited) * 100 : 0;

  // Calculate performance fee (only on positive yield)
  let feeAmount = 0;
  let feeAmountRaw = BigInt(0);

  if (hasProfits) {
    feeAmount = yieldAmount * (XYIELD_FEE_PERCENT / 100);
    feeAmountRaw = BigInt(Math.floor(feeAmount * 1_000_000));
  }

  const userReceives = currentValue - feeAmount;

  // Add fee transfer call if fee is above minimum threshold
  if (feeAmount >= XYIELD_MIN_FEE_USDC) {
    calls.push(
      buildTransferCall(
        TOKENS.USDC as Address,
        XYIELD_TREASURY_ADDRESS as Address,
        feeAmountRaw
      )
    );
    console.log(`[Withdraw] Fee transfer added: $${feeAmount.toFixed(6)} (${feeAmountRaw} raw) to ${XYIELD_TREASURY_ADDRESS}`);
  } else if (hasProfits) {
    console.log(`[Withdraw] Fee skipped: $${feeAmount.toFixed(6)} below minimum $${XYIELD_MIN_FEE_USDC}`);
  } else {
    console.log(`[Withdraw] No fee: No profits`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FULL PRECISION DEBUG - Verify 15% fee calculation
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log('[Withdraw] ══════════════════════════════════════════════════════');
  console.log('[Withdraw] FULL PRECISION CALCULATION:');
  console.log('[Withdraw] totalDeposited:', totalDeposited.toFixed(6));
  console.log('[Withdraw] currentValue:', currentValue.toFixed(6));
  console.log('[Withdraw] yield:', yieldAmount.toFixed(6));
  console.log('[Withdraw] yieldPercent:', (yieldPercent).toFixed(6) + '%');
  console.log('[Withdraw] fee (15% of yield):', feeAmount.toFixed(6));
  console.log('[Withdraw] feeAmountRaw:', feeAmountRaw.toString(), 'raw USDC units');
  console.log('[Withdraw] userReceives:', userReceives.toFixed(6));
  console.log('[Withdraw] VERIFICATION: yield × 0.15 =', (yieldAmount * 0.15).toFixed(6));
  console.log('[Withdraw] VERIFICATION: currentValue - fee =', (currentValue - feeAmount).toFixed(6));
  console.log('[Withdraw] ══════════════════════════════════════════════════════');

  // Format ALL values with full USDC precision (6 decimals)
  // This allows accurate verification of fee calculations
  const formatValue = (val: number): string => {
    return val.toFixed(6);
  };

  return {
    calls,
    positions: positionsWithBalance,
    // Value breakdown
    totalDeposited: formatValue(totalDeposited),
    currentValue: formatValue(currentValue),
    yieldAmount: formatValue(yieldAmount),
    yieldPercent: yieldPercent.toFixed(1),
    // Fee breakdown
    feeAmount: formatValue(feeAmount),
    feeAmountRaw: feeAmount >= XYIELD_MIN_FEE_USDC ? feeAmountRaw : BigInt(0),
    userReceives: formatValue(userReceives),
    feePercent: XYIELD_FEE_PERCENT,
    hasProfits,
  };
}

/**
 * Execute a withdraw batch (redeem from all vaults)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeWithdrawBatch(
  client: any,
  batch: WithdrawBatch
): Promise<string> {
  if (!client?.account?.address) {
    throw new Error('Smart wallet not available. Please log in first.');
  }

  if (batch.calls.length === 0) {
    throw new Error('No positions to withdraw');
  }

  const walletAddress = client.account.address;
  console.log(`[Withdraw] Smart wallet: ${walletAddress}`);
  console.log(`[Withdraw] Positions to withdraw: ${batch.positions.length}`);

  // Log each position being withdrawn
  for (const pos of batch.positions) {
    console.log(`[Withdraw] - ${pos.vaultName}: ${pos.assetsFormatted} USDC`);
  }

  // Log yield breakdown
  console.log(`[Withdraw] Your deposits: $${batch.totalDeposited}`);
  console.log(`[Withdraw] Current value: $${batch.currentValue}`);
  console.log(`[Withdraw] Yield earned: $${batch.yieldAmount} (${batch.yieldPercent}%)`);

  // Log fee breakdown
  if (batch.hasProfits && parseFloat(batch.feeAmount) >= XYIELD_MIN_FEE_USDC) {
    console.log(`[Withdraw] Performance fee (${batch.feePercent}% of yield): $${batch.feeAmount}`);
  } else if (!batch.hasProfits) {
    console.log(`[Withdraw] No fee (no profits)`);
  }
  console.log(`[Withdraw] You receive: $${batch.userReceives}`);

  console.log(`[Withdraw] Sending ${batch.calls.length} calls (${batch.positions.length} redeems${parseFloat(batch.feeAmount) >= XYIELD_MIN_FEE_USDC ? ' + 1 fee transfer' : ''})...`);

  const MAX_RETRIES = 2;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[Withdraw] Retry attempt ${attempt + 1}/${MAX_RETRIES}...`);
        await delay(2000);
      }

      let hash: string;

      if (batch.calls.length === 1) {
        const call = batch.calls[0];
        hash = await client.sendTransaction({
          to: call.to,
          data: call.data,
          value: call.value || BigInt(0),
        });
      } else {
        hash = await client.sendTransaction({
          calls: batch.calls.map(c => ({
            to: c.to,
            data: c.data,
            value: c.value || BigInt(0),
          })),
        });
      }

      if (!hash || typeof hash !== 'string' || !hash.startsWith('0x')) {
        throw new Error('Transaction failed: Invalid response from wallet');
      }

      console.log(`[Withdraw] Transaction submitted! Hash: ${hash}`);
      console.log(`[Withdraw] View on BaseScan: https://basescan.org/tx/${hash}`);

      // Wait for confirmation
      console.log('[Withdraw] Waiting for on-chain confirmation...');
      const confirmation = await waitForTransaction(hash);

      if (!confirmation.found) {
        throw new Error('Transaction not confirmed. Check your Privy Dashboard for paymaster config.');
      }

      if (confirmation.status === 'failed') {
        throw new Error(`Transaction reverted. Check BaseScan: https://basescan.org/tx/${hash}`);
      }

      console.log(`[Withdraw] SUCCESS! Confirmed in block ${confirmation.blockNumber}`);
      return hash;

    } catch (error) {
      lastError = error;
      const msg = ((error as Error)?.message || '').toLowerCase();

      if (msg.includes('nonce') && attempt < MAX_RETRIES - 1) {
        console.log('[Withdraw] Nonce error, retrying...');
        continue;
      }
      break;
    }
  }

  throw new Error(parseErrorMessage(lastError));
}

export function calculateAllocations(
  strategy: Strategy,
  totalAmount: string
): AllocationBreakdown[] {
  const totalAmountRaw = parseUnits(totalAmount, strategy.assetDecimals);

  return strategy.allocations.map((allocation) => {
    const amountRaw = (totalAmountRaw * BigInt(allocation.percentage)) / BigInt(100);
    const amount = (parseFloat(totalAmount) * allocation.percentage / 100).toFixed(
      strategy.assetDecimals === 6 ? 2 : 6
    );

    return {
      vault: {
        id: allocation.vault.id,
        name: allocation.vault.name,
        address: allocation.vault.address,
        apy: allocation.vault.apy,
      },
      amount,
      amountRaw,
      percentage: allocation.percentage,
    };
  });
}

export function buildStrategyBatch(
  strategy: Strategy,
  amount: string,
  walletAddress: Address
): StrategyBatch {
  const calls: TransactionCall[] = [];
  const allocations = calculateAllocations(strategy, amount);
  const approvedVaults = new Set<string>();

  for (const allocation of allocations) {
    if (allocation.amountRaw <= BigInt(0)) continue;

    if (!approvedVaults.has(allocation.vault.address)) {
      approvedVaults.add(allocation.vault.address);
      calls.push(buildApproveCall(strategy.asset, allocation.vault.address as Address));
    }

    calls.push(
      buildVaultDepositCall(
        allocation.vault.address as Address,
        allocation.amountRaw,
        walletAddress
      )
    );
  }

  return { calls, allocations, totalAmount: amount };
}

/**
 * Check if an error is a nonce-related error
 */
function isNonceError(error: unknown): boolean {
  const msg = ((error as Error)?.message || '').toLowerCase();
  return (
    msg.includes('nonce') ||
    msg.includes('aa25') || // ERC-4337 nonce error code
    msg.includes('invalid smart account nonce') ||
    msg.includes('sender nonce')
  );
}

/**
 * Parse error message into user-friendly format
 */
function parseErrorMessage(error: unknown): string {
  const msg = (error as Error)?.message || 'Unknown error';
  const msgLower = msg.toLowerCase();

  // Nonce errors
  if (isNonceError(error)) {
    return 'Transaction nonce error. Please wait a moment and try again.';
  }

  // Paymaster errors
  if (msgLower.includes('paymaster') || msgLower.includes('sponsor')) {
    return 'Gas sponsorship not configured. Please add a paymaster URL in Privy Dashboard > Smart Wallets > Base.';
  }

  // Balance errors
  if (msgLower.includes('insufficient') || msgLower.includes('balance')) {
    return 'Insufficient USDC balance for this deposit.';
  }

  // User rejection
  if (msgLower.includes('rejected') || msgLower.includes('denied') || msgLower.includes('cancelled')) {
    return 'Transaction was cancelled.';
  }

  // Network errors
  if (msgLower.includes('network') || msgLower.includes('timeout') || msgLower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Return original message if no specific match (truncated if too long)
  return msg.length > 100 ? msg.substring(0, 100) + '...' : msg;
}

/**
 * Execute a single transaction call
 */
async function executeSingleCall(
  client: any,
  call: TransactionCall
): Promise<string> {
  const hash = await client.sendTransaction({
    to: call.to,
    data: call.data,
    value: call.value || BigInt(0),
  });

  if (!hash || typeof hash !== 'string' || !hash.startsWith('0x')) {
    throw new Error('Transaction failed: Invalid response from wallet');
  }

  return hash;
}

/**
 * Execute a batch of transaction calls
 */
async function executeBatchCalls(
  client: any,
  calls: TransactionCall[]
): Promise<string> {
  const hash = await client.sendTransaction({
    calls: calls.map(c => ({
      to: c.to,
      data: c.data,
      value: c.value || BigInt(0),
    })),
  });

  if (!hash || typeof hash !== 'string' || !hash.startsWith('0x')) {
    throw new Error('Transaction failed: Invalid response from wallet');
  }

  return hash;
}

// Using 'any' for Privy's smart wallet client to avoid complex type conflicts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeStrategyBatch(
  client: any,
  batch: StrategyBatch
): Promise<string> {
  if (!client?.account?.address) {
    throw new Error('Smart wallet not available. Please log in first.');
  }

  if (batch.calls.length === 0) {
    throw new Error('No transactions to execute');
  }

  const callsToExecute = batch.calls;
  const walletAddress = client.account.address;
  console.log(`[Deposit] Smart wallet: ${walletAddress}`);
  console.log(`[Deposit] Calls to execute: ${callsToExecute.length}`);

  // SIMULATION: We skip simulation for batched approve+deposit transactions
  // because eth_call simulates each call independently - deposits would fail
  // since the approve hasn't actually been executed yet.
  //
  // Simulation is only useful for:
  // - Single approve calls (rarely fail)
  // - Single deposit calls when allowance already exists
  //
  // For batched transactions, we rely on the transaction itself to fail
  // and report errors (which it will do atomically).

  const hasDeposits = callsToExecute.some(c => c.data.startsWith('0x6e553f65')); // deposit(uint256,address)
  const hasApprovals = callsToExecute.some(c => c.data.startsWith('0x095ea7b3')); // approve(address,uint256)

  if (hasDeposits && hasApprovals) {
    // Skip simulation for batched approve+deposit - they have interdependencies
    console.log('[Deposit] Skipping simulation for batched approve+deposit (interdependent calls)');
  } else if (callsToExecute.length === 1 && hasApprovals) {
    console.log('[Deposit] Skipping simulation for approve-only transaction');
  } else {
    // Single deposit or other calls - try to simulate
    console.log('[Deposit] Simulating transactions...');
    const simulation = await simulateBatch(callsToExecute, walletAddress);
    if (!simulation.success) {
      console.log(`[Deposit] Simulation failed: ${simulation.error}`);
      throw new Error(`Simulation failed: ${simulation.error}`);
    }
    console.log('[Deposit] Simulation passed!');
  }

  // Retry logic for nonce errors
  const MAX_RETRIES = 2;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Wait before retry (only on subsequent attempts)
      if (attempt > 0) {
        console.log(`[Deposit] Retry attempt ${attempt + 1}/${MAX_RETRIES} after nonce error...`);
        await delay(2000); // Wait 2 seconds before retry
      }

      console.log(`[Deposit] Sending transaction (attempt ${attempt + 1})...`);

      let hash: string;

      // Execute single or batch transaction
      if (callsToExecute.length === 1) {
        hash = await executeSingleCall(client, callsToExecute[0]);
      } else {
        hash = await executeBatchCalls(client, callsToExecute);
      }

      console.log(`[Deposit] Transaction submitted! Hash: ${hash}`);
      console.log(`[Deposit] View on BaseScan: https://basescan.org/tx/${hash}`);

      // Wait for on-chain confirmation
      console.log('[Deposit] Waiting for on-chain confirmation...');
      const confirmation = await waitForTransaction(hash);

      if (!confirmation.found) {
        console.log('[Deposit] Transaction not found on-chain after timeout');
        throw new Error(
          'Transaction not confirmed on-chain. Please check Privy Dashboard for paymaster configuration.'
        );
      }

      if (confirmation.status === 'failed') {
        console.log(`[Deposit] Transaction reverted on-chain`);
        throw new Error(`Transaction reverted. Check BaseScan: https://basescan.org/tx/${hash}`);
      }

      console.log(`[Deposit] SUCCESS! Confirmed in block ${confirmation.blockNumber}`);
      return hash;

    } catch (error) {
      const errorMsg = (error as Error)?.message || 'Unknown error';
      console.log(`[Deposit] Error: ${errorMsg}`);
      lastError = error;

      // Only retry on nonce errors
      if (isNonceError(error) && attempt < MAX_RETRIES - 1) {
        console.log('[Deposit] Nonce error detected, will retry...');
        continue; // Retry
      }

      // Don't retry other errors
      break;
    }
  }

  // All retries failed - throw user-friendly error
  throw new Error(parseErrorMessage(lastError));
}
