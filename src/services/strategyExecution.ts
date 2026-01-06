/**
 * Strategy Execution Service
 * Builds and executes deposit transactions for DeFi strategies
 */

import { type Address, encodeFunctionData, parseUnits, maxUint256 } from 'viem';
import { Strategy, MORPHO_VAULT_ABI } from '../constants/strategies';
import { ERC20_ABI, BASE_RPC_URL, BASE_RPC_FALLBACK } from '../constants/contracts';

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

  try {
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

    // Wait for on-chain confirmation
    const confirmation = await waitForTransaction(hash);

    if (!confirmation.found) {
      throw new Error(
        'Transaction not confirmed on-chain. Please check Privy Dashboard for paymaster configuration.'
      );
    }

    if (confirmation.status === 'failed') {
      throw new Error(`Transaction reverted. Check BaseScan: https://basescan.org/tx/${hash}`);
    }

    return hash;
  } catch (error) {
    const msg = (error as Error)?.message?.toLowerCase() || '';

    if (msg.includes('paymaster') || msg.includes('sponsor')) {
      throw new Error(
        'Gas sponsorship not configured. Please add a paymaster URL in Privy Dashboard > Smart Wallets > Base.'
      );
    }

    if (msg.includes('insufficient') || msg.includes('balance')) {
      throw new Error('Insufficient funds. Configure a paymaster for gas sponsorship.');
    }

    throw error;
  }
}
