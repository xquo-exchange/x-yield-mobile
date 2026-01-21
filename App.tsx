import React, { useState, useCallback, useEffect } from 'react';
import { Platform, View, Text, StyleSheet, Image, InteractionManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PrivyProvider, usePrivy, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { SmartWalletsProvider, useSmartWallets } from '@privy-io/expo/smart-wallets';
import { PrivyElements } from '@privy-io/expo/ui';
import * as ExpoSplashScreen from 'expo-splash-screen';
import AppNavigator from './src/navigation/AppNavigator';
import { DeepLinkProvider } from './src/contexts/DeepLinkContext';
import { AnalyticsProvider } from './src/contexts/AnalyticsContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import SplashScreen from './src/components/SplashScreen';
import ErrorBoundary from './src/components/ErrorBoundary';

// Mantieni visibile la splash nativa fino a quando non la nascondiamo manualmente
ExpoSplashScreen.preventAutoHideAsync();

// Define Base chain for Privy (matches viem Chain type)
const base = {
  id: 8453,
  name: 'Base',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://mainnet.base.org'] },
  },
  blockExplorers: {
    default: { name: 'Basescan', url: 'https://basescan.org' },
  },
} as const;

function WebNotSupported() {
  return (
    <View style={styles.container}>
      <Image
        source={require('./assets/logo_full.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Unflat</Text>
      <Text style={styles.subtitle}>
        This app requires a native mobile environment.
      </Text>
    </View>
  );
}

// Loading state tracker - exposed to parent
interface LoadingState {
  isReady: boolean;
  error: string | null;
}

// Inner component that has access to Privy hooks and tracks loading state
function AppContent({ onLoadingStateChange }: { onLoadingStateChange: (state: LoadingState) => void }) {
  const { user, isReady: privyReady } = usePrivy();
  const { wallets, isReady: walletsReady } = useEmbeddedEthereumWallet();
  const { client: smartWalletClient } = useSmartWallets();

  const embeddedWallet = wallets?.[0];
  const smartWalletAddress = smartWalletClient?.account?.address;
  const eoaAddress = embeddedWallet?.address;
  const walletAddress = smartWalletAddress || eoaAddress;

  const isAuthenticated = !!user;

  // Track loading state
  useEffect(() => {
    // On Android, defer the loading state check to allow UI to render
    if (Platform.OS === 'android') {
      InteractionManager.runAfterInteractions(() => {
        const isReady = privyReady;
        console.log('[AppContent] Android loading state:', { privyReady, walletsReady, isReady });
        onLoadingStateChange({ isReady, error: null });
      });
    } else {
      const isReady = privyReady;
      console.log('[AppContent] iOS loading state:', { privyReady, walletsReady, isReady });
      onLoadingStateChange({ isReady, error: null });
    }
  }, [privyReady, walletsReady, onLoadingStateChange]);

  return (
    <NotificationProvider
      walletAddress={walletAddress}
      isAuthenticated={isAuthenticated}
    >
      <AppNavigator />
      <PrivyElements />
    </NotificationProvider>
  );
}

// Wrapper component that handles Privy initialization errors
function PrivyWrapper({
  children,
  onError
}: {
  children: React.ReactNode;
  onError: (error: string) => void;
}) {
  const [initError, setInitError] = useState<string | null>(null);

  // Catch Privy initialization errors
  useEffect(() => {
    const timeout = setTimeout(() => {
      // If we haven't loaded after 20 seconds, there's likely an issue
      console.log('[PrivyWrapper] Checking initialization status...');
    }, 20000);

    return () => clearTimeout(timeout);
  }, []);

  if (initError) {
    onError(initError);
    return null;
  }

  return (
    <PrivyProvider
      appId="cmk1awjuj002ri60dlbm7ot7y"
      clientId="client-WY6Uw7oK8axAgoH93zaGv9pKb7kPD321yhEkMbfrb6BE1"
      supportedChains={[base]}
      config={{
        embedded: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <SmartWalletsProvider>
        {children}
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isReady: false,
    error: null,
  });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    // Nasconde la splash nativa appena il componente monta
    // Use InteractionManager on Android to prevent UI blocking
    if (Platform.OS === 'android') {
      InteractionManager.runAfterInteractions(() => {
        ExpoSplashScreen.hideAsync();
      });
    } else {
      ExpoSplashScreen.hideAsync();
    }
  }, []);

  const handleLoadingStateChange = useCallback((state: LoadingState) => {
    console.log('[App] Loading state changed:', state);
    setLoadingState(state);
  }, []);

  const handleSplashComplete = useCallback(() => {
    console.log('[App] Splash animation complete');
    setShowSplash(false);
  }, []);

  const handleRetry = useCallback(() => {
    console.log('[App] Retry requested');
    setLoadingState({ isReady: false, error: null });
    setRetryKey(prev => prev + 1);
  }, []);

  const handleError = useCallback((error: string) => {
    console.error('[App] Error:', error);
    setLoadingState({ isReady: false, error });
  }, []);

  if (Platform.OS === 'web') {
    return <WebNotSupported />;
  }

  return (
    <ErrorBoundary
      onError={(error) => {
        console.error('[App] ErrorBoundary caught:', error);
        handleError(error.message);
      }}
    >
      <SafeAreaProvider>
        <AnalyticsProvider>
          <DeepLinkProvider>
            <PrivyWrapper key={retryKey} onError={handleError}>
              <AppContent onLoadingStateChange={handleLoadingStateChange} />
            </PrivyWrapper>
          </DeepLinkProvider>
        </AnalyticsProvider>
        {showSplash && (
          <SplashScreen onAnimationComplete={handleSplashComplete} />
        )}
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    width: 150,
    height: 50,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#71717a',
    textAlign: 'center',
  },
});
