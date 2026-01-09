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
  AppState,
  AppStateStatus,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePrivy, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';

import { RootStackParamList } from '../navigation/AppNavigator';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { usePositions } from '../hooks/usePositions';
import { useVaultApy } from '../hooks/useVaultApy';
import { getTotalDeposited } from '../services/depositTracker';
import { openCoinbaseOnramp, getOnrampSessionUrl } from '../services/coinbaseOnramp';

// Brand Color Palette - unflat (ONLY these 5 colors)
const COLORS = {
  primary: '#200191',    // Deep violet - card backgrounds, badges
  secondary: '#6198FF',  // Light blue - CTAs, earnings, APY numbers
  white: '#F5F6FF',      // Main text, titles, balances
  grey: '#484848',       // Labels, subtitles, secondary borders
  black: '#00041B',      // Screen backgrounds
};

// AnimatedBalance Component - Real-time yield accumulation with USDC precision
interface AnimatedBalanceProps {
  balance: number;
  apy: number;
  isEarning: boolean;
  size?: 'large' | 'medium';
}

function AnimatedBalance({ balance, apy, isEarning, size = 'large' }: AnimatedBalanceProps) {
  const [displayBalance, setDisplayBalance] = React.useState(balance);
  const startTimeRef = React.useRef(Date.now());
  const startBalanceRef = React.useRef(balance);

  // Reset when balance changes significantly (new deposit/withdrawal)
  React.useEffect(() => {
    const diff = Math.abs(balance - startBalanceRef.current);
    if (diff > 0.01) {
      startBalanceRef.current = balance;
      startTimeRef.current = Date.now();
      setDisplayBalance(balance);
    }
  }, [balance]);

  // Real-time yield accumulation
  React.useEffect(() => {
    if (!isEarning || apy <= 0 || balance <= 0) {
      setDisplayBalance(balance);
      return;
    }

    // yieldPerSecond = balance * (APY / 100) / seconds_per_year
    const secondsPerYear = 31536000;
    const yieldPerSecond = balance * (apy / 100) / secondsPerYear;

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
      const accumulatedYield = yieldPerSecond * elapsedSeconds;
      setDisplayBalance(startBalanceRef.current + accumulatedYield);
    }, 100);

    return () => clearInterval(interval);
  }, [balance, apy, isEarning]);

  // Format with 6 decimal places (USDC precision)
  const formatBalance = (value: number): string => {
    const formatted = value.toFixed(6);
    const parts = formatted.split('.');
    const integerPart = parseInt(parts[0]).toLocaleString('en-US');
    return `$${integerPart}.${parts[1]}`;
  };

  const fontSize = size === 'large' ? 44 : 28;

  return (
    <Text style={[animatedBalanceStyles.balance, { fontSize }]}>
      {formatBalance(displayBalance)}
    </Text>
  );
}

