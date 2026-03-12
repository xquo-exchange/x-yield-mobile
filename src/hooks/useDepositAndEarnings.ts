import React from 'react';
import { getDepositedAndEarnings, invalidateBlockchainCache } from '../services/depositTracker';

export function useDepositAndEarnings(displayAddress: string, savingsBalance: number) {
  const [totalDeposited, setTotalDeposited] = React.useState(0);
  const [totalEarnings, setTotalEarnings] = React.useState(0);
  const [earningsRefreshKey, setEarningsRefreshKey] = React.useState(0);

  React.useEffect(() => {
    const load = async () => {
      if (displayAddress && savingsBalance >= 0) {
        try {
          const { deposited, earnings } = await getDepositedAndEarnings(
            displayAddress,
            savingsBalance,
          );
          setTotalDeposited(deposited);
          setTotalEarnings(earnings);
        } catch (error) {
          console.error('[Dashboard] Error loading deposited/earnings:', error);
        }
      }
    };
    load();
  }, [displayAddress, savingsBalance, earningsRefreshKey]);

  const invalidateAndRefresh = React.useCallback(async () => {
    if (displayAddress) {
      await invalidateBlockchainCache(displayAddress);
    }
    setEarningsRefreshKey((k) => k + 1);
  }, [displayAddress]);

  return { totalDeposited, totalEarnings, invalidateAndRefresh };
}
