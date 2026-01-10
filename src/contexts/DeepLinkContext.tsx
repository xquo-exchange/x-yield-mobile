import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';

interface OfframpParams {
  toAddress: string;
  amount: string;
  currency: string;
  network: string;
  expiresAt: string;
}

interface DeepLinkContextType {
  pendingOfframp: OfframpParams | null;
  clearPendingOfframp: () => void;
}

const DeepLinkContext = createContext<DeepLinkContextType>({
  pendingOfframp: null,
  clearPendingOfframp: () => {},
});

export function useDeepLink() {
  return useContext(DeepLinkContext);
}

export function DeepLinkProvider({ children }: { children: React.ReactNode }) {
  const [pendingOfframp, setPendingOfframp] = useState<OfframpParams | null>(null);
  const hasProcessedInitialUrl = useRef(false);

  const parseOfframpUrl = useCallback((url: string): OfframpParams | null => {
    console.log('[DeepLinkContext] ========================================');
    console.log('[DeepLinkContext] Parsing URL:', url);

    try {
      const parsed = Linking.parse(url);
      console.log('[DeepLinkContext] Parsed:', JSON.stringify(parsed, null, 2));

      // Check various path formats
      const isOfframpComplete =
        (parsed.hostname === 'offramp' && (parsed.path === 'complete' || parsed.path === '/complete')) ||
        (parsed.path === 'offramp/complete' || parsed.path === '/offramp/complete');

      console.log('[DeepLinkContext] isOfframpComplete:', isOfframpComplete);

      if (isOfframpComplete) {
        const { toAddress, amount, currency, network, expiresAt } = parsed.queryParams || {};

        if (toAddress && amount) {
          console.log('[DeepLinkContext] Valid offramp params found');
          return {
            toAddress: toAddress as string,
            amount: amount as string,
            currency: (currency as string) || 'USDC',
            network: (network as string) || 'base',
            expiresAt: (expiresAt as string) || '',
          };
        }
      }
    } catch (error) {
      console.error('[DeepLinkContext] Error parsing URL:', error);
    }

    console.log('[DeepLinkContext] ========================================');
    return null;
  }, []);

  const handleDeepLink = useCallback((url: string) => {
    console.log('[DeepLinkContext] Handling deep link:', url);

    // Show alert for debugging
    Alert.alert('Deep Link Received', `URL: ${url.substring(0, 50)}...`);

    const params = parseOfframpUrl(url);
    if (params) {
      console.log('[DeepLinkContext] Setting pending offramp:', params);
      setPendingOfframp(params);
    }
  }, [parseOfframpUrl]);

  useEffect(() => {
    console.log('[DeepLinkContext] Setting up deep link listeners...');

    // Handle deep link when app is already open
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('[DeepLinkContext] URL event received (foreground)');
      handleDeepLink(url);
    });

    // Handle initial URL (app opened from deep link)
    if (!hasProcessedInitialUrl.current) {
      hasProcessedInitialUrl.current = true;
      Linking.getInitialURL().then((url) => {
        console.log('[DeepLinkContext] Initial URL:', url);
        if (url) {
          handleDeepLink(url);
        }
      });
    }

    return () => {
      console.log('[DeepLinkContext] Cleaning up listeners');
      subscription?.remove();
    };
  }, [handleDeepLink]);

  const clearPendingOfframp = useCallback(() => {
    console.log('[DeepLinkContext] Clearing pending offramp');
    setPendingOfframp(null);
  }, []);

  return (
    <DeepLinkContext.Provider value={{ pendingOfframp, clearPendingOfframp }}>
      {children}
    </DeepLinkContext.Provider>
  );
}
