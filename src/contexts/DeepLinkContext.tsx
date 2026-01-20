import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

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
    debugLog('[DeepLinkContext] ========================================');
    debugLog('[DeepLinkContext] Parsing URL:', url);

    try {
      const parsed = Linking.parse(url);
      debugLog('[DeepLinkContext] Parsed:', JSON.stringify(parsed, null, 2));

      const isOfframpComplete =
        (parsed.hostname === 'offramp' && (parsed.path === 'complete' || parsed.path === '/complete')) ||
        (parsed.path === 'offramp/complete' || parsed.path === '/offramp/complete');

      debugLog('[DeepLinkContext] isOfframpComplete:', isOfframpComplete);

      if (isOfframpComplete) {
        // Try parsed.queryParams first
        let queryParams = parsed.queryParams || {};
        
        // Fallback: manually parse query string if Linking.parse didn't get them
        if (!queryParams.toAddress && url.includes('?')) {
          const queryString = url.split('?')[1];
          if (queryString) {
            const params = new URLSearchParams(queryString);
            queryParams = {
              toAddress: params.get('toAddress') || '',
              amount: params.get('amount') || '',
              currency: params.get('currency') || 'USDC',
              network: params.get('network') || 'base',
              expiresAt: params.get('expiresAt') || '',
            };
            debugLog('[DeepLinkContext] Fallback parsed params:', queryParams);
          }
        }

        const { toAddress, amount, currency, network, expiresAt } = queryParams;

        if (toAddress && amount) {
          debugLog('[DeepLinkContext] Valid offramp params found');
          return {
            toAddress: String(toAddress),
            amount: String(amount),
            currency: currency ? String(currency) : 'USDC',
            network: network ? String(network) : 'base',
            expiresAt: expiresAt ? String(expiresAt) : '',
          };
        }
      }
    } catch (error) {
      console.error('[DeepLinkContext] Error parsing URL:', error);
    }

    debugLog('[DeepLinkContext] ========================================');
    return null;
  }, []);

  const handleDeepLink = useCallback((url: string) => {
    debugLog('[DeepLinkContext] Handling deep link:', url);

    // IMPORTANT: Close the WebBrowser first so the modal can show
    try {
      WebBrowser.dismissBrowser();
      debugLog('[DeepLinkContext] WebBrowser dismissed');
    } catch (e) {
      debugLog('[DeepLinkContext] No browser to dismiss or error:', e);
    }

    const params = parseOfframpUrl(url);
    if (params) {
      debugLog('[DeepLinkContext] Setting pending offramp:', params);
      
      // Small delay to ensure browser is fully closed before showing modal
      setTimeout(() => {
        setPendingOfframp(params);
      }, 150);
    }
  }, [parseOfframpUrl]);

  useEffect(() => {
    debugLog('[DeepLinkContext] Setting up deep link listeners...');

    const subscription = Linking.addEventListener('url', ({ url }) => {
      debugLog('[DeepLinkContext] URL event received (foreground)');
      handleDeepLink(url);
    });

    if (!hasProcessedInitialUrl.current) {
      hasProcessedInitialUrl.current = true;
      Linking.getInitialURL().then((url) => {
        debugLog('[DeepLinkContext] Initial URL:', url);
        if (url) {
          handleDeepLink(url);
        }
      });
    }

    return () => {
      debugLog('[DeepLinkContext] Cleaning up listeners');
      subscription?.remove();
    };
  }, [handleDeepLink]);

  const clearPendingOfframp = useCallback(() => {
    debugLog('[DeepLinkContext] Clearing pending offramp');
    setPendingOfframp(null);
  }, []);

  return (
    <DeepLinkContext.Provider value={{ pendingOfframp, clearPendingOfframp }}>
      {children}
    </DeepLinkContext.Provider>
  );
}