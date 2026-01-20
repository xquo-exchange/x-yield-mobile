import React, { useCallback, useMemo } from 'react';
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
import { NativeStackNavigationProp, RouteProp } from '@react-navigation/native-stack';
import { usePrivy, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';

import { RootStackParamList } from '../navigation/AppNavigator';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { usePositions } from '../hooks/usePositions';
import { useVaultApy } from '../hooks/useVaultApy';
import { getNetDepositedFromBlockchain } from '../services/transactionHistory';
import { openCoinbaseOnramp, getOnrampSessionUrl } from '../services/coinbaseOnramp';
import { openCoinbaseOfframp } from '../services/coinbaseOfframp';
import { useDeepLink } from '../contexts/DeepLinkContext';
import * as Analytics from '../services/analytics';
import {
  trackAchievementsModalOpened,
  trackAchievementsModalClosed,
  trackSavingsGoalSet,
  trackSavingsGoalCleared,
  trackSavingsGoalReached,
  trackTrustSignalViewed,
} from '../services/analytics';
import SensitiveView from '../components/SensitiveView';
import SavingsGoalCard from '../components/SavingsGoalCard';
import SetGoalModal from '../components/SetGoalModal';
import CelebrationModal from '../components/CelebrationModal';
import BadgeToast from '../components/BadgeToast';
import AchievementsModal from '../components/AchievementsModal';
import OnboardingTutorial from '../components/OnboardingTutorial';
import { useOnboardingTutorial, TUTORIAL_STEPS } from '../hooks/useOnboardingTutorial';
import {
  getSavingsGoal,
  setSavingsGoal,
  clearSavingsGoal,
  markGoalReached,
  SavingsGoal,
} from '../services/savingsGoal';
import {
  getBadges,
  getBadgeStats,
  getBadgeDefinition,
  checkAndAwardBadges,
  trackAppOpen,
  BadgesData,
  BadgeStats,
  BadgeDefinition,
} from '../services/badges';
import { getErrorMessage } from '../utils/errorHelpers';
import { COLORS } from '../constants/colors';
import { AnimatedBalance, AnimatedEarned } from '../components/AnimatedBalance';

type DashboardScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
  route: RouteProp<RootStackParamList, 'Dashboard'>;
};

