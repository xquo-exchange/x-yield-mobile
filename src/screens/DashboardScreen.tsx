import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Keyboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp, RouteProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/AppNavigator';
import { useWalletAddress } from '../hooks/useWalletAddress';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { usePositions } from '../hooks/usePositions';
import { useVaultApy } from '../hooks/useVaultApy';
import { useDepositAndEarnings } from '../hooks/useDepositAndEarnings';
import { useFundingModal } from '../hooks/useFundingModal';
import { useWithdrawModal } from '../hooks/useWithdrawModal';
import { useOfframpTransfer } from '../hooks/useOfframpTransfer';
import { useOnboardingTutorial } from '../hooks/useOnboardingTutorial';
import { useSavingsGoalState } from '../hooks/useSavingsGoalState';
import { useRefreshToast } from '../hooks/useRefreshToast';
import { useBadges } from '../hooks/useBadges';
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
  // ── Core state ──
  const { smartWalletClient, displayAddress } = useWalletAddress();
  const {
    usdc,
    isLoading: balanceLoading,
    refetch: refetchBalances,
  } = useWalletBalance(displayAddress);
  const {
    totalUsdValue: savingsTotal,
    isLoading: positionsLoading,
    refetch: refetchPositions,
  } = usePositions(displayAddress);
  const { apy: displayApy, refetch: refetchApy } = useVaultApy();

  const cashBalance = usdc ? parseFloat(usdc.balance) : 0;
  const savingsBalance = parseFloat(savingsTotal) || 0;
  const totalBalance = cashBalance + savingsBalance;
  const isLoading = balanceLoading || positionsLoading;

  // ── Derived hooks ──
  const { totalDeposited, totalEarnings, invalidateAndRefresh } = useDepositAndEarnings(
    displayAddress,
    savingsBalance,
  );
  const funding = useFundingModal(displayAddress, refetchBalances, refetchPositions);
  const withdraw = useWithdrawModal(
    smartWalletClient,
    displayAddress,
    cashBalance,
    refetchBalances,
  );
  const offramp = useOfframpTransfer(smartWalletClient, refetchBalances);
  const {
    badges,
    badgeStats,
    earnedBadgeCount,
    showBadgeToast,
    earnedBadge,
    showAchievements,
    setShowBadgeToast,
    setEarnedBadge,
    setShowAchievements,
    checkBadgesForGoal,
  } = useBadges(displayAddress, savingsBalance);
  const {
    savingsGoal,
    showGoalModal,
    showGoalCelebration,
    setShowGoalModal,
    setShowGoalCelebration,
    handleSetGoal,
    handleClearGoal,
    handleGoalReached: _handleGoalReached,
  } = useSavingsGoalState();
  const onboardingTutorial = useOnboardingTutorial();
  const { showUpdatedToast, toastOpacity, toastTranslateY, showRefreshToast } = useRefreshToast();
  const [refreshing, setRefreshing] = React.useState(false);
  const [showHowItWorks, setShowHowItWorks] = React.useState(false);

  // ── Refs ──
  const scrollViewRef = React.useRef<ScrollView>(null);
  const balanceRef = React.useRef<View>(null);
  const savingsRef = React.useRef<View>(null);
  const addFundsRef = React.useRef<View>(null);
  const settingsRef = React.useRef<View>(null);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // ── Tutorial setup ──
  React.useEffect(() => {
    onboardingTutorial.registerTarget('balance', balanceRef);
    onboardingTutorial.registerTarget('savings', savingsRef);
    onboardingTutorial.registerTarget('addFunds', addFundsRef);
    onboardingTutorial.registerTarget('settings', settingsRef);
  }, [onboardingTutorial.registerTarget]);

  React.useEffect(() => {
    const scrollToTarget = async () => {
      if (!onboardingTutorial.isActive || !onboardingTutorial.currentStep) return;
      const stepId = onboardingTutorial.currentStep.id;
      if (stepId === 'welcome' || stepId === 'settings' || stepId === 'balance') {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }
      const layout = await onboardingTutorial.measureTarget(stepId);
      if (layout) {
        scrollViewRef.current?.scrollTo({ y: Math.max(0, layout.y - 150), animated: true });
      }
    };
    const timer = setTimeout(scrollToTarget, 150);
    return () => clearTimeout(timer);
  }, [
    onboardingTutorial.isActive,
    onboardingTutorial.currentStep,
    onboardingTutorial.measureTarget,
  ]);

  React.useEffect(() => {
    if (
      !onboardingTutorial.isLoading &&
      onboardingTutorial.shouldShowTutorial &&
      !onboardingTutorial.isActive &&
      !isLoading
    ) {
      const timer = setTimeout(() => onboardingTutorial.startTutorial(), 800);
      return () => clearTimeout(timer);
    }
  }, [
    onboardingTutorial.isLoading,
    onboardingTutorial.shouldShowTutorial,
    onboardingTutorial.isActive,
    isLoading,
    onboardingTutorial.startTutorial,
  ]);

  // ── Route params ──
  React.useEffect(() => {
    if (route.params?.openAchievements) {
      setShowAchievements(true);
      navigation.setParams({ openAchievements: undefined });
    }
  }, [route.params?.openAchievements, navigation]);

  React.useEffect(() => {
    if (route.params?.restartTutorial) {
      navigation.setParams({ restartTutorial: undefined });
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      const start = async () => {
        await onboardingTutorial.resetTutorial();
        setTimeout(() => onboardingTutorial.startTutorial(), 300);
      };
      start();
    }
  }, [
    route.params?.restartTutorial,
    navigation,
    onboardingTutorial.resetTutorial,
    onboardingTutorial.startTutorial,
  ]);

  // ── Analytics + animations ──
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
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // ── Callbacks ──
  const handleGoalReached = () =>
    _handleGoalReached(savingsBalance, displayAddress, checkBadgesForGoal);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    const timer = Analytics.createTimer();
    await invalidateAndRefresh();
    await Promise.all([refetchBalances(), refetchPositions(), refetchApy()]);
    Analytics.trackBalanceFetchDuration(timer.stop());
    Analytics.trackBalanceRefreshed(cashBalance, savingsBalance, totalEarnings);
    setRefreshing(false);
    showRefreshToast();
  }, [
    refetchBalances,
    refetchPositions,
    refetchApy,
    invalidateAndRefresh,
    cashBalance,
    savingsBalance,
    totalEarnings,
    showRefreshToast,
  ]);

  const handleSettings = useCallback(() => {
    Analytics.trackButtonTap('Settings', 'Dashboard');
    navigation.navigate('Settings');
  }, [navigation]);

  const handleOpenAchievements = useCallback(() => {
    Analytics.trackButtonTap('Achievements Header', 'Dashboard');
    trackAchievementsModalOpened(earnedBadgeCount, 7);
    setShowAchievements(true);
  }, [earnedBadgeCount]);

  const handleLogoPress = useCallback(() => {
    Analytics.trackButtonTap('Logo Home', 'Dashboard');
    Keyboard.dismiss();
    funding.setShowFundingModal(false);
    withdraw.setShowWithdrawModal(false);
    offramp.setShowOfframpTransfer(false);
    setShowGoalModal(false);
    setShowGoalCelebration(false);
    setShowAchievements(false);
    setShowHowItWorks(false);
    setShowBadgeToast(false);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  // ── Render ──
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {showUpdatedToast && (
        <Animated.View
          style={[
            styles.updatedToast,
            { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
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
              funding.setShowFundingModal(true);
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
            funding.setShowFundingModal(true);
          }}
          onWithdraw={() => withdraw.setShowWithdrawModal(true)}
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

      {(funding.isBuyingUsdc || funding.isCheckingFunds) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>
            {funding.isBuyingUsdc ? 'Opening payment...' : 'Updating balance...'}
          </Text>
        </View>
      )}

      <DepositModal
        visible={funding.showFundingModal}
        fundingView={funding.fundingView}
        displayAddress={displayAddress}
        copied={funding.copied}
        onClose={funding.closeFundingModal}
        onViewChange={funding.setFundingView}
        onCopyAddress={funding.handleCopyAddress}
        onBuyWithCard={funding.handleBuyWithCard}
      />

      <WithdrawModal
        visible={withdraw.showWithdrawModal}
        withdrawMethod={withdraw.withdrawMethod}
        withdrawAddress={withdraw.withdrawAddress}
        withdrawAmount={withdraw.withdrawAmount}
        cashBalance={cashBalance}
        isWithdrawingCash={withdraw.isWithdrawingCash}
        isCashingOut={withdraw.isCashingOut}
        onClose={withdraw.closeWithdrawModal}
        onMethodChange={withdraw.setWithdrawMethod}
        onAddressChange={withdraw.setWithdrawAddress}
        onAmountChange={withdraw.setWithdrawAmount}
        onReview={withdraw.handleWithdrawCashReview}
        onCashOutToBank={withdraw.handleCashOutToBank}
      />

      <OfframpTransferModal
        visible={offramp.showOfframpTransfer}
        offrampParams={offramp.offrampParams}
        isOfframpProcessing={offramp.isOfframpProcessing}
        onClose={() => offramp.setShowOfframpTransfer(false)}
        onConfirm={offramp.handleOfframpTransfer}
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
