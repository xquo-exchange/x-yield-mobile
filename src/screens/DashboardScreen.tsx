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
import AnimatedBalance from '../components/AnimatedBalance';
import { openCoinbaseToBuyUsdc } from '../services/coinbaseOnramp';

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
  const cashBalance = usdc ? parseFloat(usdc.balance) : 0;
  const savingsBalance = parseFloat(savingsTotal) || 0;
  const totalBalance = cashBalance + savingsBalance;
  const hasSavings = savingsBalance > 0;
  const hasCash = cashBalance > 0;

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

  const handleBuyUsdc = async () => {
    if (!displayAddress) {
      Alert.alert('Error', 'No wallet address available');
      return;
    }

    // Show buy instructions with options
    const shortAddress = `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`;

    Alert.alert(
      'Buy USDC',
      `To add funds to X-Yield:\n\n` +
        `1. Buy USDC on Coinbase\n` +
        `2. Withdraw to your wallet\n` +
        `3. Use Base network\n\n` +
        `Your address: ${shortAddress}`,
      [
        {
          text: 'Open Coinbase',
          onPress: async () => {
            const opened = await openCoinbaseToBuyUsdc();
            if (!opened) {
              Alert.alert('Error', 'Could not open Coinbase');
            }
          },
        },
        {
          text: 'Show QR Code',
          onPress: () => {
            setShowFundingModal(true);
            setFundingView('receive');
          },
        },
        {
          text: 'Copy Address',
          onPress: handleCopyAddress,
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

        {/* Total Balance Summary */}
        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Total Balance</Text>
          {isLoading ? (
            <ActivityIndicator size="small" color="#22c55e" />
          ) : (
            <Text style={styles.totalValue}>${totalBalance.toFixed(2)}</Text>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#22c55e" style={{ marginVertical: 40 }} />
        ) : (
          <>
            {/* ═══════════════════════════════════════════════════════════════
                CASH ACCOUNT CARD
                USDC in wallet, not earning yield
            ═══════════════════════════════════════════════════════════════ */}
            <View style={styles.accountCard}>
              <View style={styles.accountHeader}>
                <View style={styles.accountIconContainer}>
                  <Text style={styles.accountIcon}>$</Text>
                </View>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountTitle}>Cash</Text>
                  <Text style={styles.accountSubtitle}>Available to use or invest</Text>
                </View>
              </View>

              <Text style={styles.accountBalance}>${cashBalance.toFixed(2)}</Text>

              {!hasCash && (
                <Text style={styles.emptyStateText}>
                  Add funds to get started
                </Text>
              )}

              <TouchableOpacity
                style={styles.accountButton}
                onPress={openFundingModal}
              >
                <Text style={styles.accountButtonText}>+ Add Funds</Text>
              </TouchableOpacity>
            </View>

            {/* ═══════════════════════════════════════════════════════════════
                SAVINGS ACCOUNT CARD
                USDC in Morpho vaults, earning yield
            ═══════════════════════════════════════════════════════════════ */}
            <View style={[styles.accountCard, styles.savingsCard]}>
              <View style={styles.accountHeader}>
                <View style={[styles.accountIconContainer, styles.savingsIconContainer]}>
                  <Text style={styles.accountIcon}>%</Text>
                </View>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountTitle}>Savings</Text>
                  <View style={styles.apyBadge}>
                    <View style={styles.apyDot} />
                    <Text style={styles.apyBadgeText}>{displayApy}% APY</Text>
                  </View>
                </View>
              </View>

              {hasSavings ? (
                <>
                  <AnimatedBalance
                    balance={savingsBalance}
                    apy={parseFloat(displayApy)}
                    isAnimating={true}
                    fontSize={32}
                    showYieldEstimate={true}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.accountBalance}>$0.00</Text>
                  <Text style={styles.emptyStateText}>
                    Move cash here to start earning {displayApy}% APY
                  </Text>
                </>
              )}

              <TouchableOpacity
                style={[styles.accountButton, styles.savingsButton]}
                onPress={() => navigation.navigate('Strategies')}
              >
                <Text style={[styles.accountButtonText, styles.savingsButtonText]}>
                  {hasSavings ? 'Manage Savings' : 'Start Earning'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ═══════════════════════════════════════════════════════════════
                HOW IT WORKS SECTION
            ═══════════════════════════════════════════════════════════════ */}
            <View style={styles.howItWorksSection}>
              <Text style={styles.sectionTitle}>How it works</Text>

              <View style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Add funds to Cash</Text>
                  <Text style={styles.stepDescription}>
                    Deposit USDC via bank, card, or crypto transfer
                  </Text>
                </View>
              </View>

              <View style={styles.stepConnector} />

              <View style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Move to Savings</Text>
                  <Text style={styles.stepDescription}>
                    Tap "Start Earning" to put your cash to work
                  </Text>
                </View>
              </View>

              <View style={styles.stepConnector} />

              <View style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Watch it grow</Text>
                  <Text style={styles.stepDescription}>
                    Earn ~{displayApy}% APY, withdraw anytime with no lockup
                  </Text>
                </View>
              </View>
            </View>

            {/* Features */}
            <View style={styles.featuresRow}>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>No fees on deposits</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>Withdraw anytime</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>15% fee on profits only</Text>
              </View>
            </View>
          </>
        )}
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
                    <Text style={styles.fundingOptionIconText}>$</Text>
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
                    <Text style={styles.fundingOptionIconText}>↓</Text>
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
                  Funds will be added to your Cash account on Base network
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
                  <Text style={styles.warningText}>
                    Only send USDC on Base network. Other tokens or networks may result in loss.
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 14,
    color: '#71717a',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
  },
  logoutButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1a1a1f',
    borderRadius: 8,
  },
  logoutButtonText: {
    fontSize: 13,
    color: '#71717a',
  },
  // Total Balance
  totalSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  totalLabel: {
    fontSize: 14,
    color: '#71717a',
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 40,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -1,
  },
  // Account Cards
  accountCard: {
    backgroundColor: '#141419',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 20,
    marginBottom: 16,
  },
  savingsCard: {
    borderColor: '#22c55e30',
    backgroundColor: '#0f1a14',
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  accountIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  savingsIconContainer: {
    backgroundColor: '#22c55e20',
  },
  accountIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  accountInfo: {
    flex: 1,
  },
  accountTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  accountSubtitle: {
    fontSize: 13,
    color: '#71717a',
  },
  apyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  apyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  apyBadgeText: {
    fontSize: 13,
    color: '#22c55e',
    fontWeight: '500',
  },
  accountBalance: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#52525b',
    marginBottom: 16,
  },
  accountButton: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  savingsButton: {
    backgroundColor: '#22c55e',
  },
  accountButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  savingsButtonText: {
    color: '#ffffff',
  },
  // How it works
  howItWorksSection: {
    backgroundColor: '#141419',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 20,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a1a1aa',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 2,
  },
  stepDescription: {
    fontSize: 13,
    color: '#71717a',
    lineHeight: 18,
  },
  stepConnector: {
    width: 2,
    height: 20,
    backgroundColor: '#27272a',
    marginLeft: 13,
    marginVertical: 6,
  },
  // Features
  featuresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 10,
  },
  featureIcon: {
    fontSize: 12,
    color: '#22c55e',
    marginRight: 6,
  },
  featureText: {
    fontSize: 12,
    color: '#71717a',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
    fontSize: 18,
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
    color: '#71717a',
  },
  // Funding Options
  optionsContainer: {
    width: '100%',
    gap: 12,
  },
  fundingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1f',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  fundingOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  fundingOptionIconText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  fundingOptionContent: {
    flex: 1,
  },
  fundingOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  fundingOptionSubtitle: {
    fontSize: 13,
    color: '#71717a',
  },
  fundingOptionArrow: {
    fontSize: 16,
    color: '#52525b',
    marginLeft: 8,
  },
  fundingInfo: {
    fontSize: 12,
    color: '#52525b',
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
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
    marginBottom: 16,
  },
  addressBox: {
    backgroundColor: '#1a1a1f',
    borderRadius: 10,
    padding: 14,
    width: '100%',
    marginBottom: 16,
  },
  addressText: {
    fontSize: 13,
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
    marginBottom: 16,
  },
  copyButtonCopied: {
    backgroundColor: '#1a2e1a',
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  copyButtonTextCopied: {
    color: '#22c55e',
  },
  warningBox: {
    backgroundColor: '#2a2517',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    marginBottom: 16,
  },
  warningText: {
    fontSize: 12,
    color: '#ca8a04',
    textAlign: 'center',
    lineHeight: 16,
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
