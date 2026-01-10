import { useEffect } from 'react';
import * as Linking from 'expo-linking';

interface OfframpParams {
  toAddress: string;
  amount: string;
  currency: string;
  network: string;
  expiresAt: string;
}

export function useOfframpDeepLink(onOfframpComplete: (params: OfframpParams) => void) {
  useEffect(() => {
    // Handle deep link when app is already open
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    // Handle deep link when app opens from closed state
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    return () => subscription?.remove();
  }, [onOfframpComplete]);

  const handleDeepLink = (url: string) => {
    console.log('[DeepLink] Received URL:', url);
    const parsed = Linking.parse(url);

    // xyield://offramp/complete?toAddress=...&amount=...
    if (parsed.hostname === 'offramp' && parsed.path === 'complete') {
      const { toAddress, amount, currency, network, expiresAt } = parsed.queryParams || {};

      if (toAddress && amount) {
        console.log('[DeepLink] Offramp complete params:', { toAddress, amount, currency, network, expiresAt });
        onOfframpComplete({
          toAddress: toAddress as string,
          amount: amount as string,
          currency: (currency as string) || 'USDC',
          network: (network as string) || 'base',
          expiresAt: expiresAt as string,
        });
      }
    }
  };
}
