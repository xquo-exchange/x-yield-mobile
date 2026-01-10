/**
 * ManageFundsScreen (formerly StrategiesScreen)
 *
 * Calm, fintech-first approach to managing deposits and withdrawals.
 * Hides crypto complexity, emphasizes trust and simplicity.
 */

import React, { useState, useCallback } from 'react';
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
} from 'react-native';
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
  getTotalDeposited,
  recordWithdrawal,
  recoverMissingDeposit,
} from '../services/depositTracker';

// Color Palette - PayPal/Revolut Style
const COLORS = {
  primary: '#200191',
  secondary: '#6198FF',
  white: '#F5F6FF',
  grey: '#484848',
  black: '#00041B',
  pureWhite: '#FFFFFF',
  border: '#E5E5E5',
  success: '#22C55E',
  disabled: '#A0A0A0',
};

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

  const hasPositions = positions.some(p => p.shares > BigInt(0));
  const savingsAmount = parseFloat(positionsTotal) || 0;
  const availableBalance = usdc ? parseFloat(usdc.balance) : 0;

  // Calculate earnings for display (fee is handled in handleWithdraw)
  const totalYield = totalDeposited > 0 ? Math.max(0, savingsAmount - totalDeposited) : 0;
  const youReceive = savingsAmount; // Full balance shown, fee calculated at confirmation

  React.useEffect(() => {
    const loadDeposited = async () => {
      if (displayAddress && savingsAmount > 0) {
        await recoverMissingDeposit(displayAddress, savingsAmount);
        const deposited = await getTotalDeposited(displayAddress);
        setTotalDeposited(deposited);
      } else if (displayAddress) {
        const deposited = await getTotalDeposited(displayAddress);
        setTotalDeposited(deposited);
      }
    };
    loadDeposited();
  }, [displayAddress, positions, savingsAmount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBalances(), refetchPositions(), refetchApy()]);
    setRefreshing(false);
  }, [refetchBalances, refetchPositions, refetchApy]);

  const handleAmountChange = (value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    setAmount(sanitized);
  };

  const handleSetMaxAmount = () => {
    if (usdc) {
      setAmount(usdc.balance);
    }
  };

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Enter Amount', 'Please enter an amount to add');
      return;
    }

    if (!smartWalletClient || !displayAddress) {
      Alert.alert('Error', 'Please log in first.');
      return;
    }

    if (usdc && parseFloat(amount) > parseFloat(usdc.balance)) {
      Alert.alert('Insufficient Balance', `You only have $${parseFloat(usdc.balance).toFixed(2)} available`);
      return;
    }

    setIsDepositing(true);

    try {
      const batch = buildStrategyBatch(
        STRATEGY,
        amount,
        displayAddress as `0x${string}`
      );

      const txHash = await executeStrategyBatch(smartWalletClient, batch);

      const depositAmount = parseFloat(amount);
      await recordDeposit(displayAddress, depositAmount);

      const newTotalDeposited = await getTotalDeposited(displayAddress);
      setTotalDeposited(newTotalDeposited);

      setAmount('');
      refetchBalances();
      refetchPositions();

      Alert.alert(
        'Success',
        `$${depositAmount.toFixed(2)} added to your yield account.`,
        [
          { text: 'OK' },
          {
            text: 'View Details',
            onPress: () => Linking.openURL(`https://basescan.org/tx/${txHash}`),
          },
        ]
      );
    } catch (error) {
      Alert.alert('Failed', (error as Error)?.message || 'Please try again');
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    const positionsWithBalance = positions.filter(p => p.shares > BigInt(0));

    if (positionsWithBalance.length === 0) {
      Alert.alert('No Funds', 'You have no funds to withdraw.');
      return;
    }

    if (!smartWalletClient || !displayAddress) {
      Alert.alert('Error', 'Please log in first.');
      return;
    }

    const totalDeposited = await getTotalDeposited(displayAddress);

    const batch = buildWithdrawBatch(
      positions,
      displayAddress as `0x${string}`,
      totalDeposited
    );

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
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Withdrawal',
          onPress: async () => {
            setIsWithdrawing(true);

            try {
              const txHash = await executeWithdrawBatch(smartWalletClient, batch);

              const currentValue = parseFloat(batch.currentValue);
              await recordWithdrawal(displayAddress, currentValue, currentValue);

              refetchBalances();
              refetchPositions();

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
                  onPress: () => Linking.openURL(`https://basescan.org/tx/${txHash}`),
                },
              ]);
            } catch (error) {
              Alert.alert('Failed', (error as Error)?.message || 'Please try again');
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
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
              <TouchableOpacity onPress={refetchPositions} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.summaryLabel}>Yield Account Balance</Text>
              <Text style={styles.summaryValue}>${savingsAmount.toFixed(2)}</Text>

              {hasPositions && (
                <View style={styles.earningRow}>
                  <View style={styles.earningDot} />
                  <Text style={styles.earningText}>
                    Earning {displayApy}% APY
                  </Text>
                </View>
              )}

              {totalDeposited > 0 && (
                <View style={styles.earningsDisplay}>
                  <Text style={styles.earningsLabel}>Total earned</Text>
                  <AnimatedEarned
                    currentBalance={savingsAmount}
                    depositedAmount={totalDeposited}
                    apy={parseFloat(displayApy)}
                  />
                </View>
              )}
            </>
          )}
        </View>

        {/* Available Balance */}
        <View style={styles.availableCard}>
          <Text style={styles.availableLabel}>Available to add</Text>
          <Text style={styles.availableValue}>${availableBalance.toFixed(2)}</Text>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'add' && styles.tabActive]}
            onPress={() => { setActiveTab('add'); setAmount(''); }}
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
            style={[styles.tab, activeTab === 'withdraw' && styles.tabActive]}
            onPress={() => { setActiveTab('withdraw'); setAmount(''); }}
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
            <>
              <Text style={styles.inputLabel}>Amount to add</Text>
              <View style={styles.inputRow}>
                <View style={[styles.currencyPrefix, isInputFocused && styles.inputFocused]}>
                  <Text style={styles.currencyText}>$</Text>
                </View>
                <TextInput
                  style={[styles.input, isInputFocused && styles.inputFocused]}
                  value={amount}
                  onChangeText={handleAmountChange}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.grey}
                  keyboardType="decimal-pad"
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                />
                <TouchableOpacity style={styles.maxButton} onPress={handleSetMaxAmount}>
                  <Text style={styles.maxButtonText}>MAX</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
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
          onPress={() => setShowHowItWorks(!showHowItWorks)}
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
