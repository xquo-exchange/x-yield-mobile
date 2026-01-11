import { useEffect, useCallback, useRef } from 'react';
import * as Linking from 'expo-linking';

// Debug mode - controlled by __DEV__
const DEBUG = __DEV__ ?? false;
const debugLog = (message: string, ...args: unknown[]) => {
  if (DEBUG) console.log(message, ...args);
};

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
    debugLog('[DeepLink] ========================================');
    debugLog('[DeepLink] Received URL:', url);

    const parsed = Linking.parse(url);
    debugLog('[DeepLink] Parsed result:', JSON.stringify(parsed, null, 2));
    debugLog('[DeepLink] hostname:', parsed.hostname);
    debugLog('[DeepLink] path:', parsed.path);
    debugLog('[DeepLink] queryParams:', JSON.stringify(parsed.queryParams));

    // Handle both "offramp" hostname and path variations
    // URL format: unflat://offramp/complete?toAddress=...&amount=...
    const isOfframpComplete =
      (parsed.hostname === 'offramp' && (parsed.path === 'complete' || parsed.path === '/complete')) ||
      (parsed.path === 'offramp/complete' || parsed.path === '/offramp/complete');

    debugLog('[DeepLink] isOfframpComplete:', isOfframpComplete);

    if (isOfframpComplete) {
      const { toAddress, amount, currency, network, expiresAt } = parsed.queryParams || {};

      debugLog('[DeepLink] Extracted params:', { toAddress, amount, currency, network, expiresAt });

      if (toAddress && amount) {
        debugLog('[DeepLink] Calling onOfframpComplete callback');
        callbackRef.current({
          toAddress: toAddress as string,
          amount: amount as string,
          currency: (currency as string) || 'USDC',
          network: (network as string) || 'base',
          expiresAt: (expiresAt as string) || '',
        });
      } else {
        debugLog('[DeepLink] Missing required params: toAddress or amount');
      }
    } else {
      debugLog('[DeepLink] URL does not match offramp/complete pattern');
    }
    debugLog('[DeepLink] ========================================');
  }, []);

  useEffect(() => {
    debugLog('[DeepLink] Setting up deep link listeners...');

    // Handle deep link when app is already open (foreground)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      debugLog('[DeepLink] URL event received (app in foreground)');
      handleDeepLink(url);
    });

    // Handle deep link when app opens from closed/background state
    Linking.getInitialURL().then((url) => {
      debugLog('[DeepLink] Initial URL check:', url);
      if (url) {
        debugLog('[DeepLink] Processing initial URL');
        handleDeepLink(url);
      }
    });

    return () => {
      debugLog('[DeepLink] Cleaning up listeners');
      subscription?.remove();
    };
  }, [handleDeepLink]);
}
