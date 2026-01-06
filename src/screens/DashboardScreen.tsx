import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { usePrivy, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useWalletBalance, formatBalance, formatUsdValue } from '../hooks/useWalletBalance';

type DashboardScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
};

export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const { user, logout } = usePrivy();
  const embeddedWallet = useEmbeddedEthereumWallet();
  const { client: smartWalletClient } = useSmartWallets();
  const [refreshing, setRefreshing] = React.useState(false);

  // Get embedded wallet address from the wallets array
  const wallets = embeddedWallet?.wallets || [];
  const embeddedWalletAddress = wallets.length > 0 ? wallets[0].address : '';

  // Get smart wallet address from useSmartWallets hook or user's linked accounts
  const smartWalletFromHook = smartWalletClient?.account?.address || '';
  const smartWalletAccount = user?.linked_accounts?.find(
    (account: any) => account.type === 'smart_wallet'
  ) as { address?: string } | undefined;
  const smartWalletFromLinkedAccounts = smartWalletAccount?.address || '';

  // Prefer hook address, then linked accounts, then embedded
  const smartWalletAddress = smartWalletFromHook || smartWalletFromLinkedAccounts;

  // Use smart wallet address if available, otherwise fall back to embedded wallet
  const displayAddress = smartWalletAddress || embeddedWalletAddress;
  const walletType = smartWalletAddress ? 'Smart Wallet' : 'Embedded';

  const truncatedAddress = displayAddress
    ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`
    : 'No wallet found';

  // Fetch real balances from Base chain
  const { eth, usdc, totalUsdValue, isLoading: balanceLoading, error: balanceError, refetch: refetchBalances } = useWalletBalance(displayAddress);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refetchBalances();
    setRefreshing(false);
  }, [refetchBalances]);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.replace('Welcome');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account & Start Fresh',
      'This will log you out. To get a fresh Smart Wallet:\n\n1. Use a different email address to create a new account\n\nOR\n\n2. Contact support to delete your account from the Privy Dashboard, then re-login with the same email.\n\nNote: User deletion requires server-side access.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout & Use New Email',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.replace('Welcome');
          },
        },
      ]
    );
  };

  const copyAddress = () => {
    if (displayAddress) {
      Alert.alert('Copied!', 'Wallet address copied to clipboard');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366f1"
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.userEmail}>
              {(user?.linked_accounts?.find((a) => a.type === 'email') as { address?: string } | undefined)?.address || 'User'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <Text style={styles.walletTitle}>Your Wallet</Text>
            <View style={styles.walletBadgeContainer}>
              <View style={[styles.walletBadge, smartWalletAddress ? styles.smartWalletBadge : null]}>
                <Text style={[styles.walletBadgeText, smartWalletAddress ? styles.smartWalletBadgeText : null]}>
                  {walletType}
                </Text>
              </View>
              <View style={styles.walletBadge}>
                <Text style={styles.walletBadgeText}>Base</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.addressContainer}
            onPress={copyAddress}
          >
            <Text style={styles.addressLabel}>Address (Base)</Text>
            <Text style={styles.addressValue}>{truncatedAddress}</Text>
            <Text style={styles.copyHint}>Tap to copy</Text>
          </TouchableOpacity>

          <View style={styles.balanceContainer}>
            <Text style={styles.balanceLabel}>Balance</Text>
            {balanceLoading ? (
              <ActivityIndicator size="small" color="#6366f1" style={{ marginVertical: 12 }} />
            ) : (
              <>
                <Text style={styles.balanceValue}>{formatUsdValue(totalUsdValue)}</Text>
                <Text style={styles.balanceSubtext}>
                  {formatBalance(eth.balance)} ETH on Base
                </Text>
                {usdc && parseFloat(usdc.balance) > 0 && (
                  <Text style={styles.balanceSubtext}>
                    {formatBalance(usdc.balance, 2)} USDC
                  </Text>
                )}
                {balanceError && (
                  <Text style={styles.errorText}>{balanceError}</Text>
                )}
              </>
            )}
          </View>

        </View>

        <View style={styles.yieldSection}>
          <Text style={styles.sectionTitle}>Yield Strategies</Text>

          <TouchableOpacity
            style={styles.strategiesButton}
            onPress={() => navigation.navigate('Strategies')}
          >
            <View style={styles.strategiesButtonContent}>
              <View style={styles.strategiesIcon}>
                <Text style={styles.strategiesIconText}>$</Text>
              </View>
              <View style={styles.strategiesInfo}>
                <Text style={styles.strategiesTitle}>Morpho Vault Strategies</Text>
                <Text style={styles.strategiesSubtitle}>Up to 5.5% APY on USDC</Text>
              </View>
              <Text style={styles.strategiesArrow}>{'>'}</Text>
            </View>
            <Text style={styles.strategiesDesc}>
              Allocate your funds across multiple Morpho vaults with a single transaction.
              Gas-free, atomic execution.
            </Text>
          </TouchableOpacity>

          <View style={styles.yieldCard}>
            <View style={styles.yieldCardHeader}>
              <View style={[styles.protocolIcon, { backgroundColor: '#1a2e1a' }]}>
                <Text style={[styles.protocolIconText, { color: '#22c55e' }]}>M</Text>
              </View>
              <View style={styles.yieldCardInfo}>
                <Text style={styles.protocolName}>Morpho Vaults</Text>
                <Text style={styles.strategyName}>USDC Strategies</Text>
              </View>
              <View style={styles.apyContainer}>
                <Text style={styles.apyValue}>5.5%</Text>
                <Text style={styles.apyLabel}>APY</Text>
              </View>
            </View>
          </View>

          <View style={styles.yieldCard}>
            <View style={styles.yieldCardHeader}>
              <View style={[styles.protocolIcon, { backgroundColor: '#1a1a2e' }]}>
                <Text style={[styles.protocolIconText, { color: '#6366f1' }]}>M</Text>
              </View>
              <View style={styles.yieldCardInfo}>
                <Text style={styles.protocolName}>Morpho Vaults</Text>
                <Text style={styles.strategyName}>ETH Strategies</Text>
              </View>
              <View style={styles.apyContainer}>
                <Text style={styles.apyValue}>3.5%</Text>
                <Text style={styles.apyLabel}>APY</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={styles.actionButton}>
              <View style={styles.actionIcon}>
                <Text style={styles.actionIconText}>+</Text>
              </View>
              <Text style={styles.actionButtonText}>Deposit</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <View style={styles.actionIcon}>
                <Text style={styles.actionIconText}>-</Text>
              </View>
              <Text style={styles.actionButtonText}>Withdraw</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <View style={styles.actionIcon}>
                <Text style={styles.actionIconText}>$</Text>
              </View>
              <Text style={styles.actionButtonText}>Swap</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.accountSection}>
          <Text style={styles.sectionTitle}>Account</Text>

          <TouchableOpacity
            style={styles.accountButton}
            onPress={handleLogout}
          >
            <Text style={styles.accountButtonText}>Logout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.accountButton, styles.deleteButton]}
            onPress={handleDeleteAccount}
          >
            <Text style={styles.deleteButtonText}>Delete Account & Start Fresh</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  greeting: {
    fontSize: 14,
    color: '#71717a',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#27272a',
    borderRadius: 8,
  },
  logoutButtonText: {
    fontSize: 14,
    color: '#ef4444',
  },
  walletCard: {
    backgroundColor: '#141419',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 20,
    marginBottom: 32,
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  walletTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  walletBadgeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  walletBadge: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  smartWalletBadge: {
    backgroundColor: '#1a2e1a',
  },
  walletBadgeText: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '500',
  },
  smartWalletBadgeText: {
    color: '#22c55e',
  },
  addressContainer: {
    backgroundColor: '#1a1a1f',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  addressLabel: {
    fontSize: 12,
    color: '#71717a',
    marginBottom: 4,
  },
  addressValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyHint: {
    fontSize: 11,
    color: '#6366f1',
    marginTop: 4,
  },
  balanceContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#71717a',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#ffffff',
  },
  balanceSubtext: {
    fontSize: 14,
    color: '#52525b',
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  walletStatusContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#27272a',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: '#71717a',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDeployed: {
    backgroundColor: '#1a2e1a',
  },
  statusNotDeployed: {
    backgroundColor: '#2e2a1a',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusDeployedText: {
    color: '#22c55e',
  },
  statusNotDeployedText: {
    color: '#eab308',
  },
  statusHint: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 8,
    fontStyle: 'italic',
  },
  yieldSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
  },
  strategiesButton: {
    backgroundColor: '#1a2e1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22c55e40',
    padding: 20,
    marginBottom: 16,
  },
  strategiesButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  strategiesIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#22c55e20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  strategiesIconText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#22c55e',
  },
  strategiesInfo: {
    flex: 1,
  },
  strategiesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  strategiesSubtitle: {
    fontSize: 14,
    color: '#22c55e',
  },
  strategiesArrow: {
    fontSize: 20,
    color: '#22c55e',
  },
  strategiesDesc: {
    fontSize: 13,
    color: '#a1a1aa',
    lineHeight: 18,
  },
  yieldCard: {
    backgroundColor: '#141419',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 16,
    marginBottom: 12,
  },
  yieldCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  protocolIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  protocolIconText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6366f1',
  },
  yieldCardInfo: {
    flex: 1,
  },
  protocolName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  strategyName: {
    fontSize: 14,
    color: '#71717a',
  },
  apyContainer: {
    alignItems: 'flex-end',
  },
  apyValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#22c55e',
  },
  apyLabel: {
    fontSize: 12,
    color: '#71717a',
  },
  actionsSection: {
    marginBottom: 32,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#141419',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionIconText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6366f1',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  accountSection: {
    marginBottom: 40,
  },
  accountButton: {
    backgroundColor: '#141419',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  accountButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
  deleteButton: {
    backgroundColor: '#1a1212',
    borderColor: '#3a2020',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ef4444',
  },
});