const animatedBalanceStyles = StyleSheet.create({
  balance: {
    fontWeight: '700',
    color: COLORS.white,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
});

// AnimatedEarned Component - Real-time earnings with USDC precision
interface AnimatedEarnedProps {
  currentBalance: number;
  depositedAmount: number;
  apy: number;
}

function AnimatedEarned({ currentBalance, depositedAmount, apy }: AnimatedEarnedProps) {
  const [displayEarned, setDisplayEarned] = React.useState(
    Math.max(0, currentBalance - depositedAmount)
  );
  const startTimeRef = React.useRef(Date.now());
  const startBalanceRef = React.useRef(currentBalance);

  // Reset when balance changes significantly
  React.useEffect(() => {
    const diff = Math.abs(currentBalance - startBalanceRef.current);
    if (diff > 0.01) {
      startBalanceRef.current = currentBalance;
      startTimeRef.current = Date.now();
      setDisplayEarned(Math.max(0, currentBalance - depositedAmount));
    }
  }, [currentBalance, depositedAmount]);

  // Real-time yield accumulation for earned amount
  React.useEffect(() => {
    if (apy <= 0 || currentBalance <= 0 || depositedAmount <= 0) {
      setDisplayEarned(Math.max(0, currentBalance - depositedAmount));
      return;
    }

    // yieldPerSecond based on current balance
    const secondsPerYear = 31536000;
    const yieldPerSecond = currentBalance * (apy / 100) / secondsPerYear;

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
      const accumulatedYield = yieldPerSecond * elapsedSeconds;
      const newBalance = startBalanceRef.current + accumulatedYield;
      setDisplayEarned(Math.max(0, newBalance - depositedAmount));
    }, 100);

    return () => clearInterval(interval);
  }, [currentBalance, depositedAmount, apy]);

  // Format with 6 decimal places (USDC precision)
  const formatEarned = (value: number): string => {
    const formatted = value.toFixed(6);
    const parts = formatted.split('.');
    const integerPart = parseInt(parts[0]).toLocaleString('en-US');
    return `+$${integerPart}.${parts[1]}`;
  };

  return (
    <Text style={animatedEarnedStyles.earned}>
      {formatEarned(displayEarned)}
    </Text>
  );
}

