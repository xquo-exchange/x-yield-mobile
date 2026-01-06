/**
 * Blockchain Service
 * Fetches wallet balances from Base chain
 */

import { formatEther, formatUnits, type Address } from 'viem';
import { BASE_RPC_URL, BASE_RPC_FALLBACK, TOKENS } from '../constants/contracts';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function hexToBigInt(hex: string): bigint {
  if (!hex || hex === '0x' || hex === '0x0') return BigInt(0);
  try {
    return BigInt(hex);
  } catch {
    return BigInt(0);
  }
}

export interface TokenBalance {
  symbol: string;
  balance: string;
  balanceRaw: bigint;
  decimals: number;
  usdValue: string;
}

export interface WalletBalances {
  eth: TokenBalance;
  usdc: TokenBalance | null;
  totalUsdValue: string;
  isLoading: boolean;
  error: string | null;
}

/**
 * RPC call with retry and fallback
 */
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

/**
 * Fetch ETH balance
 */
export async function getEthBalance(address: Address): Promise<bigint> {
  try {
    const result = await rpcCall('eth_getBalance', [address, 'latest']);
    return hexToBigInt(result as string);
  } catch {
    return BigInt(0);
  }
}

/**
 * Fetch USDC balance
 */
export async function getUsdcBalance(address: Address): Promise<bigint> {
  try {
    const selector = '0x70a08231';
    const paddedAddress = address.toLowerCase().replace('0x', '').padStart(64, '0');
    const data = selector + paddedAddress;

    const result = await rpcCall('eth_call', [
      { to: TOKENS.USDC, data },
      'latest',
    ]);

    return hexToBigInt(result as string);
  } catch {
    return BigInt(0);
  }
}

/**
 * Fetch ETH and USDC balances
 */
export async function getAllBalances(address: Address): Promise<WalletBalances> {
  try {
    const [ethRaw, usdcRaw] = await Promise.all([
      getEthBalance(address),
      getUsdcBalance(address),
    ]);

    const ethBalance = formatEther(ethRaw);
    const usdcBalance = formatUnits(usdcRaw, 6);

    const ethUsd = parseFloat(ethBalance) * 3500;
    const usdcUsd = parseFloat(usdcBalance);

    return {
      eth: {
        symbol: 'ETH',
        balance: ethBalance,
        balanceRaw: ethRaw,
        decimals: 18,
        usdValue: ethUsd.toFixed(2),
      },
      usdc: {
        symbol: 'USDC',
        balance: usdcBalance,
        balanceRaw: usdcRaw,
        decimals: 6,
        usdValue: usdcUsd.toFixed(2),
      },
      totalUsdValue: (ethUsd + usdcUsd).toFixed(2),
      isLoading: false,
      error: null,
    };
  } catch (error) {
    return {
      eth: { symbol: 'ETH', balance: '0', balanceRaw: BigInt(0), decimals: 18, usdValue: '0.00' },
      usdc: null,
      totalUsdValue: '0.00',
      isLoading: false,
      error: error instanceof Error ? error.message : 'Failed to fetch balances',
    };
  }
}
