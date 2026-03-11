import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  TextInput,
  Alert,
  Linking,
} from 'react-native';
import * as Analytics from '../services/analytics';
import { trackTrustSignalViewed } from '../services/analytics';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';
import { useEmbeddedEthereumWallet } from '@privy-io/expo';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { STRATEGIES } from '../constants/strategies';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { usePositions } from '../hooks/usePositions';
import { useVaultApy } from '../hooks/useVaultApy';
import {
  buildStrategyBatch,
  executeStrategyBatch,
  buildWithdrawBatch,
  executeWithdrawBatch,
} from '../services/strategyExecution';
import {
  writeAheadDeposit,
  confirmDeposit,
  rollbackDeposit,
  recordWithdrawal,
  getDepositedAndEarnings,
  invalidateBlockchainCache,
} from '../services/depositTracker';
import { clearTransactionCache } from '../services/transactionHistory';
import { recordDepositMilestone } from '../services/milestoneTracker';
import { checkAndAwardBadges } from '../services/badges';
import CelebrationModal from '../components/CelebrationModal';
import { getErrorMessage } from '../utils/errorHelpers';
import { COLORS } from '../constants/colors';
import {
  StrategyCard,
  AllocationBreakdown,
  HowItWorksSection,
  DepositForm,
  WithdrawConfirmation,
  FeeAndTrustSection,
} from '../components/strategies';

type StrategiesScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Strategies'>;
};

const STRATEGY = STRATEGIES.find(s => s.id === 'conservative-usdc')!;

type TabType = 'add' | 'withdraw';

