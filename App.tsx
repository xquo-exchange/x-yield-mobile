import React, { useState, useCallback, useEffect } from 'react';
import { Platform, View, Text, StyleSheet, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PrivyProvider } from '@privy-io/expo';
import { SmartWalletsProvider } from '@privy-io/expo/smart-wallets';
import { PrivyElements } from '@privy-io/expo/ui';
import * as ExpoSplashScreen from 'expo-splash-screen';
import AppNavigator from './src/navigation/AppNavigator';
import { DeepLinkProvider } from './src/contexts/DeepLinkContext';
import { AnalyticsProvider } from './src/contexts/AnalyticsContext';
import SplashScreen from './src/components/SplashScreen';

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

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Nasconde la splash nativa appena il componente monta
    ExpoSplashScreen.hideAsync();
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  if (Platform.OS === 'web') {
    return <WebNotSupported />;
  }

  return (
    <SafeAreaProvider>
      <AnalyticsProvider>
        <DeepLinkProvider>
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
              <AppNavigator />
              <PrivyElements />
            </SmartWalletsProvider>
          </PrivyProvider>
        </DeepLinkProvider>
      </AnalyticsProvider>
      {showSplash && <SplashScreen onAnimationComplete={handleSplashComplete} />}
    </SafeAreaProvider>
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
