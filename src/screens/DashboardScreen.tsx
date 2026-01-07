import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePrivy, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';

import { RootStackParamList } from '../navigation/AppNavigator';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { usePositions } from '../hooks/usePositions';
import { useVaultApy } from '../hooks/useVaultApy';

type DashboardScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
};

export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const { user, logout } = usePrivy();
  const embeddedWallet = useEmbeddedEthereumWallet();
  const { client: smartWalletClient } = useSmartWallets();
  const [refreshing, setRefreshing] = React.useState(false);
  const [showFundingModal, setShowFundingModal] = React.useState(false);
  const [fundingView, setFundingView] = React.useState<'options' | 'receive'>('options');
  const [copied, setCopied] = React.useState(false);

  const { apy: displayApy, refetch: refetchApy } = useVaultApy();

  const wallets = embeddedWallet?.wallets || [];
  const embeddedWalletAddress = wallets.length > 0 ? wallets[0].address : '';
  const smartWalletFromHook = smartWalletClient?.account?.address || '';
  const smartWalletAccount = user?.linked_accounts?.find(
    (account: any) => account.type === 'smart_wallet'
  ) as { address?: string } | undefined;
  const smartWalletFromLinkedAccounts = smartWalletAccount?.address || '';
  const smartWalletAddress = smartWalletFromHook || smartWalletFromLinkedAccounts;
  const displayAddress = smartWalletAddress || embeddedWalletAddress;

  // Fetch balances and positions
  const { usdc, isLoading: balanceLoading, refetch: refetchBalances } = useWalletBalance(displayAddress);
  const { totalUsdValue: savingsTotal, isLoading: positionsLoading, refetch: refetchPositions } = usePositions(displayAddress);

  const isLoading = balanceLoading || positionsLoading;

  // Calculate totals
  const availableBalance = usdc ? parseFloat(usdc.balance) : 0;
  const savingsBalance = parseFloat(savingsTotal) || 0;
  const totalBalance = availableBalance + savingsBalance;
  const hasSavings = savingsBalance > 0;

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBalances(), refetchPositions(), refetchApy()]);
    setRefreshing(false);
  }, [refetchBalances, refetchPositions, refetchApy]);

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

  const handleCopyAddress = async () => {
    if (displayAddress) {
      await Clipboard.setStringAsync(displayAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBuyUsdc = () => {
    Alert.alert(
      'Buy USDC',
      'Get USDC to start earning yield:\n\n' +
        '1. Buy USDC on Coinbase or any exchange\n' +
        '2. Send it to your X-Yield wallet address\n\n' +
        'Direct card purchases coming soon!',
      [
        {
          text: 'Buy on Coinbase',
          onPress: () => {
            Linking.openURL('https://www.coinbase.com/price/usd-coin').catch(() => {
              Alert.alert('Error', 'Could not open Coinbase');
            });
          },
        },
        {
          text: 'Copy My Address',
          onPress: () => {
            handleCopyAddress();
            setFundingView('receive');
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const openFundingModal = () => {
    setFundingView('options');
    setShowFundingModal(true);
  };

  const closeFundingModal = () => {
    setShowFundingModal(false);
    setFundingView('options');
  };

  const userEmail = (user?.linked_accounts?.find((a) => a.type === 'email') as { address?: string } | undefined)?.address || 'User';

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
            tintColor="#22c55e"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.userEmail}>{userEmail}</Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Main Balance Card */}
        <View style={styles.mainCard}>
          <Text style={styles.totalLabel}>Total Balance</Text>
          {isLoading ? (
            <ActivityIndicator size="large" color="#22c55e" style={{ marginVertical: 16 }} />
          ) : (
            <>
              <Text style={styles.totalValue}>${totalBalance.toFixed(2)}</Text>

              {/* Balance Breakdown */}
              <View style={styles.breakdownSection}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Available</Text>
                  <Text style={styles.breakdownValue}>${availableBalance.toFixed(2)}</Text>
                </View>
                {hasSavings && (
                  <View style={styles.breakdownRow}>
                    <View style={styles.savingsLabelRow}>
                      <Text style={styles.breakdownLabel}>Earning</Text>
                      <View style={styles.apyBadge}>
                        <Text style={styles.apyBadgeText}>~{displayApy}% APY</Text>
                      </View>
                    </View>
                    <Text style={styles.breakdownValueGreen}>${savingsBalance.toFixed(2)}</Text>
                  </View>
                )}
              </View>

              {/* Add Funds Button */}
              <TouchableOpacity
                style={styles.addFundsButton}
                onPress={openFundingModal}
              >
                <Text style={styles.addFundsButtonText}>+ Add Funds</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Action Card */}
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Strategies')}
        >
          <View style={styles.actionHeader}>
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>$</Text>
            </View>
            <View style={styles.actionContent}>
              {hasSavings ? (
                <>
                  <Text style={styles.actionTitle}>Manage Savings</Text>
                  <Text style={styles.actionSubtitle}>Add more or withdraw</Text>
                </>
              ) : (
                <>
                  <Text style={styles.actionTitle}>Start Earning</Text>
                  <Text style={styles.actionSubtitle}>~{displayApy}% APY on your balance</Text>
                </>
              )}
            </View>
            <Text style={styles.actionArrow}>{'>'}</Text>
          </View>
          <Text style={styles.actionDescription}>
            {hasSavings
              ? 'Your money is earning yield. Tap to add more or withdraw.'
              : 'Put your money to work. Earn yield automatically with no lock-up.'}
          </Text>
        </TouchableOpacity>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>Why X-Yield?</Text>

          <View style={styles.featureCard}>
            <View style={styles.featureRow}>
              <Text style={styles.featureIcon}>✓</Text>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>No fees on deposits</Text>
                <Text style={styles.featureSubtext}>Add money for free, anytime</Text>
              </View>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureRow}>
              <Text style={styles.featureIcon}>✓</Text>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>Withdraw anytime</Text>
                <Text style={styles.featureSubtext}>No lock-up period, instant access</Text>
              </View>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureRow}>
              <Text style={styles.featureIcon}>✓</Text>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>Fee only on earnings</Text>
                <Text style={styles.featureSubtext}>15% of profits, never your deposits</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Wallet & Security Section */}
        <View style={styles.walletSection}>
          <Text style={styles.sectionTitle}>Wallet & Security</Text>

          {/* Wallet Address */}
          <View style={styles.walletCard}>
            <View style={styles.walletRow}>
              <View style={styles.walletInfo}>
                <Text style={styles.walletLabel}>Wallet Address</Text>
                <Text style={styles.walletAddress} numberOfLines={1}>
                  {displayAddress
                    ? `${displayAddress.slice(0, 8)}...${displayAddress.slice(-6)}`
                    : 'Loading...'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.walletCopyButton}
                onPress={handleCopyAddress}
              >
                <Text style={styles.walletCopyText}>{copied ? '✓' : 'Copy'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* View on Explorer */}
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => {
              if (displayAddress) {
                Linking.openURL(`https://basescan.org/address/${displayAddress}`);
              }
            }}
          >
            <Text style={styles.settingsButtonIcon}>🔗</Text>
            <Text style={styles.settingsButtonText}>View on BaseScan</Text>
            <Text style={styles.settingsButtonArrow}>{'>'}</Text>
          </TouchableOpacity>

          {/* Wallet Security Info */}
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => {
              Alert.alert(
                'Wallet Security',
                'Your wallet is secured by Privy, an industry-leading wallet provider.\n\n' +
                  '• Your private key is encrypted and stored securely\n' +
                  '• Only you can access your funds\n' +
                  '• Gas fees are sponsored (free for you)\n\n' +
                  'To export your private key or set up recovery, visit your Privy account settings at privy.io',
                [
                  {
                    text: 'Learn More',
                    onPress: () => Linking.openURL('https://docs.privy.io/guide/expo/'),
                  },
                  { text: 'OK' },
                ]
              );
            }}
          >
            <Text style={styles.settingsButtonIcon}>🔒</Text>
            <Text style={styles.settingsButtonText}>Wallet Security</Text>
            <Text style={styles.settingsButtonArrow}>{'>'}</Text>
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity
            style={[styles.settingsButton, styles.logoutSettingsButton]}
            onPress={handleLogout}
          >
            <Text style={styles.settingsButtonIcon}>🚪</Text>
            <Text style={styles.logoutSettingsText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add Funds Modal */}
      <Modal
        visible={showFundingModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeFundingModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              {fundingView === 'receive' ? (
                <TouchableOpacity
                  style={styles.modalBackButton}
                  onPress={() => setFundingView('options')}
                >
                  <Text style={styles.modalBackText}>{'<'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.modalBackButton} />
              )}
              <Text style={styles.modalTitle}>Add Funds</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeFundingModal}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {fundingView === 'options' ? (
              /* Options View */
              <View style={styles.optionsContainer}>
                {/* Buy USDC Option */}
                <TouchableOpacity
                  style={styles.fundingOption}
                  onPress={handleBuyUsdc}
                >
                  <View style={styles.fundingOptionIcon}>
                    <Text style={styles.fundingOptionIconText}>💳</Text>
                  </View>
                  <View style={styles.fundingOptionContent}>
                    <Text style={styles.fundingOptionTitle}>Buy USDC</Text>
                    <Text style={styles.fundingOptionSubtitle}>
                      Via Coinbase or other exchanges
                    </Text>
                  </View>
                  <Text style={styles.fundingOptionArrow}>{'>'}</Text>
                </TouchableOpacity>

                {/* Receive from Wallet Option */}
                <TouchableOpacity
                  style={styles.fundingOption}
                  onPress={() => setFundingView('receive')}
                >
                  <View style={styles.fundingOptionIcon}>
                    <Text style={styles.fundingOptionIconText}>📥</Text>
                  </View>
                  <View style={styles.fundingOptionContent}>
                    <Text style={styles.fundingOptionTitle}>Receive from Wallet</Text>
                    <Text style={styles.fundingOptionSubtitle}>
                      Send USDC from another wallet
                    </Text>
                  </View>
                  <Text style={styles.fundingOptionArrow}>{'>'}</Text>
                </TouchableOpacity>

                {/* Info Text */}
                <Text style={styles.fundingInfo}>
                  Funds will be added as USDC on Base network
                </Text>
              </View>
            ) : (
              /* Receive View (QR Code) */
              <>
                {/* QR Code */}
                <View style={styles.qrContainer}>
                  {displayAddress ? (
                    <QRCode
                      value={displayAddress}
                      size={180}
                      backgroundColor="#ffffff"
                      color="#000000"
                    />
                  ) : (
                    <View style={styles.qrPlaceholder}>
                      <Text style={styles.qrPlaceholderText}>No wallet</Text>
                    </View>
                  )}
                </View>

                {/* Instructions */}
                <Text style={styles.modalInstructions}>
                  Send USDC on Base network to this address
                </Text>

                {/* Address Box */}
                <View style={styles.addressBox}>
                  <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                    {displayAddress || 'No wallet address'}
                  </Text>
                </View>

                {/* Copy Button */}
                <TouchableOpacity
                  style={[styles.copyButton, copied && styles.copyButtonCopied]}
                  onPress={handleCopyAddress}
                  disabled={!displayAddress}
                >
                  <Text style={[styles.copyButtonText, copied && styles.copyButtonTextCopied]}>
                    {copied ? '✓ Copied!' : 'Copy Address'}
                  </Text>
                </TouchableOpacity>

                {/* Warning */}
                <View style={styles.warningBox}>
                  <Text style={styles.warningIcon}>⚠️</Text>
                  <Text style={styles.warningText}>
                    Only send USDC on Base network. Other tokens or networks may result in permanent loss.
                  </Text>
                </View>

                {/* Network Badge */}
                <View style={styles.networkBadge}>
                  <View style={styles.networkDot} />
                  <Text style={styles.networkText}>Base Network</Text>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
    fontSize: 18,
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
    color: '#a1a1aa',
  },
  // Main Card
  mainCard: {
    backgroundColor: '#141419',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 28,
    marginBottom: 20,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#71717a',
    marginBottom: 8,
  },
  totalValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 24,
  },
  breakdownSection: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    paddingTop: 20,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  breakdownLabel: {
    fontSize: 15,
    color: '#71717a',
  },
  breakdownValue: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '600',
  },
  breakdownValueGreen: {
    fontSize: 15,
    color: '#22c55e',
    fontWeight: '600',
  },
  savingsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  apyBadge: {
    backgroundColor: '#1a2e1a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  apyBadgeText: {
    fontSize: 11,
    color: '#22c55e',
    fontWeight: '600',
  },
  addFundsButton: {
    marginTop: 16,
    backgroundColor: '#27272a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addFundsButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Action Card
  actionCard: {
    backgroundColor: '#1a2e1a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#22c55e40',
    padding: 20,
    marginBottom: 32,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#22c55e20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionIconText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#22c55e',
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 14,
    color: '#22c55e',
  },
  actionArrow: {
    fontSize: 20,
    color: '#22c55e',
  },
  actionDescription: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
  },
  // Features Section
  featuresSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
  },
  featureCard: {
    backgroundColor: '#141419',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 16,
    marginBottom: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    fontSize: 16,
    color: '#22c55e',
    marginRight: 12,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 2,
  },
  featureSubtext: {
    fontSize: 13,
    color: '#71717a',
  },
  // Wallet & Security Section
  walletSection: {
    marginBottom: 20,
  },
  walletCard: {
    backgroundColor: '#141419',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 16,
    marginBottom: 10,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletInfo: {
    flex: 1,
  },
  walletLabel: {
    fontSize: 12,
    color: '#71717a',
    marginBottom: 4,
  },
  walletAddress: {
    fontSize: 14,
    color: '#ffffff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  walletCopyButton: {
    backgroundColor: '#27272a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  walletCopyText: {
    fontSize: 13,
    color: '#22c55e',
    fontWeight: '600',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141419',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 16,
    marginBottom: 10,
  },
  settingsButtonIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  settingsButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#ffffff',
  },
  settingsButtonArrow: {
    fontSize: 16,
    color: '#71717a',
  },
  logoutSettingsButton: {
    borderColor: '#3f3f46',
  },
  logoutSettingsText: {
    flex: 1,
    fontSize: 15,
    color: '#ef4444',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#141419',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  modalBackButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#a1a1aa',
  },
  // Funding Options View
  optionsContainer: {
    width: '100%',
    gap: 12,
  },
  fundingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1f',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  fundingOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  fundingOptionIconText: {
    fontSize: 22,
  },
  fundingOptionContent: {
    flex: 1,
  },
  fundingOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  fundingOptionSubtitle: {
    fontSize: 13,
    color: '#71717a',
  },
  fundingOptionArrow: {
    fontSize: 18,
    color: '#71717a',
    marginLeft: 8,
  },
  fundingInfo: {
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
    marginTop: 8,
  },
  qrContainer: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  qrPlaceholder: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  qrPlaceholderText: {
    color: '#71717a',
    fontSize: 14,
  },
  modalInstructions: {
    fontSize: 15,
    color: '#a1a1aa',
    textAlign: 'center',
    marginBottom: 16,
  },
  addressBox: {
    backgroundColor: '#1a1a1f',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 16,
  },
  addressText: {
    fontSize: 14,
    color: '#ffffff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
  },
  copyButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  copyButtonCopied: {
    backgroundColor: '#1a2e1a',
  },
  copyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  copyButtonTextCopied: {
    color: '#22c55e',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#2e2a1a',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    marginBottom: 16,
  },
  warningIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#eab308',
    lineHeight: 18,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginRight: 8,
  },
  networkText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '500',
  },
});