const animatedEarnedStyles = StyleSheet.create({
  earned: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.secondary,
    fontVariant: ['tabular-nums'],
  },
});

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
  const [isBuyingUsdc, setIsBuyingUsdc] = React.useState(false);
  const [prefetchedOnrampUrl, setPrefetchedOnrampUrl] = React.useState<string | null>(null);
  const [isCheckingFunds, setIsCheckingFunds] = React.useState(false);
  const [wasInCoinbase, setWasInCoinbase] = React.useState(false);
  const [showHowItWorks, setShowHowItWorks] = React.useState(false);
  const [totalDeposited, setTotalDeposited] = React.useState(0);

  // Pulse animation for earning indicator
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

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

  const { usdc, isLoading: balanceLoading, refetch: refetchBalances } = useWalletBalance(displayAddress);
  const { totalUsdValue: savingsTotal, isLoading: positionsLoading, refetch: refetchPositions } = usePositions(displayAddress);

  const isLoading = balanceLoading || positionsLoading;

  const cashBalance = usdc ? parseFloat(usdc.balance) : 0;
  const savingsBalance = parseFloat(savingsTotal) || 0;
  const totalBalance = cashBalance + savingsBalance;

  // Calculate earnings
  const totalEarned = totalDeposited > 0 ? Math.max(0, savingsBalance - totalDeposited) : 0;
  const dailyEarnings = (savingsBalance * (parseFloat(displayApy) / 100)) / 365;

  // Load total deposited
  React.useEffect(() => {
    const loadDeposited = async () => {
      if (displayAddress) {
        const deposited = await getTotalDeposited(displayAddress);
        setTotalDeposited(deposited);
      }
    };
    loadDeposited();
  }, [displayAddress, savingsBalance]);

  React.useEffect(() => {
    if (showFundingModal && displayAddress) {
      getOnrampSessionUrl(displayAddress).then((url) => {
        if (url) setPrefetchedOnrampUrl(url);
      });
    } else {
      setPrefetchedOnrampUrl(null);
    }
  }, [showFundingModal, displayAddress]);

  React.useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && wasInCoinbase) {
        setWasInCoinbase(false);
        setIsCheckingFunds(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        await Promise.all([refetchBalances(), refetchPositions()]);
        setIsCheckingFunds(false);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [wasInCoinbase, refetchBalances, refetchPositions]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBalances(), refetchPositions(), refetchApy()]);
    setRefreshing(false);
  }, [refetchBalances, refetchPositions, refetchApy]);

  const handleSettings = () => {
    Alert.alert(
      'Settings',
      'What would you like to do?',
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

  const handleBuyWithCard = async () => {
    if (isBuyingUsdc) return;
    if (!displayAddress) {
      Alert.alert('Error', 'No wallet address available');
      return;
    }

    const urlToOpen = prefetchedOnrampUrl;
    setShowFundingModal(false);
    setIsBuyingUsdc(true);

    try {
      if (urlToOpen) {
        setWasInCoinbase(true);
        await Linking.openURL(urlToOpen);
      } else {
        setWasInCoinbase(true);
        await openCoinbaseOnramp(displayAddress);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open payment provider');
    } finally {
      setIsBuyingUsdc(false);
    }
  };

  const closeFundingModal = () => {
    setShowFundingModal(false);
    setFundingView('options');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.secondary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <Ionicons name="arrow-up" size={16} color={COLORS.white} />
            </View>
            <Text style={styles.logoText}>unflat</Text>
          </View>
          <TouchableOpacity style={styles.settingsButton} onPress={handleSettings}>
            <Ionicons name="settings-outline" size={22} color={COLORS.grey} />
          </TouchableOpacity>
        </View>

        {/* Main Balance Section */}
        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.secondary} style={{ marginVertical: 20 }} />
          ) : (
            <>
              <AnimatedBalance
                balance={totalBalance}
                apy={parseFloat(displayApy)}
                isEarning={savingsBalance > 0}
              />
              <Text style={styles.balanceSubtext}>Across 2 accounts</Text>
            </>
          )}
        </View>

        {/* Cash Account Card */}
        {!isLoading && (
          <View style={styles.cashCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconContainer}>
                <Ionicons name="wallet-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.cardTitleContainer}>
                <Text style={styles.cardTitle}>Cash</Text>
                <Text style={styles.cardSubtitle}>Available to use or invest</Text>
              </View>
            </View>
            <Text style={styles.cashBalance}>${cashBalance.toFixed(2)}</Text>
            <TouchableOpacity
              style={styles.addFundsButton}
              onPress={() => setShowFundingModal(true)}
            >
              <Ionicons name="add" size={18} color={COLORS.white} />
              <Text style={styles.addFundsButtonText}>Add Funds</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Savings Account Card */}
        {!isLoading && (
          <View style={styles.savingsCard}>
            <View style={styles.cardHeader}>
              <View style={styles.savingsIconContainer}>
                <Ionicons name="trending-up" size={20} color={COLORS.white} />
              </View>
              <View style={styles.cardTitleContainer}>
                <Text style={styles.cardTitle}>Savings</Text>
                <View style={styles.apyBadge}>
                  <Animated.View style={[styles.apyDot, { transform: [{ scale: pulseAnim }] }]} />
                  <Text style={styles.apyBadgeText}>
                    <Text style={styles.apyNumber}>{displayApy}%</Text> APY
                  </Text>
                </View>
              </View>
            </View>

            {savingsBalance > 0 ? (
              <>
                <AnimatedBalance
                  balance={savingsBalance}
                  apy={parseFloat(displayApy)}
                  isEarning={true}
                  size="medium"
                />
                <View style={styles.savingsBreakdown}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Deposited</Text>
                    <Text style={styles.breakdownValue}>${totalDeposited.toFixed(2)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Earned</Text>
                    <AnimatedEarned
                      currentBalance={savingsBalance}
                      depositedAmount={totalDeposited}
                      apy={parseFloat(displayApy)}
                    />
                  </View>
                </View>
                <View style={styles.savingsButtons}>
                  <TouchableOpacity
                    style={styles.startEarningButton}
                    onPress={() => navigation.navigate('Strategies')}
                  >
                    <Text style={styles.startEarningButtonText}>Add More</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.withdrawButton}
                    onPress={() => navigation.navigate('Strategies')}
                  >
                    <Text style={styles.withdrawButtonText}>Withdraw</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateTitle}>Start earning today</Text>
                  <Text style={styles.emptyStateText}>
                    Your money grows while you sleep. Withdraw anytime.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.startEarningButton}
                  onPress={() => navigation.navigate('Strategies')}
                >
                  <Text style={styles.startEarningButtonText}>Start Earning</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Trust Indicators */}
        <View style={styles.trustSection}>
          <View style={styles.trustItem}>
            <Ionicons name="lock-closed-outline" size={16} color={COLORS.white} />
            <Text style={styles.trustText}>Non-custodial</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="flash-outline" size={16} color={COLORS.white} />
            <Text style={styles.trustText}>No gas fees</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="arrow-undo-outline" size={16} color={COLORS.white} />
            <Text style={styles.trustText}>Exit anytime</Text>
          </View>
        </View>

        {/* How It Works (Expandable) */}
        <TouchableOpacity
          style={styles.howItWorksToggle}
          onPress={() => setShowHowItWorks(!showHowItWorks)}
        >
          <Text style={styles.howItWorksToggleText}>How does it work?</Text>
          <Ionicons
            name={showHowItWorks ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={COLORS.grey}
          />
        </TouchableOpacity>

        {showHowItWorks && (
          <View style={styles.howItWorksContent}>
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
              <Text style={styles.stepText}>Add USDC to your account</Text>
            </View>
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
              <Text style={styles.stepText}>We allocate across trusted managers</Text>
            </View>
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
              <Text style={styles.stepText}>You earn yield, withdraw anytime</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Loading Overlays */}
      {(isBuyingUsdc || isCheckingFunds) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={styles.loadingText}>
            {isBuyingUsdc ? 'Opening payment...' : 'Updating balance...'}
          </Text>
        </View>
      )}

      {/* Add Funds Modal */}
      <Modal
        visible={showFundingModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeFundingModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              {fundingView === 'receive' ? (
                <TouchableOpacity style={styles.modalHeaderButton} onPress={() => setFundingView('options')}>
                  <Ionicons name="chevron-back" size={20} color={COLORS.white} />
                </TouchableOpacity>
              ) : (
                <View style={styles.modalHeaderButton} />
              )}
              <Text style={styles.modalTitle}>Add Funds</Text>
              <TouchableOpacity style={styles.modalHeaderButton} onPress={closeFundingModal}>
                <Ionicons name="close" size={20} color={COLORS.grey} />
              </TouchableOpacity>
            </View>

            {fundingView === 'options' ? (
              <View style={styles.optionsContainer}>
                <TouchableOpacity style={styles.fundingOption} onPress={() => setFundingView('receive')}>
                  <View style={styles.fundingOptionIcon}>
                    <Ionicons name="arrow-down" size={24} color={COLORS.white} />
                  </View>
                  <View style={styles.fundingOptionContent}>
                    <Text style={styles.fundingOptionTitle}>Transfer USDC</Text>
                    <Text style={styles.fundingOptionSubtitle}>Send from any wallet</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.fundingOption} onPress={handleBuyWithCard}>
                  <View style={styles.fundingOptionIcon}>
                    <Ionicons name="card-outline" size={24} color={COLORS.white} />
                  </View>
                  <View style={styles.fundingOptionContent}>
                    <Text style={styles.fundingOptionTitle}>Buy with Card</Text>
                    <Text style={styles.fundingOptionSubtitle}>Via Coinbase</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.receiveContainer}>
                <View style={styles.qrContainer}>
                  {displayAddress ? (
                    <QRCode value={displayAddress} size={160} backgroundColor="#ffffff" color="#000000" />
                  ) : (
                    <View style={styles.qrPlaceholder}><Text style={styles.qrPlaceholderText}>No wallet</Text></View>
                  )}
                </View>

                <Text style={styles.receiveInstructions}>Send USDC on Base network</Text>

                <View style={styles.addressBox}>
                  <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                    {displayAddress || 'No address'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.copyButton, copied && styles.copyButtonCopied]}
                  onPress={handleCopyAddress}
                >
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? COLORS.secondary : COLORS.white} />
                  <Text style={[styles.copyButtonText, copied && styles.copyButtonTextCopied]}>
                    {copied ? 'Copied!' : 'Copy Address'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.networkInfo}>
                  <View style={styles.networkDot} />
                  <Text style={styles.networkText}>Base Network only</Text>
                </View>
              </View>
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
    backgroundColor: COLORS.black,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(32, 1, 145, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(72, 72, 72, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Balance Section
  balanceSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  balanceLabel: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 8,
  },
  balanceSubtext: {
    fontSize: 13,
    color: COLORS.grey,
    marginTop: 8,
  },
  // Cash Card
  cashCard: {
    backgroundColor: 'rgba(72, 72, 72, 0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(72, 72, 72, 0.15)',
    padding: 20,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(72, 72, 72, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  savingsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(32, 1, 145, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.grey,
    marginTop: 2,
  },
  cashBalance: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 16,
    fontVariant: ['tabular-nums'],
  },
  addFundsButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.secondary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addFundsButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  // Savings Card
  savingsCard: {
    backgroundColor: 'rgba(32, 1, 145, 0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(32, 1, 145, 0.2)',
    padding: 20,
    marginBottom: 24,
  },
  apyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(32, 1, 145, 0.2)',
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 6,
  },
  apyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.secondary,
  },
  apyBadgeText: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: '500',
  },
  apyNumber: {
    color: COLORS.secondary,
    fontWeight: '600',
  },
  savingsBreakdown: {
    gap: 10,
    marginTop: 16,
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(32, 1, 145, 0.15)',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 14,
    color: COLORS.grey,
  },
  breakdownValue: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  breakdownValueAccent: {
    fontSize: 14,
    color: COLORS.secondary,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  savingsButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  startEarningButton: {
    flex: 1,
    backgroundColor: COLORS.secondary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  startEarningButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  withdrawButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.grey,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  withdrawButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 6,
  },
  emptyStateText: {
    fontSize: 13,
    color: COLORS.grey,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Trust Section
  trustSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    fontSize: 12,
    color: COLORS.grey,
  },
  // How It Works
  howItWorksToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  howItWorksToggleText: {
    fontSize: 14,
    color: COLORS.grey,
  },
  howItWorksContent: {
    backgroundColor: 'rgba(32, 1, 145, 0.05)',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(32, 1, 145, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  stepText: {
    fontSize: 14,
    color: COLORS.grey,
    flex: 1,
  },
  // Loading Overlay
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 4, 27, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.white,
    marginTop: 16,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.black,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    borderTopWidth: 1,
    borderColor: 'rgba(72, 72, 72, 0.2)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  modalHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(72, 72, 72, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  optionsContainer: {
    gap: 12,
  },
  fundingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(32, 1, 145, 0.08)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(32, 1, 145, 0.2)',
  },
  fundingOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(32, 1, 145, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  fundingOptionContent: {
    flex: 1,
  },
  fundingOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 4,
  },
  fundingOptionSubtitle: {
    fontSize: 14,
    color: COLORS.grey,
  },
  // Receive View
  receiveContainer: {
    alignItems: 'center',
  },
  qrContainer: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  qrPlaceholder: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrPlaceholderText: {
    color: COLORS.grey,
  },
  receiveInstructions: {
    fontSize: 15,
    color: COLORS.grey,
    marginBottom: 16,
  },
  addressBox: {
    backgroundColor: 'rgba(72, 72, 72, 0.15)',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    marginBottom: 16,
  },
  addressText: {
    fontSize: 13,
    color: COLORS.white,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
  },
  copyButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.secondary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  copyButtonCopied: {
    backgroundColor: 'rgba(32, 1, 145, 0.2)',
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  copyButtonTextCopied: {
    color: COLORS.secondary,
  },
  networkInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
  },
  networkText: {
    fontSize: 13,
    color: COLORS.grey,
  },
});