export default function DashboardScreen({ navigation, route }: DashboardScreenProps) {
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

  // Refresh success toast state
  const [showUpdatedToast, setShowUpdatedToast] = React.useState(false);
  const toastOpacity = React.useRef(new Animated.Value(0)).current;
  const toastTranslateY = React.useRef(new Animated.Value(-20)).current;

  // Savings goal state
  const [savingsGoal, setSavingsGoalState] = React.useState<SavingsGoal | null>(null);
  const [showGoalModal, setShowGoalModal] = React.useState(false);
  const [showGoalCelebration, setShowGoalCelebration] = React.useState(false);

  // Badge/Achievement state
  const [badges, setBadges] = React.useState<BadgesData>({});
  const [badgeStats, setBadgeStats] = React.useState<BadgeStats>({
    depositCount: 0,
    withdrawalCount: 0,
    currentBalance: 0,
    totalDeposits: 0,
    highestBalance: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastOpenDate: null,
    goalsCompleted: 0,
  });
  const [showBadgeToast, setShowBadgeToast] = React.useState(false);
  const [earnedBadge, setEarnedBadge] = React.useState<BadgeDefinition | null>(null);
  const [showAchievements, setShowAchievements] = React.useState(false);

  // Onboarding tutorial
  const onboardingTutorial = useOnboardingTutorial();

  // Refs for tutorial targets and ScrollView
  const scrollViewRef = React.useRef<ScrollView>(null);
  const balanceRef = React.useRef<View>(null);
  const savingsRef = React.useRef<View>(null);
  const addFundsRef = React.useRef<View>(null);
  const settingsRef = React.useRef<View>(null);

  // Register tutorial target refs
  React.useEffect(() => {
    onboardingTutorial.registerTarget('balance', balanceRef);
    onboardingTutorial.registerTarget('savings', savingsRef);
    onboardingTutorial.registerTarget('addFunds', addFundsRef);
    onboardingTutorial.registerTarget('settings', settingsRef);
  }, [onboardingTutorial.registerTarget]);

  // Auto-scroll to highlighted element when tutorial step changes
  React.useEffect(() => {
    const scrollToTarget = async () => {
      if (!onboardingTutorial.isActive || !onboardingTutorial.currentStep) return;

      const stepId = onboardingTutorial.currentStep.id;

      // For welcome step (center), scroll to top
      if (stepId === 'welcome') {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }

      // For settings step, scroll to top (header is at top)
      if (stepId === 'settings' || stepId === 'balance') {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }

      // For other elements, measure and scroll if needed
      const layout = await onboardingTutorial.measureTarget(stepId);
      if (layout) {
        // If element is below visible area, scroll down
        // We want the element to be roughly in the upper third of the screen
        const targetY = Math.max(0, layout.y - 150);
        scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
      }
    };

    // Small delay to let the UI settle
    const timer = setTimeout(scrollToTarget, 150);
    return () => clearTimeout(timer);
  }, [onboardingTutorial.isActive, onboardingTutorial.currentStep, onboardingTutorial.measureTarget]);

  // Handle openAchievements navigation parameter from Settings
  React.useEffect(() => {
    if (route.params?.openAchievements) {
      setShowAchievements(true);
      // Clear the param to avoid reopening on re-render
      navigation.setParams({ openAchievements: undefined });
    }
  }, [route.params?.openAchievements, navigation]);

  // Handle restartTutorial navigation parameter from Settings
  React.useEffect(() => {
    if (route.params?.restartTutorial) {
      // Clear the param immediately to avoid retriggering
      navigation.setParams({ restartTutorial: undefined });

      // Scroll to top first, then reset and start tutorial
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });

      // Reset tutorial state and start after a delay
      const startTutorial = async () => {
        await onboardingTutorial.resetTutorial();
        // Wait for scroll and state to settle
        setTimeout(() => {
          onboardingTutorial.startTutorial();
        }, 300);
      };
      startTutorial();
    }
  }, [route.params?.restartTutorial, navigation, onboardingTutorial.resetTutorial, onboardingTutorial.startTutorial]);

  // Analytics: Track screen view on mount
  React.useEffect(() => {
    Analytics.trackScreenView('Dashboard');
    // Track trust signals viewed
    trackTrustSignalViewed('audited_contracts', 'Dashboard');
    trackTrustSignalViewed('non_custodial', 'Dashboard');
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
    (account) => account.type === 'smart_wallet'
  ) as { address?: string } | undefined;
  const smartWalletFromLinkedAccounts = smartWalletAccount?.address || '';
  const smartWalletAddress = smartWalletFromHook || smartWalletFromLinkedAccounts;
  const displayAddress = smartWalletAddress || embeddedWalletAddress;

  const { usdc, isLoading: balanceLoading, refetch: refetchBalances } = useWalletBalance(displayAddress);
  const { totalUsdValue: savingsTotal, isLoading: positionsLoading, refetch: refetchPositions } = usePositions(displayAddress);

  const isLoading = balanceLoading || positionsLoading;

  // Auto-start tutorial for first-time users after loading
  React.useEffect(() => {
    if (
      !onboardingTutorial.isLoading &&
      onboardingTutorial.shouldShowTutorial &&
      !onboardingTutorial.isActive &&
      !isLoading
    ) {
      // Small delay to let the screen settle
      const timer = setTimeout(() => {
        onboardingTutorial.startTutorial();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [
    onboardingTutorial.isLoading,
    onboardingTutorial.shouldShowTutorial,
    onboardingTutorial.isActive,
    isLoading,
    onboardingTutorial.startTutorial,
  ]);

  const cashBalance = usdc ? parseFloat(usdc.balance) : 0;
  const savingsBalance = parseFloat(savingsTotal) || 0;
  const totalBalance = cashBalance + savingsBalance;

  // Calculate earnings
  const totalEarned = totalDeposited > 0 ? Math.max(0, savingsBalance - totalDeposited) : 0;
  const dailyEarnings = (savingsBalance * (parseFloat(displayApy) / 100)) / 365;

  // Load total deposited from blockchain (consistent with Statements screen)
  // If using smart wallet, the EOA is "internal" (transfers between them aren't external)
  const otherOwnedAddress = smartWalletAddress && embeddedWalletAddress ? embeddedWalletAddress : undefined;

  React.useEffect(() => {
    const loadDeposited = async () => {
      if (displayAddress) {
        const deposited = await getNetDepositedFromBlockchain(displayAddress, otherOwnedAddress);
        setTotalDeposited(deposited);
      }
    };
    loadDeposited();
  }, [displayAddress, savingsBalance, otherOwnedAddress]);

  // Load savings goal
  React.useEffect(() => {
    const loadGoal = async () => {
      const goal = await getSavingsGoal();
      setSavingsGoalState(goal);
    };
    loadGoal();
  }, []);

  // Load badges and track app open for streaks
  React.useEffect(() => {
    const loadBadgesAndTrackOpen = async () => {
      // Load badges and stats
      const [loadedBadges, loadedStats] = await Promise.all([
        getBadges(),
        getBadgeStats(displayAddress),
      ]);
      setBadges(loadedBadges);
      setBadgeStats(loadedStats);

      // Track app open and check for streak badges
      const newStreakBadges = await trackAppOpen();
      if (newStreakBadges.length > 0) {
        // Show toast for first new badge
        const badgeDef = getBadgeDefinition(newStreakBadges[0]);
        if (badgeDef) {
          setEarnedBadge(badgeDef);
          setShowBadgeToast(true);
        }
        // Refresh badges data
        const updatedBadges = await getBadges();
        const updatedStats = await getBadgeStats(displayAddress);
        setBadges(updatedBadges);
        setBadgeStats(updatedStats);
      }
    };
    loadBadgesAndTrackOpen();
  }, []);

  // Check badges when savings balance OR wallet address changes
  // Runs when: balance changes (balance-based badges) OR address loads (deposit-based badges)
  const prevSavingsRef = React.useRef(savingsBalance);
  const prevAddressRef = React.useRef(displayAddress);
  React.useEffect(() => {
    const checkBadges = async () => {
      // Need positive balance AND wallet address for full badge check
      const balanceChanged = savingsBalance !== prevSavingsRef.current;
      const addressChanged = displayAddress !== prevAddressRef.current;

      if (savingsBalance > 0 && displayAddress && (balanceChanged || addressChanged)) {
        prevSavingsRef.current = savingsBalance;
        prevAddressRef.current = displayAddress;

        // Check balance-based badges AND deposit-based badges
        // walletAddress is required for blockchain deposit count
        const newBadges = await checkAndAwardBadges({
          savingsBalance,
          walletAddress: displayAddress,
        });

        if (newBadges.length > 0) {
          // Show toast for first new badge
          const badgeDef = getBadgeDefinition(newBadges[0]);
          if (badgeDef) {
            setEarnedBadge(badgeDef);
            setShowBadgeToast(true);
          }
          // Refresh badges data
          const updatedBadges = await getBadges();
          const updatedStats = await getBadgeStats(displayAddress);
          setBadges(updatedBadges);
          setBadgeStats(updatedStats);
        }
      }
    };
    checkBadges();
  }, [savingsBalance, displayAddress]);

  // Handle savings goal actions
  const handleSetGoal = async (amount: number) => {
    const goal = await setSavingsGoal(amount);
    setSavingsGoalState(goal);
    trackSavingsGoalSet(amount);
  };

  const handleClearGoal = async () => {
    await clearSavingsGoal();
    setSavingsGoalState(null);
    trackSavingsGoalCleared();
  };

  const handleGoalReached = async () => {
    await markGoalReached();
    setShowGoalCelebration(true);
    trackSavingsGoalReached(savingsGoal?.targetAmount || 0);

    // Check for goal_getter badge (also checks deposit-based badges)
    const newBadges = await checkAndAwardBadges({
      savingsBalance,
      walletAddress: displayAddress,
      justCompletedGoal: true,
    });

    if (newBadges.length > 0) {
      // Delay badge toast to show after celebration
      setTimeout(async () => {
        const badgeDef = getBadgeDefinition(newBadges[0]);
        if (badgeDef) {
          setEarnedBadge(badgeDef);
          setShowBadgeToast(true);
        }
        // Refresh badges data
        const updatedBadges = await getBadges();
        const updatedStats = await getBadgeStats(displayAddress);
        setBadges(updatedBadges);
        setBadgeStats(updatedStats);
      }, 3000);
    }
  };

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
      const errorMessage = getErrorMessage(error);
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

  const showRefreshToast = React.useCallback(() => {
    setShowUpdatedToast(true);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(-20);

    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(toastTranslateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-hide after 2 seconds
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslateY, {
          toValue: -20,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setShowUpdatedToast(false));
    }, 2000);
  }, [toastOpacity, toastTranslateY]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    const timer = Analytics.createTimer();
    await Promise.all([refetchBalances(), refetchPositions(), refetchApy()]);
    Analytics.trackBalanceFetchDuration(timer.stop());
    Analytics.trackBalanceRefreshed(cashBalance, savingsBalance, totalEarned);
    setRefreshing(false);
    showRefreshToast();
  }, [refetchBalances, refetchPositions, refetchApy, cashBalance, savingsBalance, totalEarned, showRefreshToast]);

  const handleSettings = useCallback(() => {
    Analytics.trackButtonTap('Settings', 'Dashboard');
    navigation.navigate('Settings');
  }, [navigation]);

  const handleCopyAddress = useCallback(async () => {
    if (displayAddress) {
      await Clipboard.setStringAsync(displayAddress);
      Analytics.trackAddressCopied('Dashboard');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [displayAddress]);

  // Memoized modal handlers
  const handleOpenAchievements = useCallback(() => {
    Analytics.trackButtonTap('Achievements Header', 'Dashboard');
    const earnedCount = Object.values(badges).filter((b) => b.earned).length;
    trackAchievementsModalOpened(earnedCount, 7);
    setShowAchievements(true);
  }, [badges]);

  const handleOpenFundingModal = useCallback(() => {
    Analytics.trackButtonTap('Add Funds', 'Dashboard');
    setShowFundingModal(true);
  }, []);

  const handleOpenWithdrawModal = useCallback(() => {
    Analytics.trackButtonTap('Withdraw Cash', 'Dashboard');
    setShowWithdrawModal(true);
  }, []);

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
      Analytics.trackOnrampError(getErrorMessage(error));
      Alert.alert('Error', 'Could not open payment provider');
    } finally {
      setIsBuyingUsdc(false);
    }
  };

  const closeFundingModal = useCallback(() => {
    Analytics.trackModalClosed('AddFunds', 'button');
    setShowFundingModal(false);
    setFundingView('options');
  }, []);

  const closeWithdrawModal = useCallback(() => {
    Analytics.trackModalClosed('Withdraw', 'button');
    setShowWithdrawModal(false);
    setWithdrawAddress('');
    setWithdrawAmount('');
    setWithdrawMethod('select');
  }, []);

  // Handle logo press - dismiss modals and scroll to top (Home button behavior)
  const handleLogoPress = useCallback(() => {
    Analytics.trackButtonTap('Logo Home', 'Dashboard');

    // Dismiss keyboard if open
    Keyboard.dismiss();

    // Close all modals and overlays
    setShowFundingModal(false);
    setShowWithdrawModal(false);
    setShowOfframpTransfer(false);
    setShowGoalModal(false);
    setShowGoalCelebration(false);
    setShowAchievements(false);
    setShowHowItWorks(false);
    setShowBadgeToast(false);

    // Reset modal states
    setFundingView('options');
    setWithdrawMethod('select');
    setWithdrawAddress('');
    setWithdrawAmount('');

    // Scroll to top
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

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
      Alert.alert('Failed', getErrorMessage(error) || 'Transaction failed. Please try again.');
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
      const errorMsg = getErrorMessage(error);
      Analytics.trackOfframpError(errorMsg);
      Alert.alert('Error', errorMsg || 'Something went wrong');
    } finally {
      setIsCashingOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Refresh Success Toast */}
      {showUpdatedToast && (
        <Animated.View
          style={[
            styles.updatedToast,
            {
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
          <Text style={styles.updatedToastText}>Balance updated</Text>
        </Animated.View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleLogoPress}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Image
              source={require('../../assets/logo_full.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <View style={styles.headerButtons}>
            {/* Achievements Button */}
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleOpenAchievements}
            >
              <Ionicons name="trophy" size={20} color={COLORS.primary} />
              {/* Badge count indicator */}
              {Object.values(badges).filter((b) => b.earned).length > 0 && (
                <View style={styles.badgeCountIndicator}>
                  <Text style={styles.badgeCountText}>
                    {Object.values(badges).filter((b) => b.earned).length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {/* Settings Button */}
            <TouchableOpacity
              testID="dashboard-settings-button"
              ref={settingsRef}
              style={styles.headerButton}
              onPress={handleSettings}
            >
              <Ionicons name="settings-outline" size={22} color={COLORS.grey} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Balance Section */}
        <View ref={balanceRef} style={styles.balanceSection}>
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
              {/* View Activity Link */}
              <TouchableOpacity
                style={styles.viewActivityLink}
                onPress={() => {
                  Analytics.trackButtonTap('View Activity', 'Dashboard');
                  navigation.navigate('TransactionHistory');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
              >
                <Ionicons name="time-outline" size={14} color={COLORS.secondary} />
                <Text style={styles.viewActivityText}>View Activity</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.secondary} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Streak Card - show when user has activity */}
        {!isLoading && badgeStats.currentStreak > 0 && (
          <View style={styles.streakCard}>
            <View style={styles.streakLeft}>
              <Ionicons name="flame" size={20} color="#F97316" />
              <Text style={styles.streakText}>
                <Text style={styles.streakNumber}>{badgeStats.currentStreak}</Text> day streak
              </Text>
            </View>
            <Text style={styles.streakMotivation}>
              {badgeStats.currentStreak >= 7 ? "You're on fire!" : "Open tomorrow to continue"}
            </Text>
          </View>
        )}

        {/* Zero Balance Onboarding Guide - ONLY entry point for new users */}
        {!isLoading && totalBalance === 0 && (
          <View style={styles.onboardingCard}>
            <View style={styles.onboardingIconContainer}>
              <Ionicons name="rocket-outline" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.onboardingTitle}>Welcome! Let's get started</Text>
            <Text style={styles.onboardingText}>
              Add funds to your account to start earning up to {displayApy}% APY on your savings.
            </Text>

            <View style={styles.onboardingSteps}>
              <View style={styles.onboardingStep}>
                <View style={styles.onboardingStepNumber}>
                  <Text style={styles.onboardingStepNumberText}>1</Text>
                </View>
                <View style={styles.onboardingStepContent}>
                  <Text style={styles.onboardingStepTitle}>Add funds to your Cash account</Text>
                  <Text style={styles.onboardingStepText}>Buy with card or transfer USDC</Text>
                </View>
              </View>
              <View style={styles.onboardingStep}>
                <View style={styles.onboardingStepNumber}>
                  <Text style={styles.onboardingStepNumberText}>2</Text>
                </View>
                <View style={styles.onboardingStepContent}>
                  <Text style={styles.onboardingStepTitle}>Move funds to Savings</Text>
                  <Text style={styles.onboardingStepText}>Start earning yield instantly</Text>
                </View>
              </View>
              <View style={styles.onboardingStep}>
                <View style={styles.onboardingStepNumber}>
                  <Text style={styles.onboardingStepNumberText}>3</Text>
                </View>
                <View style={styles.onboardingStepContent}>
                  <Text style={styles.onboardingStepTitle}>Watch your money grow</Text>
                  <Text style={styles.onboardingStepText}>Withdraw anytime, no lock-up</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              ref={totalBalance === 0 ? addFundsRef : undefined}
              style={styles.onboardingButton}
              activeOpacity={0.7}
              onPress={() => {
                Analytics.trackButtonTap('Add Funds Onboarding', 'Dashboard');
                setShowFundingModal(true);
              }}
            >
              <Ionicons name="add" size={20} color={COLORS.pureWhite} />
              <Text style={styles.onboardingButtonText}>Add Your First Funds</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cash Account Card - Hidden for $0 balance users (they see onboarding card instead) */}
        {!isLoading && totalBalance > 0 && (
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
              {/* Add Funds is secondary when user has cash but no savings */}
              <TouchableOpacity
                testID="dashboard-add-funds-button"
                ref={totalBalance > 0 ? addFundsRef : undefined}
                style={[
                  styles.cashButton,
                  savingsBalance === 0 && cashBalance > 0 ? styles.addFundsButtonSecondary : styles.addFundsButtonStyle
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  Analytics.trackButtonTap('Add Funds Cash Card', 'Dashboard');
                  setShowFundingModal(true);
                }}
              >
                <Ionicons
                  name="add"
                  size={18}
                  color={savingsBalance === 0 && cashBalance > 0 ? COLORS.primary : COLORS.pureWhite}
                />
                <Text style={[
                  styles.cashButtonText,
                  savingsBalance === 0 && cashBalance > 0 && styles.cashButtonTextSecondary
                ]}>
                  Add Funds
                </Text>
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

        {/* Savings Account Card - Hidden for $0 balance users */}
        {!isLoading && totalBalance > 0 && (
          <View
            ref={savingsRef}
            style={[
              styles.savingsCard,
              savingsBalance === 0 && cashBalance > 0 && styles.savingsCardHighlighted
            ]}
          >
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

              {/* Trust Signals */}
              <View style={styles.trustSignals}>
                <View style={styles.trustItem}>
                  <Ionicons name="shield-checkmark" size={12} color={COLORS.grey} />
                  <Text style={styles.trustText}>Audited contracts</Text>
                </View>
                <View style={styles.trustDot} />
                <View style={styles.trustItem}>
                  <Ionicons name="lock-closed" size={12} color={COLORS.grey} />
                  <Text style={styles.trustText}>Non-custodial</Text>
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
                      testID="dashboard-add-more-button"
                      style={styles.startEarningButton}
                      onPress={() => {
                        Analytics.trackButtonTap('Add More Savings', 'Dashboard');
                        navigation.navigate('Strategies');
                      }}
                    >
                      <Text style={styles.startEarningButtonText}>Add More</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="dashboard-withdraw-button"
                      style={styles.withdrawButton}
                      onPress={() => {
                        Analytics.trackButtonTap('Withdraw Savings', 'Dashboard');
                        navigation.navigate('Strategies');
                      }}
                    >
                      <Text style={styles.withdrawButtonText}>Withdraw</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  {/* Empty state with prominent CTA - this is the PRIMARY action when user has cash */}
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateTitle}>
                      {cashBalance > 0 ? `Put your $${cashBalance.toFixed(2)} to work` : 'Start earning today'}
                    </Text>
                    <Text style={styles.emptyStateText}>
                      Your money grows while you sleep. Withdraw anytime.
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID="dashboard-start-earning-button"
                    style={[
                      styles.startEarningButton,
                      cashBalance > 0 && styles.startEarningButtonPrimary
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      Analytics.trackButtonTap('Start Earning', 'Dashboard');
                      navigation.navigate('Strategies');
                    }}
                  >
                    <Ionicons name="trending-up" size={18} color={COLORS.pureWhite} />
                    <Text style={styles.startEarningButtonText}>
                      {cashBalance > 0 ? 'Start Earning Now' : 'Start Earning'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        {/* Savings Goal Card - show if user has savings */}
        {!isLoading && savingsBalance > 0 && (
          <SavingsGoalCard
            goal={savingsGoal}
            currentSavings={savingsBalance}
            onSetGoal={() => {
              Analytics.trackButtonTap('Set Savings Goal', 'Dashboard');
              setShowGoalModal(true);
            }}
            onEditGoal={() => {
              Analytics.trackButtonTap('Edit Savings Goal', 'Dashboard');
              setShowGoalModal(true);
            }}
            onGoalReached={handleGoalReached}
          />
        )}

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
                {/* Helper text to reduce decision paralysis */}
                <Text style={styles.fundingHelperText}>
                  Choose how you'd like to transfer USDC to your account
                </Text>

                {/* Transfer from other wallets - Recommended option */}
                <TouchableOpacity
                  style={[styles.fundingOption, styles.fundingOptionRecommended]}
                  onPress={() => {
                    Analytics.trackButtonTap('Transfer from other wallets', 'FundingModal');
                    setFundingView('receive');
                  }}
                >
                  <View style={[styles.fundingOptionIcon, styles.fundingOptionIconRecommended]}>
                    <Ionicons name="arrow-down" size={24} color={COLORS.primary} />
                  </View>
                  <View style={styles.fundingOptionContent}>
                    <View style={styles.fundingOptionTitleRow}>
                      <Text style={styles.fundingOptionTitle}>Transfer from other wallets</Text>
                      <View style={styles.recommendedBadge}>
                        <Text style={styles.recommendedBadgeText}>RECOMMENDED</Text>
                      </View>
                    </View>
                    <Text style={styles.fundingOptionSubtitle}>Receive USDC via QR code or address</Text>
                    <View style={styles.fundingOptionBenefits}>
                      <View style={styles.benefitItem}>
                        <Ionicons name="flash" size={12} color={COLORS.success} />
                        <Text style={styles.benefitText}>Instant</Text>
                      </View>
                      <View style={styles.benefitItem}>
                        <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
                        <Text style={styles.benefitText}>No fees</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
                </TouchableOpacity>

                {/* Divider with "or" */}
                <View style={styles.fundingDivider}>
                  <View style={styles.fundingDividerLine} />
                  <Text style={styles.fundingDividerText}>or</Text>
                  <View style={styles.fundingDividerLine} />
                </View>

                {/* Transfer with Coinbase - Secondary option */}
                <TouchableOpacity
                  style={styles.fundingOption}
                  onPress={() => {
                    Analytics.trackButtonTap('Transfer with Coinbase', 'FundingModal');
                    handleBuyWithCard();
                  }}
                >
                  <View style={styles.fundingOptionIcon}>
                    <Ionicons name="swap-horizontal-outline" size={24} color={COLORS.grey} />
                  </View>
                  <View style={styles.fundingOptionContent}>
                    <Text style={[styles.fundingOptionTitle, styles.fundingOptionTitleSecondary]}>
                      Transfer with Coinbase
                    </Text>
                    <Text style={styles.fundingOptionSubtitle}>Buy or transfer via Coinbase app</Text>
                    <Text style={styles.fundingOptionNote}>
                      Opens Coinbase · May include fees
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
                </TouchableOpacity>

                {/* Info banner */}
                <View style={styles.fundingInfoBanner}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.grey} />
                  <Text style={styles.fundingInfoText}>
                    Already have USDC? Transfer from wallet is fastest. Otherwise, use Coinbase to buy and transfer.
                  </Text>
                </View>
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
                          // Truncate to 6 decimals (USDC precision) - never round up
                          const truncated = Math.floor(cashBalance * 1000000) / 1000000;
                          setWithdrawAmount(truncated.toString());
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
                      onPress={() => {
                        // Use exact amount truncated to 6 decimals - never round up
                        const truncated = Math.floor(cashBalance * 1000000) / 1000000;
                        setWithdrawAmount(truncated.toString());
                      }}
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
                            // Truncate to 6 decimals (USDC precision) - never round up
                            const truncated = Math.floor(cashBalance * 1000000) / 1000000;
                            setWithdrawAmount(truncated.toString());
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
                      <Text style={styles.availableAmount}>${cashBalance.toFixed(6)}</Text>
                      <TouchableOpacity
                        style={styles.maxButtonSmall}
                        onPress={() => {
                          // Use exact amount truncated to 6 decimals - never round up
                          const truncated = Math.floor(cashBalance * 1000000) / 1000000;
                          setWithdrawAmount(truncated.toString());
                        }}
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

      {/* Set Goal Modal */}
      <SetGoalModal
        visible={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        onSave={handleSetGoal}
        onClear={handleClearGoal}
        currentGoal={savingsGoal}
        currentSavings={savingsBalance}
      />

      {/* Goal Reached Celebration */}
      {savingsGoal && (
        <CelebrationModal
          visible={showGoalCelebration}
          onClose={() => setShowGoalCelebration(false)}
          amount={savingsGoal.targetAmount}
          apy={parseFloat(displayApy)}
          isFirstDeposit={false}
          milestoneReached={savingsGoal.targetAmount}
        />
      )}

      {/* Badge Toast Notification */}
      <BadgeToast
        visible={showBadgeToast}
        badge={earnedBadge}
        onClose={() => {
          setShowBadgeToast(false);
          setEarnedBadge(null);
        }}
        onPress={() => {
          setShowBadgeToast(false);
          setEarnedBadge(null);
          setShowAchievements(true);
        }}
      />

      {/* Achievements Modal */}
      <AchievementsModal
        visible={showAchievements}
        onClose={() => {
          trackAchievementsModalClosed();
          setShowAchievements(false);
        }}
        badges={badges}
        stats={badgeStats}
        currentBalance={parseFloat(savingsTotal) || 0}
      />

      {/* Onboarding Tutorial Overlay */}
      <OnboardingTutorial
        isActive={onboardingTutorial.isActive}
        currentStep={onboardingTutorial.currentStep}
        currentStepIndex={onboardingTutorial.currentStepIndex}
        totalSteps={onboardingTutorial.totalSteps}
        onNext={onboardingTutorial.nextStep}
        onPrevious={onboardingTutorial.previousStep}
        onSkip={onboardingTutorial.skipTutorial}
        onComplete={onboardingTutorial.completeTutorial}
        measureTarget={onboardingTutorial.measureTarget}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  updatedToast: {
    position: 'absolute',
    top: 60,
    left: 24,
    right: 24,
    backgroundColor: COLORS.pureWhite,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 100,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
  },
  updatedToastText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.success,
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerButton: {
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
  badgeCountIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: COLORS.pureWhite,
  },
  badgeCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.pureWhite,
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
  viewActivityLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: COLORS.secondary + '10',
  },
  viewActivityText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  // Streak Card
  streakCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.pureWhite,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  streakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakText: {
    fontSize: 14,
    color: COLORS.black,
  },
  streakNumber: {
    fontWeight: '700',
  },
  streakMotivation: {
    fontSize: 12,
    color: COLORS.grey,
  },
  // Trust Signals
  trustSignals: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 6,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trustText: {
    fontSize: 11,
    color: COLORS.grey,
  },
  trustDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.border,
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
  addFundsButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  cashButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  cashButtonTextSecondary: {
    color: COLORS.primary,
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
  savingsCardHighlighted: {
    borderColor: COLORS.secondary,
    borderWidth: 2,
    shadowColor: COLORS.secondary,
    shadowOpacity: 0.15,
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
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startEarningButtonPrimary: {
    paddingVertical: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
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
  // Zero Balance Onboarding
  onboardingCard: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  onboardingIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${COLORS.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  onboardingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: 8,
  },
  onboardingText: {
    fontSize: 15,
    color: COLORS.grey,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  onboardingSteps: {
    gap: 16,
    marginBottom: 24,
  },
  onboardingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  onboardingStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onboardingStepNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.pureWhite,
  },
  onboardingStepContent: {
    flex: 1,
  },
  onboardingStepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 2,
  },
  onboardingStepText: {
    fontSize: 13,
    color: COLORS.grey,
  },
  onboardingButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  onboardingButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.pureWhite,
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
  fundingHelperText: {
    fontSize: 14,
    color: COLORS.grey,
    textAlign: 'center',
    marginBottom: 8,
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
  fundingOptionRecommended: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    backgroundColor: `${COLORS.primary}05`,
  },
  fundingOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${COLORS.grey}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  fundingOptionIconRecommended: {
    backgroundColor: `${COLORS.primary}15`,
  },
  fundingOptionContent: {
    flex: 1,
  },
  fundingOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  fundingOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
  },
  fundingOptionTitleSecondary: {
    color: COLORS.grey,
  },
  fundingOptionSubtitle: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 6,
  },
  fundingOptionBenefits: {
    flexDirection: 'row',
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  benefitText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '500',
  },
  fundingOptionNote: {
    fontSize: 12,
    color: COLORS.grey,
    fontStyle: 'italic',
  },
  recommendedBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  recommendedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.pureWhite,
    letterSpacing: 0.5,
  },
  fundingDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  fundingDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  fundingDividerText: {
    fontSize: 13,
    color: COLORS.grey,
    paddingHorizontal: 16,
  },
  fundingInfoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${COLORS.grey}10`,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  fundingInfoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.grey,
    lineHeight: 18,
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
