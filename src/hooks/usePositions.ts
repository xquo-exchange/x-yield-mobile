import { useState, useEffect, useCallback } from 'react';
import { type Address } from 'viem';
import { getVaultPositions, type PositionsResult, type VaultPosition } from '../services/blockchain';

interface UsePositionsResult extends PositionsResult {
  refetch: () => Promise<void>;
}

const initialState: PositionsResult = {
  positions: [],
  totalUsdValue: '0.00',
  isLoading: true,
  error: null,
};

/**
 * Hook to fetch and manage vault positions
 */
export function usePositions(address: string | undefined): UsePositionsResult {
  const [result, setResult] = useState<PositionsResult>(initialState);

  const fetchPositions = useCallback(async () => {
    if (!address) {
      setResult({
        ...initialState,
        isLoading: false,
        error: null,
      });
      return;
    }

    setResult(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const positions = await getVaultPositions(address as Address);
      setResult(positions);
    } catch (error) {
      console.error('Error in usePositions:', error);
      setResult({
        ...initialState,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch positions',
      });
    }
  }, [address]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return {
    ...result,
    refetch: fetchPositions,
  };
}

export type { VaultPosition };
