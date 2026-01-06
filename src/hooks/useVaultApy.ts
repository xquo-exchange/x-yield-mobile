/**
 * Hook for fetching and caching Morpho vault APY data
 */

import { useState, useEffect, useCallback } from 'react';
import { getCachedApyData, refreshApyCache, ApyResult, VaultApyData } from '../services/morphoApi';

interface UseVaultApyResult {
  apy: string;           // Formatted APY string (e.g., "5.2")
  netApy: string;        // Net APY after fees
  vaults: VaultApyData[];  // Individual vault APY data
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastUpdated: Date | null;
  getVaultApy: (address: string) => string | null; // Get APY for specific vault
}

const DEFAULT_APY = '5.1';

export function useVaultApy(): UseVaultApyResult {
  const [apyData, setApyData] = useState<ApyResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApy = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getCachedApyData();
      setApyData(result);
    } catch (err) {
      console.error('[useVaultApy] Error:', err);
      setError((err as Error).message || 'Failed to fetch APY');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await refreshApyCache();
      setApyData(result);
    } catch (err) {
      console.error('[useVaultApy] Refetch error:', err);
      setError((err as Error).message || 'Failed to refresh APY');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApy();
  }, [fetchApy]);

  // Calculate display APY
  const apy = apyData?.weightedApy
    ? apyData.weightedApy.toFixed(1)
    : DEFAULT_APY;

  const netApy = apyData?.weightedNetApy
    ? apyData.weightedNetApy.toFixed(1)
    : DEFAULT_APY;

  // Helper to get APY for a specific vault address
  const getVaultApy = useCallback((address: string): string | null => {
    if (!apyData?.vaults) return null;
    const vault = apyData.vaults.find(
      v => v.address.toLowerCase() === address.toLowerCase()
    );
    return vault ? vault.avgNetApy.toFixed(1) : null;
  }, [apyData]);

  return {
    apy,
    netApy,
    vaults: apyData?.vaults || [],
    isLoading,
    error,
    refetch,
    lastUpdated: apyData?.lastUpdated || null,
    getVaultApy,
  };
}
