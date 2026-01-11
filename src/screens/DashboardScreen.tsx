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
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  Image,
} from 'react-native';
import { encodeFunctionData, parseUnits } from 'viem';
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
import { openCoinbaseOfframp } from '../services/coinbaseOfframp';
import { useDeepLink } from '../contexts/DeepLinkContext';
import * as Analytics from '../services/analytics';
import SensitiveView from '../components/SensitiveView';

// Color Palette - PayPal/Revolut Style
const COLORS = {
  primary: '#200191',
  secondary: '#6198FF',
  white: '#F5F6FF',
  grey: '#484848',
  black: '#00041B',
  pureWhite: '#FFFFFF',
  border: '#E8E8E8',
  success: '#22C55E',
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
    color: COLORS.black,
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
    color: COLORS.success,
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

  // Withdraw Cash Modal state
  const [showWithdrawModal, setShowWithdrawModal] = React.useState(false);
  const [withdrawMethod, setWithdrawMethod] = React.useState<'select' | 'wallet' | 'bank'>('select');
  const [withdrawAddress, setWithdrawAddress] = React.useState('');
  const [withdrawAmount, setWithdrawAmount] = React.useState('');
  const [isWithdrawingCash, setIsWithdrawingCash] = React.useState(false);
  const [isCashingOut, setIsCashingOut] = React.useState(false);

  // Offramp deep link state
  const [showOfframpTransfer, setShowOfframpTransfer] = React.useState(false);
  const [offrampParams, setOfframpParams] = React.useState<{
    toAddress: string;
    amount: string;
    expiresAt: string;
  } | null>(null);
  const [isOfframpProcessing, setIsOfframpProcessing] = React.useState(false);

  // Pulse animation for earning indicator
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // Analytics: Track screen view on mount
  React.useEffect(() => {
    Analytics.trackScreenView('Dashboard');
    return () => Analytics.trackScreenExit('Dashboard');
  }, []);

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

  // Handle offramp deep link from context
  const { pendingOfframp, clearPendingOfframp } = useDeepLink();

  React.useEffect(() => {
    if (pendingOfframp) {
      // Check if expired
      if (pendingOfframp.expiresAt && new Date(pendingOfframp.expiresAt) < new Date()) {
        Alert.alert('Expired', 'The cash out window has expired (30 min). Please try again.');
        clearPendingOfframp();
        return;
      }

      setOfframpParams({
        toAddress: pendingOfframp.toAddress,
        amount: pendingOfframp.amount,
        expiresAt: pendingOfframp.expiresAt,
      });
      setShowOfframpTransfer(true);
      clearPendingOfframp();
    }
  }, [pendingOfframp, clearPendingOfframp]);

  // Handle offramp USDC transfer
  const handleOfframpTransfer = async () => {
    if (!offrampParams || !smartWalletClient) return;

    setIsOfframpProcessing(true);

    try {
      const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      const amountInUnits = parseUnits(offrampParams.amount, 6); // USDC has 6 decimals

      const data = encodeFunctionData({
        abi: [{
          name: 'transfer',
          type: 'function',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ type: 'bool' }],
        }],
        functionName: 'transfer',
        args: [offrampParams.toAddress as `0x${string}`, amountInUnits],
      });

      await smartWalletClient.sendTransaction({
        to: USDC_ADDRESS as `0x${string}`,
        data,
      });

      Alert.alert(
        'Transfer Complete!',
        'Your USDC has been sent to Coinbase. EUR will arrive in your bank in 1-2 business days.',
        [{ text: 'OK', onPress: () => setShowOfframpTransfer(false) }]
      );

      refetchBalances();

    } catch (error) {
      const errorMessage = (error as Error)?.message || 'Unknown error';
      Analytics.trackErrorDisplayed('offramp_transfer', errorMessage, 'Dashboard');
      Alert.alert('Transfer Failed', errorMessage || 'Something went wrong');
    } finally {
      setIsOfframpProcessing(false);
    }
  };

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
    const timer = Analytics.createTimer();
    await Promise.all([refetchBalances(), refetchPositions(), refetchApy()]);
    Analytics.trackBalanceFetchDuration(timer.stop());
    Analytics.trackBalanceRefreshed(cashBalance, savingsBalance, totalEarned);
    setRefreshing(false);
  }, [refetchBalances, refetchPositions, refetchApy, cashBalance, savingsBalance, totalEarned]);

  const handleSettings = () => {
    Analytics.trackButtonTap('Settings', 'Dashboard');
    Alert.alert(
      'Settings',
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            Analytics.trackLogout();
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
      Analytics.trackAddressCopied('Dashboard');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBuyWithCard = async () => {
    if (isBuyingUsdc) return;
    if (!displayAddress) {
      Alert.alert('Error', 'No wallet address available');
      Analytics.trackOnrampError('No wallet address');
      return;
    }

    Analytics.trackOnrampButtonTapped();
    Analytics.trackOnrampProviderOpened('Coinbase');

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
      Analytics.trackOnrampError((error as Error)?.message || 'Unknown error');
      Alert.alert('Error', 'Could not open payment provider');
    } finally {
      setIsBuyingUsdc(false);
    }
  };

  const closeFundingModal = () => {
    Analytics.trackModalClosed('AddFunds', 'button');
    setShowFundingModal(false);
    setFundingView('options');
  };

  const closeWithdrawModal = () => {
    Analytics.trackModalClosed('Withdraw', 'button');
    setShowWithdrawModal(false);
    setWithdrawAddress('');
    setWithdrawAmount('');
    setWithdrawMethod('select');
  };

  const handleWithdrawCashReview = () => {
    // Address validation
    if (!withdrawAddress.startsWith('0x') || withdrawAddress.length !== 42) {
      Alert.alert('Invalid Address', 'Please enter a valid Ethereum address (0x...)');
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    if (amount > cashBalance) {
      Alert.alert('Insufficient Balance', `You only have $${cashBalance.toFixed(2)} available`);
      return;
    }

    // Show confirmation
    Alert.alert(
      'Confirm Withdrawal',
      `Send: $${amount.toFixed(2)} USDC\nTo: ${withdrawAddress.slice(0, 6)}...${withdrawAddress.slice(-4)}\nNetwork: Base\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Send',
          onPress: executeWithdrawCash,
        },
      ]
    );
  };

  const executeWithdrawCash = async () => {
    if (!smartWalletClient || !displayAddress) {
      Alert.alert('Error', 'Wallet not connected');
      return;
    }

    setIsWithdrawingCash(true);

    try {
      const amount = parseFloat(withdrawAmount);
      const amountRaw = BigInt(Math.floor(amount * 1_000_000)); // USDC has 6 decimals

      // Build transfer call
      const transferData = encodeFunctionData({
        abi: [
          {
            name: 'transfer',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          },
        ],
        functionName: 'transfer',
        args: [withdrawAddress as `0x${string}`, amountRaw],
      });

      const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base

      const hash = await smartWalletClient.sendTransaction({
        to: USDC_ADDRESS as `0x${string}`,
        data: transferData,
        value: BigInt(0),
      });

      // Close modal and reset
      closeWithdrawModal();

      // Refresh balances
      refetchBalances();

      Alert.alert(
        'Sent Successfully!',
        `$${amount.toFixed(2)} USDC sent to ${withdrawAddress.slice(0, 6)}...${withdrawAddress.slice(-4)}`,
        [
          { text: 'OK' },
          {
            text: 'View on BaseScan',
            onPress: () => Linking.openURL(`https://basescan.org/tx/${hash}`),
          },
        ]
      );
    } catch (error) {
      Alert.alert('Failed', (error as Error)?.message || 'Transaction failed. Please try again.');
    } finally {
      setIsWithdrawingCash(false);
    }
  };

  const handleCashOutToBank = async () => {
    const amount = parseFloat(withdrawAmount);

    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    if (amount > cashBalance) {
      Alert.alert('Insufficient Balance', `You only have $${cashBalance.toFixed(2)} available`);
      return;
    }

    if (!displayAddress) {
      Alert.alert('Error', 'Wallet not connected');
      return;
    }

    Analytics.trackOfframpButtonTapped();
    Analytics.trackOfframpAmountEntered(withdrawAmount);
    Analytics.trackOfframpProviderOpened('Coinbase');

    setIsCashingOut(true);

    try {
      const result = await openCoinbaseOfframp(displayAddress, withdrawAmount);

      if (!result.success) {
        Analytics.trackOfframpError(result.error || 'Unknown error');
        Alert.alert(
          'Unable to Connect',
          result.error || 'Could not connect to Coinbase. Please try again later.',
          [{ text: 'OK' }]
        );
      } else {
        // Close modal after opening Coinbase
        closeWithdrawModal();

        // Refresh balances after returning from Coinbase
        setTimeout(() => {
          refetchBalances();
        }, 2000);
      }
    } catch (error) {
      Analytics.trackOfframpError((error as Error)?.message || 'Unknown error');
      Alert.alert('Error', (error as Error)?.message || 'Something went wrong');
    } finally {
      setIsCashingOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/logo_full.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <TouchableOpacity style={styles.settingsButton} onPress={handleSettings}>
            <Ionicons name="settings-outline" size={22} color={COLORS.grey} />
          </TouchableOpacity>
        </View>

        {/* Main Balance Section */}
        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 20 }} />
          ) : (
            <>
              <SensitiveView>
                <AnimatedBalance
                  balance={totalBalance}
                  apy={parseFloat(displayApy)}
                  isEarning={savingsBalance > 0}
                />
              </SensitiveView>
              <Text style={styles.balanceSubtext}>Across 2 accounts</Text>
            </>
          )}
        </View>

        {/* Cash Account Card */}
        {!isLoading && (
          <View style={styles.cashCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconContainer}>
                <Ionicons name="wallet-outline" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.cardTitleContainer}>
                <Text style={styles.cardTitle}>Cash</Text>
                <Text style={styles.cardSubtitle}>Available to use or invest</Text>
              </View>
            </View>
            <SensitiveView>
              <Text style={styles.cashBalance}>${cashBalance.toFixed(2)}</Text>
            </SensitiveView>
            <View style={styles.cashButtonsRow}>
              <TouchableOpacity
                style={[styles.cashButton, styles.addFundsButtonStyle]}
                onPress={() => setShowFundingModal(true)}
              >
                <Ionicons name="add" size={18} color={COLORS.pureWhite} />
                <Text style={styles.cashButtonText}>Add Funds</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cashButton, styles.withdrawCashButton, cashBalance <= 0 && styles.withdrawCashButtonDisabled]}
                onPress={() => setShowWithdrawModal(true)}
                disabled={cashBalance <= 0}
              >
                <Ionicons name="arrow-up-outline" size={18} color={cashBalance > 0 ? COLORS.primary : COLORS.grey} />
                <Text style={[styles.withdrawCashButtonText, cashBalance <= 0 && styles.buttonTextDisabled]}>
                  Withdraw
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Savings Account Card */}
        {!isLoading && (
          <View style={styles.savingsCard}>
            <View style={styles.savingsAccent} />
            <View style={styles.savingsContent}>
              <View style={styles.cardHeader}>
                <View style={styles.savingsIconContainer}>
                  <Ionicons name="trending-up" size={20} color={COLORS.secondary} />
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
                  <SensitiveView>
                    <AnimatedBalance
                      balance={savingsBalance}
                      apy={parseFloat(displayApy)}
                      isEarning={true}
                      size="medium"
                    />
                  </SensitiveView>
                  <SensitiveView>
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
                  </SensitiveView>
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
          </View>
        )}

        {/* Trust Indicators */}
        <View style={styles.trustSection}>
          <View style={styles.trustItem}>
            <Ionicons name="lock-closed-outline" size={16} color={COLORS.primary} />
            <Text style={styles.trustText}>Non-custodial</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="flash-outline" size={16} color={COLORS.primary} />
            <Text style={styles.trustText}>No gas fees</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="arrow-undo-outline" size={16} color={COLORS.primary} />
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
          <ActivityIndicator size="large" color={COLORS.primary} />
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
                  <Ionicons name="chevron-back" size={20} color={COLORS.black} />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 40 }} />
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
                    <Ionicons name="arrow-down" size={24} color={COLORS.primary} />
                  </View>
                  <View style={styles.fundingOptionContent}>
                    <Text style={styles.fundingOptionTitle}>Transfer USDC</Text>
                    <Text style={styles.fundingOptionSubtitle}>Send from any wallet</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.fundingOption} onPress={handleBuyWithCard}>
                  <View style={styles.fundingOptionIcon}>
                    <Ionicons name="card-outline" size={24} color={COLORS.primary} />
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
                    <QRCode value={displayAddress} size={160} backgroundColor="#ffffff" color={COLORS.primary} />
                  ) : (
                    <View style={styles.qrPlaceholder}><Text style={styles.qrPlaceholderText}>No wallet</Text></View>
                  )}
                </View>

                <Text style={styles.receiveInstructions}>Send USDC on Base network</Text>

                <SensitiveView>
                  <View style={styles.addressBox}>
                    <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                      {displayAddress || 'No address'}
                    </Text>
                  </View>
                </SensitiveView>

                <TouchableOpacity
                  style={[styles.copyButton, copied && styles.copyButtonCopied]}
                  onPress={handleCopyAddress}
                >
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={COLORS.pureWhite} />
                  <Text style={styles.copyButtonText}>
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

      {/* Withdraw Cash Modal */}
      <Modal
        visible={showWithdrawModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeWithdrawModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              {withdrawMethod !== 'select' ? (
                <TouchableOpacity
                  style={styles.modalHeaderButton}
                  onPress={() => {
                    setWithdrawMethod('select');
                    setWithdrawAmount('');
                  }}
                >
                  <Ionicons name="chevron-back" size={20} color={COLORS.black} />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 40 }} />
              )}
              <Text style={styles.modalTitle}>
                {withdrawMethod === 'select' && 'Withdraw'}
                {withdrawMethod === 'wallet' && 'Send to Wallet'}
                {withdrawMethod === 'bank' && 'Cash Out to Bank'}
              </Text>
              <TouchableOpacity style={styles.modalHeaderButton} onPress={closeWithdrawModal}>
                <Ionicons name="close" size={20} color={COLORS.grey} />
              </TouchableOpacity>
            </View>

            {/* Method Selection */}
            {withdrawMethod === 'select' && (
              <View style={styles.withdrawMethodsContainer}>
                <Text style={styles.withdrawMethodsSubtitle}>
                  Available: ${cashBalance.toFixed(2)} USDC
                </Text>

                {/* Send to Wallet Option */}
                <TouchableOpacity
                  style={styles.withdrawMethodOption}
                  onPress={() => setWithdrawMethod('wallet')}
                >
                  <View style={styles.withdrawMethodIcon}>
                    <Ionicons name="wallet-outline" size={24} color={COLORS.secondary} />
                  </View>
                  <View style={styles.withdrawMethodContent}>
                    <Text style={styles.withdrawMethodTitle}>Send to Wallet</Text>
                    <Text style={styles.withdrawMethodSubtitle}>USDC on Base network</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
                </TouchableOpacity>

                {/* Cash Out to Bank Option */}
                <TouchableOpacity
                  style={styles.withdrawMethodOption}
                  onPress={() => setWithdrawMethod('bank')}
                >
                  <View style={[styles.withdrawMethodIcon, { backgroundColor: `${COLORS.success}15` }]}>
                    <Ionicons name="business-outline" size={24} color={COLORS.success} />
                  </View>
                  <View style={styles.withdrawMethodContent}>
                    <Text style={styles.withdrawMethodTitle}>Cash Out to Bank</Text>
                    <Text style={styles.withdrawMethodSubtitle}>Via Coinbase • EUR to bank account</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
                </TouchableOpacity>

                {/* Info */}
                <View style={styles.withdrawInfoBanner}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.grey} />
                  <Text style={styles.withdrawInfoText}>
                    Cash out requires a Coinbase account with linked EU bank (SEPA).
                  </Text>
                </View>
              </View>
            )}

            {/* Wallet Withdrawal */}
            {withdrawMethod === 'wallet' && (
              <>
                {/* Send To Field */}
                <View style={styles.withdrawInputSection}>
                  <Text style={styles.withdrawInputLabel}>Send to</Text>
                  <View style={styles.addressInputRow}>
                    <View style={styles.addressInputIcon}>
                      <Ionicons name="wallet-outline" size={20} color={COLORS.secondary} />
                    </View>
                    <TextInput
                      style={styles.addressInput}
                      value={withdrawAddress}
                      onChangeText={setWithdrawAddress}
                      placeholder="0x... wallet address"
                      placeholderTextColor={COLORS.grey}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.qrScanButton}
                      onPress={() => Alert.alert('Coming Soon', 'QR scanner coming in a future update')}
                    >
                      <Ionicons name="qr-code-outline" size={22} color={COLORS.grey} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Amount Field */}
                <View style={styles.withdrawInputSection}>
                  <Text style={styles.withdrawInputLabel}>Amount</Text>
                  <View style={styles.amountInputRow}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={withdrawAmount}
                      onChangeText={(val) => {
                        const sanitized = val.replace(/[^0-9.]/g, '');
                        if (parseFloat(sanitized) > cashBalance) {
                          setWithdrawAmount(cashBalance.toFixed(2));
                        } else {
                          setWithdrawAmount(sanitized);
                        }
                      }}
                      placeholder="0.00"
                      placeholderTextColor={COLORS.grey}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.availableRow}>
                    <Text style={styles.availableText}>Available</Text>
                    <Text style={styles.availableAmount}>${cashBalance.toFixed(6)}</Text>
                    <TouchableOpacity
                      style={styles.maxButtonSmall}
                      onPress={() => setWithdrawAmount(cashBalance.toFixed(2))}
                    >
                      <Text style={styles.maxButtonSmallText}>Max</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Network Info */}
                <View style={styles.networkInfoRow}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.grey} />
                  <Text style={styles.networkInfoText}>
                    Sending USDC on Base network. Make sure the recipient address supports Base.
                  </Text>
                </View>

                {/* Review Button */}
                <TouchableOpacity
                  style={[
                    styles.reviewButton,
                    (!withdrawAddress || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || isWithdrawingCash) && styles.reviewButtonDisabled
                  ]}
                  onPress={handleWithdrawCashReview}
                  disabled={!withdrawAddress || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || isWithdrawingCash}
                >
                  {isWithdrawingCash ? (
                    <ActivityIndicator color={COLORS.pureWhite} />
                  ) : (
                    <Text style={styles.reviewButtonText}>Review</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Bank Cash Out */}
            {withdrawMethod === 'bank' && (
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.bankCashoutContainer}>
                  {/* Amount Input */}
                  <View style={styles.withdrawInputSection}>
                    <Text style={styles.withdrawInputLabel}>Amount to cash out</Text>
                    <View style={styles.amountInputRow}>
                      <Text style={styles.currencySymbol}>$</Text>
                      <TextInput
                        style={styles.amountInput}
                        value={withdrawAmount}
                        onChangeText={(val) => {
                          const sanitized = val.replace(/[^0-9.]/g, '');
                          if (parseFloat(sanitized) > cashBalance) {
                            setWithdrawAmount(cashBalance.toFixed(2));
                          } else {
                            setWithdrawAmount(sanitized);
                          }
                        }}
                        placeholder="0.00"
                        placeholderTextColor={COLORS.grey}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        onSubmitEditing={() => Keyboard.dismiss()}
                        blurOnSubmit={true}
                      />
                    </View>
                    <View style={styles.availableRow}>
                      <Text style={styles.availableText}>Available</Text>
                      <Text style={styles.availableAmount}>${cashBalance.toFixed(2)}</Text>
                      <TouchableOpacity
                        style={styles.maxButtonSmall}
                        onPress={() => setWithdrawAmount(cashBalance.toFixed(2))}
                      >
                        <Text style={styles.maxButtonSmallText}>Max</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Compact Info */}
                  <View style={styles.compactInfoRow}>
                    <Ionicons name="information-circle-outline" size={16} color={COLORS.grey} />
                    <Text style={styles.compactInfoText}>
                      EUR via SEPA • Requires Coinbase account
                    </Text>
                  </View>

                  {/* Continue Button */}
                  <TouchableOpacity
                    style={[
                      styles.reviewButton,
                      (!withdrawAmount || parseFloat(withdrawAmount) <= 0 || isCashingOut) && styles.reviewButtonDisabled
                    ]}
                    onPress={handleCashOutToBank}
                    disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || isCashingOut}
                  >
                    {isCashingOut ? (
                      <ActivityIndicator color={COLORS.pureWhite} />
                    ) : (
                      <View style={styles.reviewButtonContent}>
                        <Ionicons name="open-outline" size={18} color={COLORS.pureWhite} />
                        <Text style={styles.reviewButtonText}>Continue to Coinbase</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            )}
          </View>
        </View>
      </Modal>

      {/* Offramp Transfer Confirmation Modal */}
      <Modal
        visible={showOfframpTransfer}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ width: 40 }} />
              <Text style={styles.modalTitle}>Complete Cash Out</Text>
              <TouchableOpacity
                style={styles.modalHeaderButton}
                onPress={() => setShowOfframpTransfer(false)}
              >
                <Ionicons name="close" size={20} color={COLORS.grey} />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <View style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 16,
              }}>
                <Ionicons name="business-outline" size={36} color="#22C55E" />
              </View>

              <Text style={{ color: COLORS.black, fontSize: 24, fontWeight: '600' }}>
                ${offrampParams?.amount} USDC
              </Text>
              <Text style={{ color: COLORS.grey, fontSize: 15, marginTop: 8, textAlign: 'center' }}>
                Will be sent to Coinbase for{'\n'}conversion to EUR
              </Text>
            </View>

            <View style={styles.compactInfoRow}>
              <Ionicons name="flash-outline" size={16} color="#22C55E" />
              <Text style={{ color: COLORS.grey, fontSize: 14 }}>
                Gasless transaction • No fees
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.reviewButton,
                isOfframpProcessing && styles.reviewButtonDisabled
              ]}
              onPress={handleOfframpTransfer}
              disabled={isOfframpProcessing}
            >
              {isOfframpProcessing ? (
                <ActivityIndicator color={COLORS.pureWhite} />
              ) : (
                <Text style={styles.reviewButtonText}>Confirm & Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
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
  headerLogo: {
    width: 100,
    height: 32,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.pureWhite,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
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
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
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
    backgroundColor: `${COLORS.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  savingsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${COLORS.secondary}15`,
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
    color: COLORS.black,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.grey,
    marginTop: 2,
  },
  cashBalance: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 16,
    fontVariant: ['tabular-nums'],
  },
  // Cash button row styles
  cashButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cashButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  addFundsButtonStyle: {
    backgroundColor: COLORS.primary,
  },
  cashButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  withdrawCashButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  withdrawCashButtonDisabled: {
    borderColor: COLORS.grey,
  },
  withdrawCashButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  buttonTextDisabled: {
    color: COLORS.grey,
  },
  // Savings Card
  savingsCard: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  savingsAccent: {
    width: 4,
    backgroundColor: COLORS.secondary,
  },
  savingsContent: {
    flex: 1,
    padding: 20,
  },
  apyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: `${COLORS.secondary}15`,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 6,
  },
  apyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  apyBadgeText: {
    fontSize: 12,
    color: COLORS.grey,
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
    borderTopColor: COLORS.border,
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
    color: COLORS.black,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  savingsButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  startEarningButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  startEarningButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  withdrawButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  withdrawButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.black,
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
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
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
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.pureWhite,
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
    backgroundColor: 'rgba(0, 4, 27, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.pureWhite,
    marginTop: 16,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 4, 27, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.pureWhite,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    minHeight: 480,
    maxHeight: '85%',
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
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  optionsContainer: {
    gap: 12,
  },
  fundingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fundingOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${COLORS.primary}10`,
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
    color: COLORS.black,
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
    backgroundColor: COLORS.pureWhite,
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: COLORS.primary,
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
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addressText: {
    fontSize: 13,
    color: COLORS.black,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
  },
  copyButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  copyButtonCopied: {
    backgroundColor: COLORS.success,
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  networkInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${COLORS.secondary}15`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
  },
  networkText: {
    fontSize: 13,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  // Withdraw Modal styles
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  withdrawInputSection: {
    marginBottom: 20,
  },
  withdrawInputLabel: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 8,
  },
  addressInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  addressInputIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${COLORS.secondary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  addressInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.black,
  },
  qrScanButton: {
    padding: 8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.grey,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.black,
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 8,
  },
  availableText: {
    fontSize: 14,
    color: COLORS.grey,
  },
  availableAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
  },
  maxButtonSmall: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  maxButtonSmallText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  networkInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${COLORS.secondary}10`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  networkInfoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.grey,
    lineHeight: 18,
  },
  reviewButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  reviewButtonDisabled: {
    backgroundColor: COLORS.grey,
    opacity: 0.5,
  },
  reviewButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  reviewButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Withdraw method selection styles
  withdrawMethodsContainer: {
    paddingTop: 8,
  },
  withdrawMethodsSubtitle: {
    fontSize: 15,
    color: COLORS.grey,
    textAlign: 'center',
    marginBottom: 24,
  },
  withdrawMethodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  withdrawMethodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${COLORS.secondary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  withdrawMethodContent: {
    flex: 1,
  },
  withdrawMethodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 2,
  },
  withdrawMethodSubtitle: {
    fontSize: 13,
    color: COLORS.grey,
  },
  withdrawInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.grey}10`,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  withdrawInfoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.grey,
    lineHeight: 18,
  },
  // Bank cashout styles
  bankCashoutContainer: {
    marginTop: 8,
  },
  compactInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 8,
    marginBottom: 16,
  },
  compactInfoText: {
    fontSize: 14,
    color: COLORS.grey,
  },
  coinbaseInfoCard: {
    backgroundColor: `${COLORS.success}10`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  coinbaseInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  coinbaseInfoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.black,
  },
  coinbaseInfoStep: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 6,
    paddingLeft: 4,
  },
  requirementsNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  requirementsText: {
    flex: 1,
    fontSize: 13,
    color: '#EAB308',
    lineHeight: 18,
  },
});
