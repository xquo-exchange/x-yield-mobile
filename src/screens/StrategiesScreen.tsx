/**
 * ManageFundsScreen (formerly StrategiesScreen)
 *
 * Calm, fintech-first approach to managing deposits and withdrawals.
 * Hides crypto complexity, emphasizes trust and simplicity.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import * as Analytics from '../services/analytics';
import { trackTrustSignalViewed } from '../services/analytics';
import SensitiveView from '../components/SensitiveView';
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
  recordDeposit,
  recordWithdrawal,
} from '../services/depositTracker';
import {
  getNetDepositedFromBlockchain,
  clearTransactionCache,
} from '../services/transactionHistory';
import { recordDepositMilestone } from '../services/milestoneTracker';
import { checkAndAwardBadges } from '../services/badges';
import CelebrationModal from '../components/CelebrationModal';
import { getErrorMessage } from '../utils/errorHelpers';
import { COLORS } from '../constants/colors';
import { AnimatedEarned } from '../components/AnimatedBalance';

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
  const [activeTab, setActiveTab] = useState<TabType>('add');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const amountInputRef = useRef<TextInput>(null);

  // Celebration modal state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{
    amount: number;
    isFirstDeposit: boolean;
    milestoneReached: number | null;
  } | null>(null);

  // Memoize expensive computations
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

  // Analytics: Track screen view on mount
  useEffect(() => {
    Analytics.trackScreenView('ManageFunds');
    // Track trust signals viewed on screen mount
    trackTrustSignalViewed('audited_contracts', 'ManageFunds');
    trackTrustSignalViewed('withdraw_anytime', 'ManageFunds');
    return () => Analytics.trackScreenExit('ManageFunds');
  }, []);

  // Calculate earnings for display - memoized to prevent recalculation on every render
  const totalYield = useMemo(
    () => totalDeposited > 0 ? Math.max(0, savingsAmount - totalDeposited) : 0,
    [totalDeposited, savingsAmount]
  );
  const youReceive = savingsAmount; // Full balance shown, fee calculated at confirmation

  // If using smart wallet, the EOA is "internal" (transfers between them aren't external)
  const otherOwnedAddress = smartWalletAddress && embeddedWalletAddress ? embeddedWalletAddress : undefined;

  React.useEffect(() => {
    const loadDeposited = async () => {
      if (displayAddress) {
        // Use blockchain data for consistent display with Statements screen
        const deposited = await getNetDepositedFromBlockchain(displayAddress, otherOwnedAddress);
        setTotalDeposited(deposited);
      }
    };
    loadDeposited();
  }, [displayAddress, positions, savingsAmount, otherOwnedAddress]);

  const onRefresh = useCallback(async () => {
    Analytics.trackButtonTap('Pull to Refresh', 'ManageFunds');
    const timer = Analytics.createTimer();
    setRefreshing(true);
    await Promise.all([refetchBalances(), refetchPositions(), refetchApy()]);
    setRefreshing(false);
    Analytics.trackBalanceFetchDuration(timer.stop());
  }, [refetchBalances, refetchPositions, refetchApy]);

  // Memoized navigation handlers
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

      const txHash = await executeStrategyBatch(smartWalletClient, batch);
      const duration = timer.stop();

      await recordDeposit(displayAddress, depositAmount, txHash);

      // Clear cache so next fetch gets fresh blockchain data
      await clearTransactionCache(displayAddress);

      // Optimistic update: add deposit to current total (blockchain will catch up)
      setTotalDeposited(prev => prev + depositAmount);

      // Record milestone and check for achievements
      const milestoneResult = await recordDepositMilestone(depositAmount);

      // Award badges for this deposit (walletAddress required for blockchain deposit count)
      await checkAndAwardBadges({
        savingsBalance: savingsAmount + depositAmount,
        walletAddress: displayAddress,
        justMadeDeposit: true,
      });

      setAmount('');
      refetchBalances();
      refetchPositions();

      Analytics.trackDepositSuccess(depositAmount, STRATEGY.name, txHash, duration);

      // Track milestone events
      if (milestoneResult.isFirstDeposit) {
        Analytics.track('First Deposit Completed', { amount: depositAmount });
      }
      if (milestoneResult.newMilestoneReached) {
        Analytics.track('Milestone Reached', {
          milestone: milestoneResult.newMilestoneReached,
          total_deposits: milestoneResult.depositsCount,
        });
      }

      // Show celebration modal
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

    // Use blockchain data for accurate fee calculation (consistent with Statements)
    const depositedAmount = await getNetDepositedFromBlockchain(displayAddress, otherOwnedAddress);

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

              // Clear cache so next fetch gets fresh blockchain data
              await clearTransactionCache(displayAddress);

              // Reset deposited to 0 (full withdrawal)
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

  // Calculate earnings
  const totalEarned = totalDeposited > 0 ? Math.max(0, savingsAmount - totalDeposited) : 0;

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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity testID="strategies-back-button" onPress={handleGoBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={COLORS.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Funds</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Account Summary Card */}
        <View style={styles.summaryCard}>
          {positionsLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : positionsError ? (
            <View style={styles.errorState}>
              <Ionicons name="alert-circle-outline" size={24} color={COLORS.grey} />
              <Text style={styles.errorText}>Unable to load account</Text>
              <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.summaryLabel}>Yield Account Balance</Text>
              <SensitiveView>
                <Text style={styles.summaryValue}>${savingsAmount.toFixed(2)}</Text>
              </SensitiveView>

              {hasPositions && (
                <View style={styles.earningRow}>
                  <View style={styles.earningDot} />
                  <Text style={styles.earningText}>
                    Earning {displayApy}% APY
                  </Text>
                </View>
              )}

              {totalDeposited > 0 && (
                <SensitiveView>
                  <View style={styles.earningsDisplay}>
                    <Text style={styles.earningsLabel}>Total earned</Text>
                    <AnimatedEarned
                      currentBalance={savingsAmount}
                      depositedAmount={totalDeposited}
                      apy={parseFloat(displayApy)}
                    />
                  </View>
                </SensitiveView>
              )}
            </>
          )}
        </View>

        {/* Available Balance */}
        <View style={styles.availableCard}>
          <Text style={styles.availableLabel}>Available to add</Text>
          <SensitiveView>
            <Text style={styles.availableValue}>${availableBalance.toFixed(2)}</Text>
          </SensitiveView>
        </View>

        {/* Tab Selector */}
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

        {/* Action Area */}
        <View style={styles.actionArea}>
          {activeTab === 'add' ? (
            // Add Funds Tab
            availableBalance <= 0 ? (
              // Zero balance state - show helpful guidance
              <View style={styles.zeroBalanceGuide}>
                <View style={styles.zeroBalanceIconContainer}>
                  <Ionicons name="wallet-outline" size={36} color={COLORS.secondary} />
                </View>
                <Text style={styles.zeroBalanceTitle}>No funds available</Text>
                <Text style={styles.zeroBalanceText}>
                  First, add USDC to your Cash account. Then come back here to move it to Savings and start earning {displayApy}% APY.
                </Text>

                <View style={styles.zeroBalanceSteps}>
                  <View style={styles.zeroBalanceStep}>
                    <View style={styles.zeroBalanceStepDot} />
                    <Text style={styles.zeroBalanceStepText}>Buy USDC with card via Coinbase</Text>
                  </View>
                  <View style={styles.zeroBalanceStep}>
                    <View style={styles.zeroBalanceStepDot} />
                    <Text style={styles.zeroBalanceStepText}>Or transfer USDC from another wallet</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.zeroBalanceButton}
                  onPress={() => {
                    Analytics.trackButtonTap('Go to Dashboard', 'ManageFunds');
                    navigation.goBack();
                  }}
                >
                  <Ionicons name="arrow-back" size={18} color={COLORS.pureWhite} />
                  <Text style={styles.zeroBalanceButtonText}>Add Funds on Dashboard</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Normal add funds UI
              <>
                <Text style={styles.inputLabel}>Amount to add</Text>
                <View style={styles.inputRow}>
                  <View style={styles.inputTouchable}>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => {
                        // Focus input when tapping the $ prefix
                        amountInputRef.current?.focus();
                      }}
                    >
                      <View style={[styles.currencyPrefix, isInputFocused && styles.inputFocused]}>
                        <Text style={styles.currencyText}>$</Text>
                      </View>
                    </TouchableOpacity>
                    <TextInput
                      testID="strategies-amount-input"
                      ref={amountInputRef}
                      style={[styles.input, isInputFocused && styles.inputFocused]}
                      value={amount}
                      onChangeText={handleAmountChange}
                      placeholder="0.00"
                      placeholderTextColor={COLORS.grey}
                      keyboardType="decimal-pad"
                      autoCorrect={false}
                      spellCheck={false}
                      editable={true}
                      onFocus={() => {
                        setIsInputFocused(true);
                        Analytics.trackInputFocus('Amount', 'ManageFunds');
                      }}
                      onBlur={() => setIsInputFocused(false)}
                    />
                  </View>
                  <TouchableOpacity style={styles.maxButton} onPress={handleSetMaxAmount}>
                    <Text style={styles.maxButtonText}>MAX</Text>
                  </TouchableOpacity>
                </View>

                {/* Trust Signals */}
                <View style={styles.depositTrustSignals}>
                  <View style={styles.depositTrustItem}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.grey} />
                    <Text style={styles.depositTrustText}>Audited contracts</Text>
                  </View>
                  <View style={styles.depositTrustItem}>
                    <Ionicons name="time-outline" size={14} color={COLORS.grey} />
                    <Text style={styles.depositTrustText}>Withdraw anytime</Text>
                  </View>
                </View>

                <TouchableOpacity
                  testID="strategies-deposit-button"
                  style={[
                    styles.actionButton,
                    (!amount || parseFloat(amount) <= 0 || isDepositing) && styles.actionButtonDisabled,
                  ]}
                  onPress={handleDeposit}
                  disabled={!amount || parseFloat(amount) <= 0 || isDepositing}
                >
                  {isDepositing ? (
                    <ActivityIndicator color={COLORS.pureWhite} />
                  ) : (
                    <Text style={styles.actionButtonText}>
                      {amount && parseFloat(amount) > 0 ? `Add $${parseFloat(amount).toFixed(2)}` : 'Add Funds'}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )
          ) : (
            // Withdraw Tab - Full withdrawal only
            <>
              {!hasPositions ? (
                <View style={styles.noFundsState}>
                  <Ionicons name="wallet-outline" size={40} color={COLORS.primary} />
                  <Text style={styles.noFundsText}>No funds to withdraw</Text>
                  <Text style={styles.noFundsSubtext}>
                    Add funds first to start earning yield
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.withdrawTitle}>Withdraw all funds</Text>

                  {/* Withdrawal Summary */}
                  <View style={styles.withdrawPreview}>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>Account balance</Text>
                      <Text style={styles.previewValue}>${savingsAmount.toFixed(2)}</Text>
                    </View>
                    {totalYield > 0.001 && (
                      <>
                        <View style={styles.previewRow}>
                          <Text style={styles.previewLabel}>Total deposited</Text>
                          <Text style={styles.previewValue}>${totalDeposited.toFixed(2)}</Text>
                        </View>
                        <View style={styles.previewRow}>
                          <Text style={styles.previewLabel}>Earnings</Text>
                          <Text style={[styles.previewValue, { color: COLORS.success }]}>+${totalYield.toFixed(2)}</Text>
                        </View>
                      </>
                    )}
                    <View style={[styles.previewRow, styles.previewRowTotal]}>
                      <Text style={styles.previewLabelBold}>You receive</Text>
                      <Text style={styles.previewValueBold}>${youReceive.toFixed(2)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    testID="strategies-withdraw-button"
                    style={[
                      styles.actionButton,
                      isWithdrawing && styles.actionButtonDisabled,
                    ]}
                    onPress={handleWithdraw}
                    disabled={isWithdrawing}
                  >
                    {isWithdrawing ? (
                      <ActivityIndicator color={COLORS.pureWhite} />
                    ) : (
                      <Text style={styles.actionButtonText}>Withdraw All</Text>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.withdrawNote}>
                    Funds arrive instantly in your Cash account.
                  </Text>
                </>
              )}
            </>
          )}
        </View>

        {/* How It Works - Expandable */}
        <TouchableOpacity
          style={styles.howItWorksHeader}
          onPress={() => {
            Analytics.trackButtonTap('How It Works', 'ManageFunds', { expanded: !showHowItWorks });
            setShowHowItWorks(!showHowItWorks);
          }}
        >
          <View style={styles.howItWorksLeft}>
            <Ionicons name="help-circle-outline" size={20} color={COLORS.secondary} />
            <Text style={styles.howItWorksTitle}>Where do my funds go?</Text>
          </View>
          <Ionicons
            name={showHowItWorks ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={COLORS.grey}
          />
        </TouchableOpacity>

        {showHowItWorks && (
          <View style={styles.howItWorksContent}>
            <Text style={styles.howItWorksText}>
              Your funds are deposited into regulated DeFi lending protocols where they earn yield from borrowers.
              You maintain full ownership at all times.
            </Text>

            <View style={styles.protocolsList}>
              <Text style={styles.protocolsLabel}>Current allocation:</Text>
              {positions.map((position) => {
                const vaultApy = getVaultApy(position.vaultAddress);
                const positionValue = parseFloat(position.usdValue);
                if (positionValue <= 0) return null;
                return (
                  <View key={position.vaultId} style={styles.protocolRow}>
                    <Text style={styles.protocolName}>{position.vaultName}</Text>
                    <View style={styles.protocolRight}>
                      <Text style={styles.protocolValue}>${positionValue.toFixed(2)}</Text>
                      {vaultApy && (
                        <Text style={styles.protocolApy}>{vaultApy}%</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Fee Transparency */}
        <View style={styles.feeSection}>
          <Text style={styles.feeSectionTitle}>Fee Structure</Text>

          <View style={styles.feeRow}>
            <View style={styles.feeLeft}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
              <Text style={styles.feeLabel}>Deposit & Withdraw</Text>
            </View>
            <Text style={styles.feeValue}>Free</Text>
          </View>

          <View style={styles.feeRow}>
            <View style={styles.feeLeft}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
              <Text style={styles.feeLabel}>Gas fees</Text>
            </View>
            <Text style={styles.feeValue}>Covered</Text>
          </View>

          <View style={styles.feeRow}>
            <View style={styles.feeLeft}>
              <Ionicons name="information-circle" size={18} color={COLORS.secondary} />
              <Text style={styles.feeLabel}>Performance fee</Text>
            </View>
            <Text style={styles.feeValue}>15% of earnings</Text>
          </View>

          <Text style={styles.feeNote}>
            You only pay fees on profits. No profit = no fee.
          </Text>
        </View>

        {/* Trust Indicators */}
        <View style={styles.trustSection}>
          <View style={styles.trustRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
            <Text style={styles.trustText}>Non-custodial - you control your funds</Text>
          </View>
          <View style={styles.trustRow}>
            <Ionicons name="time-outline" size={18} color={COLORS.primary} />
            <Text style={styles.trustText}>Exit anytime - no lock-up period</Text>
          </View>
          <View style={styles.trustRow}>
            <Ionicons name="eye-outline" size={18} color={COLORS.primary} />
            <Text style={styles.trustText}>Fully transparent - all transactions on-chain</Text>
          </View>
        </View>
      </ScrollView>

      {/* Celebration Modal */}
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
  // Header
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
  // Summary Card
  summaryCard: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.black,
    fontVariant: ['tabular-nums'],
  },
  earningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  earningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  earningText: {
    fontSize: 14,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  earningsDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: `${COLORS.success}15`,
    borderRadius: 8,
    gap: 8,
  },
  earningsLabel: {
    fontSize: 13,
    color: COLORS.grey,
  },
  loadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  loadingText: {
    color: COLORS.grey,
    fontSize: 15,
  },
  errorState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  errorText: {
    color: COLORS.grey,
    fontSize: 15,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryButtonText: {
    color: COLORS.black,
    fontSize: 14,
    fontWeight: '500',
  },
  // Available Card
  availableCard: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  availableLabel: {
    fontSize: 14,
    color: COLORS.grey,
  },
  availableValue: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.black,
  },
  // Tab Selector
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
  // Action Area
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
  inputLabel: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  inputTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 12,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRightWidth: 0,
  },
  currencyText: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.grey,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.pureWhite,
    borderRadius: 12,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    paddingVertical: 16,
    paddingHorizontal: 8,
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.black,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 0,
  },
  inputFocused: {
    borderColor: COLORS.secondary,
  },
  maxButton: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 12,
    marginLeft: 12,
  },
  maxButtonText: {
    color: COLORS.pureWhite,
    fontWeight: '700',
    fontSize: 13,
  },
  depositTrustSignals: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  depositTrustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  depositTrustText: {
    fontSize: 12,
    color: COLORS.grey,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
  },
  withdrawButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: COLORS.border,
    borderColor: COLORS.border,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  withdrawButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primary,
  },
  withdrawInfo: {
    fontSize: 15,
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: 20,
  },
  withdrawTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: 20,
  },
  withdrawNote: {
    fontSize: 13,
    color: COLORS.grey,
    textAlign: 'center',
    marginTop: 16,
  },
  withdrawPreview: {
    backgroundColor: 'rgba(32, 1, 145, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewRowTotal: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(32, 1, 145, 0.1)',
    paddingTop: 10,
    marginTop: 4,
  },
  previewLabel: {
    fontSize: 14,
    color: COLORS.grey,
  },
  previewValue: {
    fontSize: 14,
    color: COLORS.black,
    fontWeight: '500',
  },
  previewLabelBold: {
    fontSize: 15,
    color: COLORS.black,
    fontWeight: '600',
  },
  previewValueBold: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: '700',
  },
  noFundsState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  noFundsText: {
    fontSize: 16,
    color: COLORS.black,
    fontWeight: '500',
    marginTop: 8,
  },
  noFundsSubtext: {
    fontSize: 14,
    color: COLORS.grey,
  },
  // Zero Balance Guide
  zeroBalanceGuide: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  zeroBalanceIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${COLORS.secondary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  zeroBalanceTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 8,
  },
  zeroBalanceText: {
    fontSize: 14,
    color: COLORS.grey,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  zeroBalanceSteps: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  zeroBalanceStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  zeroBalanceStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
  },
  zeroBalanceStepText: {
    fontSize: 14,
    color: COLORS.grey,
    flex: 1,
  },
  zeroBalanceButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  zeroBalanceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  // How It Works
  howItWorksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  howItWorksLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  howItWorksTitle: {
    fontSize: 15,
    color: COLORS.grey,
  },
  howItWorksContent: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 20,
    marginTop: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  howItWorksText: {
    fontSize: 14,
    color: COLORS.grey,
    lineHeight: 22,
    marginBottom: 16,
  },
  protocolsList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
  },
  protocolsLabel: {
    fontSize: 13,
    color: COLORS.grey,
    marginBottom: 12,
  },
  protocolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  protocolName: {
    fontSize: 14,
    color: COLORS.black,
    flex: 1,
  },
  protocolRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  protocolValue: {
    fontSize: 14,
    color: COLORS.black,
    fontWeight: '500',
  },
  protocolApy: {
    fontSize: 12,
    color: COLORS.secondary,
    backgroundColor: `${COLORS.secondary}15`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  // Fee Section
  feeSection: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  feeSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 16,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  feeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  feeLabel: {
    fontSize: 14,
    color: COLORS.grey,
  },
  feeValue: {
    fontSize: 14,
    color: COLORS.black,
    fontWeight: '500',
  },
  feeNote: {
    fontSize: 13,
    color: COLORS.grey,
    marginTop: 12,
    fontStyle: 'italic',
  },
  // Trust Section
  trustSection: {
    gap: 14,
    paddingBottom: 20,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trustText: {
    fontSize: 13,
    color: COLORS.grey,
  },
});