export default function StrategiesScreen({ navigation }: StrategiesScreenProps) {
  const { client: smartWalletClient } = useSmartWallets();
  const embeddedWallet = useEmbeddedEthereumWallet();
  const wallets = embeddedWallet?.wallets || [];
  const embeddedWalletAddress = wallets.length > 0 ? wallets[0].address : '';
  const smartWalletAddress = smartWalletClient?.account?.address || '';
  const displayAddress = smartWalletAddress || embeddedWalletAddress;

  const { usdc, refetch: refetchBalances } = useWalletBalance(displayAddress);
  const { positions, totalUsdValue: positionsTotal, isLoading: positionsLoading, error: positionsError, refetch: refetchPositions } = usePositions(displayAddress);
  const { apy: displayApy, refetch: refetchApy, getVaultApy } = useVaultApy();
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [totalDeposited, setTotalDeposited] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>('add');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const amountInputRef = useRef<TextInput>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{
    amount: number;
    isFirstDeposit: boolean;
    milestoneReached: number | null;
  } | null>(null);

  const hasPositions = useMemo(
    () => positions.some(p => p.shares > BigInt(0)),
    [positions]
  );
  const savingsAmount = useMemo(
    () => parseFloat(positionsTotal) || 0,
    [positionsTotal]
  );
  const availableBalance = useMemo(
    () => usdc ? parseFloat(usdc.balance) : 0,
    [usdc]
  );

  const hasNoCashToAdd = availableBalance < 0.01;
  const hasSavingsButNoCash = hasPositions && hasNoCashToAdd;
  const isTrulyEmpty = !hasPositions && hasNoCashToAdd;

  const displayDeposited = totalDeposited;
  const totalYield = totalEarnings;
  const youReceive = savingsAmount;

  useEffect(() => {
    Analytics.trackScreenView('ManageFunds');
    trackTrustSignalViewed('audited_contracts', 'ManageFunds');
    trackTrustSignalViewed('withdraw_anytime', 'ManageFunds');
    return () => Analytics.trackScreenExit('ManageFunds');
  }, []);

  React.useEffect(() => {
    const loadDepositedAndEarnings = async () => {
      if (displayAddress && savingsAmount >= 0) {
        try {
          const { deposited, earnings } = await getDepositedAndEarnings(displayAddress, savingsAmount);
          setTotalDeposited(deposited);
          setTotalEarnings(earnings);
        } catch (error) {
          console.error('[Strategies] Error loading deposited/earnings:', error);
        }
      }
    };
    loadDepositedAndEarnings();
  }, [displayAddress, positions, savingsAmount]);

  const onRefresh = useCallback(async () => {
    Analytics.trackButtonTap('Pull to Refresh', 'ManageFunds');
    const timer = Analytics.createTimer();
    setRefreshing(true);
    if (displayAddress) {
      await invalidateBlockchainCache(displayAddress);
    }
    await Promise.all([refetchBalances(), refetchPositions(), refetchApy()]);
    setRefreshing(false);
    Analytics.trackBalanceFetchDuration(timer.stop());
  }, [refetchBalances, refetchPositions, refetchApy, displayAddress]);

  const handleGoBack = useCallback(() => {
    Analytics.trackButtonTap('Back', 'ManageFunds');
    navigation.goBack();
  }, [navigation]);

  const handleRetry = useCallback(() => {
    Analytics.trackButtonTap('Retry', 'ManageFunds');
    refetchPositions();
  }, [refetchPositions]);

  const handleAmountChange = (value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    setAmount(sanitized);
  };

  const handleSetMaxAmount = () => {
    Analytics.trackButtonTap('MAX', 'ManageFunds', { tab: 'add' });
    if (usdc) {
      setAmount(usdc.balance);
      Analytics.track('Deposit Max Set', { amount: parseFloat(usdc.balance) });
    }
  };

  const handleDeposit = async () => {
    const depositAmount = parseFloat(amount);
    Analytics.trackButtonTap('Add Funds', 'ManageFunds', { amount: depositAmount });
    Analytics.trackDepositStarted(depositAmount, STRATEGY.name);

    if (!amount || depositAmount <= 0) {
      Analytics.trackDepositFailed(depositAmount, STRATEGY.name, 'Invalid amount');
      Alert.alert('Enter Amount', 'Please enter an amount to add');
      return;
    }

    if (!smartWalletClient || !displayAddress) {
      Analytics.trackDepositFailed(depositAmount, STRATEGY.name, 'Not logged in');
      Alert.alert('Error', 'Please log in first.');
      return;
    }

    if (usdc && depositAmount > parseFloat(usdc.balance)) {
      Analytics.trackDepositFailed(depositAmount, STRATEGY.name, 'Insufficient balance');
      Alert.alert('Insufficient Balance', `You only have $${parseFloat(usdc.balance).toFixed(2)} available`);
      return;
    }

    setIsDepositing(true);
    const timer = Analytics.createTimer();

    try {
      const batch = buildStrategyBatch(
        STRATEGY,
        amount,
        displayAddress as `0x${string}`
      );

      // WRITE-AHEAD: record deposit BEFORE sending on-chain tx
      const depositId = await writeAheadDeposit(displayAddress, depositAmount);

      let txHash: string;
      try {
        txHash = await executeStrategyBatch(smartWalletClient, batch);
      } catch (txError) {
        // Tx failed — rollback the write-ahead deposit
        await rollbackDeposit(displayAddress, depositId, depositAmount);
        throw txError;
      }

      // Tx succeeded — confirm and sync to backend
      const duration = timer.stop();
      await confirmDeposit(displayAddress, depositId, txHash, depositAmount);
      await clearTransactionCache(displayAddress);
      setTotalDeposited(prev => prev + depositAmount);

      const milestoneResult = await recordDepositMilestone(depositAmount);
      await checkAndAwardBadges({
        savingsBalance: savingsAmount + depositAmount,
        walletAddress: displayAddress,
        justMadeDeposit: true,
      });

      setAmount('');
      refetchBalances();
      refetchPositions();

      Analytics.trackDepositSuccess(depositAmount, STRATEGY.name, txHash, duration);

      if (milestoneResult.isFirstDeposit) {
        Analytics.track('First Deposit Completed', { amount: depositAmount });
      }
      if (milestoneResult.newMilestoneReached) {
        Analytics.track('Milestone Reached', {
          milestone: milestoneResult.newMilestoneReached,
          total_deposits: milestoneResult.depositsCount,
        });
      }

      setCelebrationData({
        amount: depositAmount,
        isFirstDeposit: milestoneResult.isFirstDeposit,
        milestoneReached: milestoneResult.newMilestoneReached,
      });
      setShowCelebration(true);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      Analytics.trackDepositFailed(depositAmount, STRATEGY.name, errorMessage);
      Alert.alert('Failed', errorMessage || 'Please try again');
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    const positionsWithBalance = positions.filter(p => p.shares > BigInt(0));
    Analytics.trackButtonTap('Withdraw All', 'ManageFunds');

    if (positionsWithBalance.length === 0) {
      Analytics.track('Withdraw No Funds');
      Alert.alert('No Funds', 'You have no funds to withdraw.');
      return;
    }

    if (!smartWalletClient || !displayAddress) {
      Analytics.trackWithdrawFailed(savingsAmount, 'Not logged in');
      Alert.alert('Error', 'Please log in first.');
      return;
    }

    const { deposited: depositedAmount } = await getDepositedAndEarnings(displayAddress, savingsAmount);

    const batch = buildWithdrawBatch(
      positions,
      displayAddress as `0x${string}`,
      depositedAmount
    );

    const withdrawAmount = parseFloat(batch.currentValue);
    Analytics.trackWithdrawStarted(withdrawAmount);

    let confirmMessage: string;
    if (batch.hasProfits) {
      confirmMessage = [
        `Your account value: $${batch.currentValue}`,
        ``,
        `Total deposited: $${batch.totalDeposited}`,
        `Earnings: +$${batch.yieldAmount}`,
        ``,
        `Performance fee (15% of earnings): $${batch.feeAmount}`,
        ``,
        `You'll receive: $${batch.userReceives}`,
      ].join('\n');
    } else if (parseFloat(batch.yieldAmount) < 0) {
      confirmMessage = [
        `Your account value: $${batch.currentValue}`,
        ``,
        `No fee applies (withdraw at any time).`,
        ``,
        `You'll receive: $${batch.userReceives}`,
      ].join('\n');
    } else {
      confirmMessage = `Withdraw $${batch.currentValue}?\n\nNo fee applies.`;
    }

    Alert.alert(
      'Withdraw Funds',
      confirmMessage,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            Analytics.trackWithdrawCancelled(withdrawAmount, 'User cancelled');
          },
        },
        {
          text: 'Confirm Withdrawal',
          onPress: async () => {
            Analytics.trackWithdrawConfirmation(withdrawAmount);
            setIsWithdrawing(true);
            const timer = Analytics.createTimer();

            try {
              const txHash = await executeWithdrawBatch(smartWalletClient, batch);
              const duration = timer.stop();

              const currentValue = parseFloat(batch.currentValue);
              await recordWithdrawal(displayAddress, currentValue, currentValue);
              await clearTransactionCache(displayAddress);
              setTotalDeposited(0);

              refetchBalances();
              refetchPositions();

              Analytics.trackWithdrawCompleted(
                withdrawAmount,
                parseFloat(batch.userReceives),
                txHash,
                duration
              );

              let successMessage: string;
              if (batch.hasProfits) {
                successMessage = [
                  `Withdrew $${batch.currentValue}`,
                  ``,
                  `Earnings: +$${batch.yieldAmount}`,
                  `Fee: $${batch.feeAmount}`,
                  ``,
                  `Received: $${batch.userReceives}`,
                ].join('\n');
              } else {
                successMessage = `Withdrew $${batch.currentValue}`;
              }

              Alert.alert('Success', successMessage, [
                { text: 'OK' },
                {
                  text: 'View Details',
                  onPress: () => {
                    Analytics.trackButtonTap('View Details', 'ManageFunds', { type: 'withdraw' });
                    Linking.openURL(`https://basescan.org/tx/${txHash}`);
                  },
                },
              ]);
            } catch (error) {
              const errorMessage = getErrorMessage(error);
              Analytics.trackWithdrawFailed(withdrawAmount, errorMessage);
              Alert.alert('Failed', errorMessage || 'Please try again');
            } finally {
              setIsWithdrawing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity testID="strategies-back-button" onPress={handleGoBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={COLORS.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Funds</Text>
          <View style={styles.headerSpacer} />
        </View>

        <StrategyCard
          positionsLoading={positionsLoading}
          positionsError={positionsError}
          savingsAmount={savingsAmount}
          hasPositions={hasPositions}
          displayApy={displayApy}
          displayDeposited={displayDeposited}
          availableBalance={availableBalance}
          onRetry={handleRetry}
        />

        <View style={styles.tabContainer}>
          <TouchableOpacity
            testID="strategies-deposit-tab"
            style={[styles.tab, activeTab === 'add' && styles.tabActive]}
            onPress={() => {
              Analytics.trackButtonTap('Add Funds Tab', 'ManageFunds');
              setActiveTab('add');
              setAmount('');
            }}
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={activeTab === 'add' ? COLORS.pureWhite : COLORS.grey}
            />
            <Text style={[styles.tabText, activeTab === 'add' && styles.tabTextActive]}>
              Add Funds
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="strategies-withdraw-tab"
            style={[styles.tab, activeTab === 'withdraw' && styles.tabActive]}
            onPress={() => {
              Analytics.trackButtonTap('Withdraw Tab', 'ManageFunds');
              setActiveTab('withdraw');
              setAmount('');
            }}
          >
            <Ionicons
              name="arrow-down-circle-outline"
              size={20}
              color={activeTab === 'withdraw' ? COLORS.pureWhite : COLORS.grey}
            />
            <Text style={[styles.tabText, activeTab === 'withdraw' && styles.tabTextActive]}>
              Withdraw
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionArea}>
          {activeTab === 'add' ? (
            hasSavingsButNoCash ? (
              <AllocationBreakdown
                positions={positions}
                displayApy={displayApy}
                getVaultApy={getVaultApy}
                onAddMoreFunds={() => {
                  Analytics.trackButtonTap('Add More Funds', 'ManageFunds');
                  navigation.goBack();
                }}
              />
            ) : (
              <DepositForm
                amount={amount}
                isDepositing={isDepositing}
                isInputFocused={isInputFocused}
                displayApy={displayApy}
                isTrulyEmpty={isTrulyEmpty}
                amountInputRef={amountInputRef}
                onAmountChange={handleAmountChange}
                onSetMax={handleSetMaxAmount}
                onDeposit={handleDeposit}
                onGoToDashboard={() => {
                  Analytics.trackButtonTap('Go to Dashboard', 'ManageFunds');
                  navigation.goBack();
                }}
                onInputFocus={() => {
                  setIsInputFocused(true);
                  Analytics.trackInputFocus('Amount', 'ManageFunds');
                }}
                onInputBlur={() => setIsInputFocused(false)}
              />
            )
          ) : (
            <WithdrawConfirmation
              hasPositions={hasPositions}
              savingsAmount={savingsAmount}
              displayDeposited={displayDeposited}
              totalYield={totalYield}
              youReceive={youReceive}
              isWithdrawing={isWithdrawing}
              onWithdraw={handleWithdraw}
            />
          )}
        </View>

        {!(hasSavingsButNoCash && activeTab === 'add') && (
          <HowItWorksSection
            positions={positions}
            getVaultApy={getVaultApy}
            showHowItWorks={showHowItWorks}
            onToggleHowItWorks={() => {
              Analytics.trackButtonTap('How It Works', 'ManageFunds', { expanded: !showHowItWorks });
              setShowHowItWorks(!showHowItWorks);
            }}
          />
        )}

        <FeeAndTrustSection />
      </ScrollView>

      {celebrationData && (
        <CelebrationModal
          visible={showCelebration}
          onClose={() => {
            setShowCelebration(false);
            setCelebrationData(null);
            Analytics.trackButtonTap('View Savings', 'Celebration');
          }}
          amount={celebrationData.amount}
          apy={parseFloat(displayApy)}
          isFirstDeposit={celebrationData.isFirstDeposit}
          milestoneReached={celebrationData.milestoneReached}
        />
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.pureWhite,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  headerSpacer: {
    width: 44,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.pureWhite,
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.grey,
  },
  tabTextActive: {
    color: COLORS.pureWhite,
  },
  actionArea: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
});
