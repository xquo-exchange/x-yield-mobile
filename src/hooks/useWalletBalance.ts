import { useState, useEffect, useCallback } from 'react';
import { type Address } from 'viem';
import { getAllBalances, type WalletBalances } from '../services/blockchain';

interface UseWalletBalanceResult extends WalletBalances {
  refetch: () => Promise<void>;
}

const initialState: WalletBalances = {
  eth: {
    symbol: 'ETH',
    balance: '0',
    balanceRaw: BigInt(0),
    decimals: 18,
    usdValue: '0.00',
  },
  usdc: null,
  totalUsdValue: '0.00',
  isLoading: true,
  error: null,
};

/**
 * Hook to fetch and manage wallet balances
 */
export function useWalletBalance(address: string | undefined): UseWalletBalanceResult {
  const [balances, setBalances] = useState<WalletBalances>(initialState);

  const fetchBalances = useCallback(async () => {
    if (!address) {
      setBalances({
        ...initialState,
        isLoading: false,
        error: 'No wallet address provided',
      });
      return;
    }

    setBalances(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await getAllBalances(address as Address);
      setBalances(result);
    } catch (error) {
      console.error('Error in useWalletBalance:', error);
      setBalances({
        ...initialState,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch balances',
      });
    }
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return {
    ...balances,
    refetch: fetchBalances,
  };
}

/**
 * Format balance for display
 */
export function formatBalance(balance: string, decimals: number = 4): string {
  const num = parseFloat(balance);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  return num.toFixed(decimals);
}

/**
 * Format USD value for display
 */
export function formatUsdValue(value: string): string {
  const num = parseFloat(value);
  if (num === 0) return '$0.00';
  if (num < 0.01) return '<$0.01';

  // Format with commas for large numbers
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
