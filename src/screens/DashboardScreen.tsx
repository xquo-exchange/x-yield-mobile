import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Linking,
  AppState,
  AppStateStatus,
  Animated,
  Keyboard,
} from 'react-native';
import { encodeFunctionData, parseUnits } from 'viem';
import { TOKENS } from '../constants/contracts';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp, RouteProp } from '@react-navigation/native-stack';
import { usePrivy, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';

import { RootStackParamList } from '../navigation/AppNavigator';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { usePositions } from '../hooks/usePositions';
import { useVaultApy } from '../hooks/useVaultApy';
import { getDepositedAndEarnings } from '../services/depositTracker';
import { openCoinbaseOnramp, getOnrampSessionUrl } from '../services/coinbaseOnramp';
import { openCoinbaseOfframp } from '../services/coinbaseOfframp';
import { useDeepLink } from '../contexts/DeepLinkContext';
import * as Analytics from '../services/analytics';
import {
  trackAchievementsModalOpened,
  trackAchievementsModalClosed,
  trackTrustSignalViewed,
} from '../services/analytics';
import SavingsGoalCard from '../components/SavingsGoalCard';
import SetGoalModal from '../components/SetGoalModal';
import CelebrationModal from '../components/CelebrationModal';
import BadgeToast from '../components/BadgeToast';
import AchievementsModal from '../components/AchievementsModal';
import OnboardingTutorial from '../components/OnboardingTutorial';
import { useOnboardingTutorial } from '../hooks/useOnboardingTutorial';
import { useSavingsGoalState } from '../hooks/useSavingsGoalState';
import { useRefreshToast } from '../hooks/useRefreshToast';
import { useBadges } from '../hooks/useBadges';
import { getErrorMessage } from '../utils/errorHelpers';
import { COLORS } from '../constants/colors';
import { styles } from './dashboardStyles';
import {
  BalanceCard,
  QuickActions,
  PositionsList,
  DepositModal,
  WithdrawModal,
  OfframpTransferModal,
  OnboardingCard,
  HowItWorks,
  DashboardHeader,
  StreakCard,
} from '../components/dashboard';

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
  const [totalEarnings, setTotalEarnings] = React.useState(0);
  const [showWithdrawModal, setShowWithdrawModal] = React.useState(false);
  const [withdrawMethod, setWithdrawMethod] = React.useState<'select' | 'wallet' | 'bank'>('select');
  const [withdrawAddress, setWithdrawAddress] = React.useState('');
  const [withdrawAmount, setWithdrawAmount] = React.useState('');
  const [isWithdrawingCash, setIsWithdrawingCash] = React.useState(false);
  const [isCashingOut, setIsCashingOut] = React.useState(false);
  const [showOfframpTransfer, setShowOfframpTransfer] = React.useState(false);
  const [offrampParams, setOfframpParams] = React.useState<{
    toAddress: string; amount: string; expiresAt: string;
  } | null>(null);
  const [isOfframpProcessing, setIsOfframpProcessing] = React.useState(false);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const { showUpdatedToast, toastOpacity, toastTranslateY, showRefreshToast } = useRefreshToast();
  const {
    savingsGoal, showGoalModal, showGoalCelebration,
    setShowGoalModal, setShowGoalCelebration,
    handleSetGoal, handleClearGoal, handleGoalReached: _handleGoalReached,
  } = useSavingsGoalState();
  const onboardingTutorial = useOnboardingTutorial();
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

      if (stepId === 'welcome') {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }

      if (stepId === 'settings' || stepId === 'balance') {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }

      const layout = await onboardingTutorial.measureTarget(stepId);
      if (layout) {
        const targetY = Math.max(0, layout.y - 150);
        scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
      }
    };

    const timer = setTimeout(scrollToTarget, 150);
    return () => clearTimeout(timer);
  }, [onboardingTutorial.isActive, onboardingTutorial.currentStep, onboardingTutorial.measureTarget]);

  // Handle openAchievements navigation parameter from Settings
  React.useEffect(() => {
    if (route.params?.openAchievements) {
      setShowAchievements(true);
      navigation.setParams({ openAchievements: undefined });
    }
  }, [route.params?.openAchievements, navigation]);

  // Handle restartTutorial navigation parameter from Settings
  React.useEffect(() => {
    if (route.params?.restartTutorial) {
      navigation.setParams({ restartTutorial: undefined });
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      const startTutorial = async () => {
        await onboardingTutorial.resetTutorial();
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

  const {
    badges, badgeStats, earnedBadgeCount,
    showBadgeToast, earnedBadge, showAchievements,
    setShowBadgeToast, setEarnedBadge, setShowAchievements,
    checkBadgesForGoal,
  } = useBadges(displayAddress, savingsBalance);

  React.useEffect(() => {
    const loadDepositedAndEarnings = async () => {
      if (displayAddress && savingsBalance >= 0) {
        try {
          const { deposited, earnings } = await getDepositedAndEarnings(displayAddress, savingsBalance);
          setTotalDeposited(deposited);
          setTotalEarnings(earnings);
        } catch (error) {
          console.error('[Dashboard] Error loading deposited/earnings:', error);
        }
      }
    };
    loadDepositedAndEarnings();
  }, [displayAddress, savingsBalance]);

  const handleGoalReached = () => _handleGoalReached(savingsBalance, displayAddress, checkBadgesForGoal);

  const { pendingOfframp, clearPendingOfframp } = useDeepLink();

  React.useEffect(() => {
    if (pendingOfframp) {
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

  const handleOfframpTransfer = async () => {
    if (!offrampParams || !smartWalletClient) return;

    setIsOfframpProcessing(true);

    try {
      const amountInUnits = parseUnits(offrampParams.amount, 6);

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
        to: TOKENS.USDC as `0x${string}`,
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

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    const timer = Analytics.createTimer();
    await Promise.all([refetchBalances(), refetchPositions(), refetchApy()]);
    Analytics.trackBalanceFetchDuration(timer.stop());
    Analytics.trackBalanceRefreshed(cashBalance, savingsBalance, totalEarnings);
    setRefreshing(false);
    showRefreshToast();
  }, [refetchBalances, refetchPositions, refetchApy, cashBalance, savingsBalance, totalEarnings, showRefreshToast]);

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

  const handleOpenAchievements = useCallback(() => {
    Analytics.trackButtonTap('Achievements Header', 'Dashboard');
    trackAchievementsModalOpened(earnedBadgeCount, 7);
    setShowAchievements(true);
  }, [earnedBadgeCount]);

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

  const handleLogoPress = useCallback(() => {
    Analytics.trackButtonTap('Logo Home', 'Dashboard');
    Keyboard.dismiss();
    setShowFundingModal(false);
    setShowWithdrawModal(false);
    setShowOfframpTransfer(false);
    setShowGoalModal(false);
    setShowGoalCelebration(false);
    setShowAchievements(false);
    setShowHowItWorks(false);
    setShowBadgeToast(false);
    setFundingView('options');
    setWithdrawMethod('select');
    setWithdrawAddress('');
    setWithdrawAmount('');
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const handleWithdrawCashReview = () => {
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

    Alert.alert(
      'Confirm Withdrawal',
      `Send: $${amount.toFixed(2)} USDC\nTo: ${withdrawAddress.slice(0, 6)}...${withdrawAddress.slice(-4)}\nNetwork: Base\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm & Send', onPress: executeWithdrawCash },
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
      const amountRaw = BigInt(Math.floor(amount * 1_000_000));

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

      const hash = await smartWalletClient.sendTransaction({
        to: TOKENS.USDC as `0x${string}`,
        data: transferData,
        value: BigInt(0),
      });

      closeWithdrawModal();
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
        closeWithdrawModal();
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
        <DashboardHeader
          earnedBadgeCount={earnedBadgeCount}
          settingsRef={settingsRef}
          onLogoPress={handleLogoPress}
          onAchievements={handleOpenAchievements}
          onSettings={handleSettings}
        />

        <View ref={balanceRef}>
          <BalanceCard
            isLoading={isLoading}
            totalBalance={totalBalance}
            displayApy={displayApy}
            savingsBalance={savingsBalance}
            onViewActivity={() => {
              Analytics.trackButtonTap('View Activity', 'Dashboard');
              navigation.navigate('TransactionHistory');
            }}
          />
        </View>

        {!isLoading && <StreakCard currentStreak={badgeStats.currentStreak} />}

        {!isLoading && totalBalance === 0 && (
          <OnboardingCard
            displayApy={displayApy}
            addFundsRef={addFundsRef}
            onAddFunds={() => {
              Analytics.trackButtonTap('Add Funds Onboarding', 'Dashboard');
              setShowFundingModal(true);
            }}
          />
        )}

        <QuickActions
          isLoading={isLoading}
          totalBalance={totalBalance}
          cashBalance={cashBalance}
          savingsBalance={savingsBalance}
          addFundsRef={addFundsRef}
          onAddFunds={() => {
            Analytics.trackButtonTap('Add Funds Cash Card', 'Dashboard');
            setShowFundingModal(true);
          }}
          onWithdraw={() => setShowWithdrawModal(true)}
        />

        <PositionsList
          savingsRef={savingsRef}
          savingsBalance={savingsBalance}
          cashBalance={cashBalance}
          totalBalance={totalBalance}
          isLoading={isLoading}
          displayApy={displayApy}
          totalDeposited={totalDeposited}
          pulseAnim={pulseAnim}
          onAddMore={() => {
            Analytics.trackButtonTap('Add More Savings', 'Dashboard');
            navigation.navigate('Strategies');
          }}
          onWithdraw={() => {
            Analytics.trackButtonTap('Withdraw Savings', 'Dashboard');
            navigation.navigate('Strategies');
          }}
          onStartEarning={() => {
            Analytics.trackButtonTap('Start Earning', 'Dashboard');
            navigation.navigate('Strategies');
          }}
        />

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

        <HowItWorks
          showHowItWorks={showHowItWorks}
          onToggle={() => setShowHowItWorks(!showHowItWorks)}
        />
      </ScrollView>

      {(isBuyingUsdc || isCheckingFunds) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>
            {isBuyingUsdc ? 'Opening payment...' : 'Updating balance...'}
          </Text>
        </View>
      )}

      <DepositModal
        visible={showFundingModal}
        fundingView={fundingView}
        displayAddress={displayAddress}
        copied={copied}
        onClose={closeFundingModal}
        onViewChange={setFundingView}
        onCopyAddress={handleCopyAddress}
        onBuyWithCard={handleBuyWithCard}
      />

      <WithdrawModal
        visible={showWithdrawModal}
        withdrawMethod={withdrawMethod}
        withdrawAddress={withdrawAddress}
        withdrawAmount={withdrawAmount}
        cashBalance={cashBalance}
        isWithdrawingCash={isWithdrawingCash}
        isCashingOut={isCashingOut}
        onClose={closeWithdrawModal}
        onMethodChange={setWithdrawMethod}
        onAddressChange={setWithdrawAddress}
        onAmountChange={setWithdrawAmount}
        onReview={handleWithdrawCashReview}
        onCashOutToBank={handleCashOutToBank}
      />

      <OfframpTransferModal
        visible={showOfframpTransfer}
        offrampParams={offrampParams}
        isOfframpProcessing={isOfframpProcessing}
        onClose={() => setShowOfframpTransfer(false)}
        onConfirm={handleOfframpTransfer}
      />

      <SetGoalModal
        visible={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        onSave={handleSetGoal}
        onClear={handleClearGoal}
        currentGoal={savingsGoal}
        currentSavings={savingsBalance}
      />

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
