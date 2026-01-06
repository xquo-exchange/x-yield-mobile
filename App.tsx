import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { PrivyProvider } from '@privy-io/expo';
import { SmartWalletsProvider } from '@privy-io/expo/smart-wallets';
import AppNavigator from './src/navigation/AppNavigator';

function WebNotSupported() {
  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoText}>X</Text>
      </View>
      <Text style={styles.title}>X-Yield Mobile</Text>
      <Text style={styles.subtitle}>
        This app requires a native mobile environment.
      </Text>
    </View>
  );
}

export default function App() {
  if (Platform.OS === 'web') {
    return <WebNotSupported />;
  }

  return (
    <PrivyProvider
      appId="cmk1awjuj002ri60dlbm7ot7y"
      clientId="client-WY6Uw7oK8axAgoH93zaGv9pKb7kPD321yhEkMbfrb6BE1"
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
      </SmartWalletsProvider>
    </PrivyProvider>
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
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#6366f1',
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
