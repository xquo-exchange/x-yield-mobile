/**
 * Shared RPC Utility
 * Handles JSON-RPC calls to Base chain with retry logic and fallback URLs
 */

import { BASE_RPC_URL, BASE_RPC_FALLBACK } from '../constants/contracts';

// Debug mode - controlled by __DEV__
const DEBUG = __DEV__ ?? false;
const debugLog = (message: string, ...args: unknown[]) => {
  if (DEBUG) console.log(message, ...args);
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function hexToBigInt(hex: string): bigint {
  if (!hex || hex === '0x' || hex === '0x0') return BigInt(0);
  try {
    return BigInt(hex);
  } catch {
    return BigInt(0);
  }
}

/**
 * RPC call with retry and fallback
 * Retries up to 3 times with exponential backoff, falling back to secondary RPC
 */
export async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
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
        if (data.error.message?.includes('rate') || data.error.code === -32005) {
          debugLog(`[RPC] Rate limited on ${rpcUrl}, retrying...`);
        }
        if (attempt < 2) {
          await delay(1000 * (attempt + 1));
          continue;
        }
        throw new Error(data.error.message);
      }

      return data.result;
    } catch (error) {
      if (attempt < 2) {
        debugLog(`[RPC] Attempt ${attempt + 1} failed, retrying...`);
        await delay(1000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
}
