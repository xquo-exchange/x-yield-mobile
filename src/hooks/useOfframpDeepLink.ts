import { useEffect, useCallback, useRef } from 'react';
import * as Linking from 'expo-linking';

interface OfframpParams {
  toAddress: string;
  amount: string;
  currency: string;
  network: string;
  expiresAt: string;
}

export function useOfframpDeepLink(onOfframpComplete: (params: OfframpParams) => void) {
  // Use ref to avoid stale closure issues
  const callbackRef = useRef(onOfframpComplete);
  callbackRef.current = onOfframpComplete;

  const handleDeepLink = useCallback((url: string) => {
    console.log('[DeepLink] ========================================');
    console.log('[DeepLink] Received URL:', url);

    const parsed = Linking.parse(url);
    console.log('[DeepLink] Parsed result:', JSON.stringify(parsed, null, 2));
    console.log('[DeepLink] hostname:', parsed.hostname);
    console.log('[DeepLink] path:', parsed.path);
    console.log('[DeepLink] queryParams:', JSON.stringify(parsed.queryParams));

    // Handle both "offramp" hostname and path variations
    // URL format: xyield://offramp/complete?toAddress=...&amount=...
    const isOfframpComplete =
      (parsed.hostname === 'offramp' && (parsed.path === 'complete' || parsed.path === '/complete')) ||
      (parsed.path === 'offramp/complete' || parsed.path === '/offramp/complete');

    console.log('[DeepLink] isOfframpComplete:', isOfframpComplete);

    if (isOfframpComplete) {
      const { toAddress, amount, currency, network, expiresAt } = parsed.queryParams || {};

      console.log('[DeepLink] Extracted params:', { toAddress, amount, currency, network, expiresAt });

      if (toAddress && amount) {
        console.log('[DeepLink] Calling onOfframpComplete callback');
        callbackRef.current({
          toAddress: toAddress as string,
          amount: amount as string,
          currency: (currency as string) || 'USDC',
          network: (network as string) || 'base',
          expiresAt: (expiresAt as string) || '',
        });
      } else {
        console.log('[DeepLink] Missing required params: toAddress or amount');
      }
    } else {
      console.log('[DeepLink] URL does not match offramp/complete pattern');
    }
    console.log('[DeepLink] ========================================');
  }, []);

  useEffect(() => {
    console.log('[DeepLink] Setting up deep link listeners...');

    // Handle deep link when app is already open (foreground)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('[DeepLink] URL event received (app in foreground)');
      handleDeepLink(url);
    });

    // Handle deep link when app opens from closed/background state
    Linking.getInitialURL().then((url) => {
      console.log('[DeepLink] Initial URL check:', url);
      if (url) {
        console.log('[DeepLink] Processing initial URL');
        handleDeepLink(url);
      }
    });

    return () => {
      console.log('[DeepLink] Cleaning up listeners');
      subscription?.remove();
    };
  }, [handleDeepLink]);
}
