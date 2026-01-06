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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';
import { useEmbeddedEthereumWallet } from '@privy-io/expo';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { STRATEGIES, getRiskLevelColor } from '../constants/strategies';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { usePositions } from '../hooks/usePositions';
import {
  buildStrategyBatch,
  executeStrategyBatch,
  calculateAllocations,
  buildWithdrawBatch,
  executeWithdrawBatch,
} from '../services/strategyExecution';

type StrategiesScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Strategies'>;
};

const STRATEGY = STRATEGIES.find(s => s.id === 'conservative-usdc')!;

export default function StrategiesScreen({ navigation }: StrategiesScreenProps) {
  const { client: smartWalletClient } = useSmartWallets();
  const embeddedWallet = useEmbeddedEthereumWallet();
  const wallets = embeddedWallet?.wallets || [];
  const embeddedWalletAddress = wallets.length > 0 ? wallets[0].address : '';
  const smartWalletAddress = smartWalletClient?.account?.address || '';
  const displayAddress = smartWalletAddress || embeddedWalletAddress;

  const { usdc, refetch: refetchBalances } = useWalletBalance(displayAddress);
  const { positions, totalUsdValue: positionsTotal, isLoading: positionsLoading, error: positionsError, refetch: refetchPositions } = usePositions(displayAddress);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBalances(), refetchPositions()]);
    setRefreshing(false);
  }, [refetchBalances, refetchPositions]);

  const handleAmountChange = (value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    setAmount(sanitized);
  };

  const handleSetMaxAmount = () => {
    if (usdc) {
      setAmount(usdc.balance);
    }
  };

  const allocations = amount && parseFloat(amount) > 0
    ? calculateAllocations(STRATEGY, amount)
    : [];

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Enter Amount', 'Please enter an amount to deposit');
      return;
    }

    if (!smartWalletClient || !displayAddress) {
      Alert.alert('Wallet Error', 'Smart wallet not available. Please log in first.');
      return;
    }

    if (usdc && parseFloat(amount) > parseFloat(usdc.balance)) {
      Alert.alert('Insufficient Balance', `You only have ${parseFloat(usdc.balance).toFixed(2)} USDC`);
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

      setAmount('');
      // Refetch balances and positions after successful deposit
      refetchBalances();
      refetchPositions();

      Alert.alert(
        'Deposit Confirmed!',
        `Successfully deposited ${amount} USDC.\n\nTx: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert('Deposit Failed', (error as Error)?.message || 'An error occurred');
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdrawAll = async () => {
    const positionsWithBalance = positions.filter(p => p.shares > BigInt(0));

    if (positionsWithBalance.length === 0) {
      Alert.alert('No Positions', 'You have no positions to withdraw.');
      return;
    }

    if (!smartWalletClient || !displayAddress) {
      Alert.alert('Wallet Error', 'Smart wallet not available. Please log in first.');
      return;
    }

    // Confirm withdrawal
    Alert.alert(
      'Withdraw All',
      `Withdraw $${positionsTotal} from ${positionsWithBalance.length} vault(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setIsWithdrawing(true);

            try {
              const batch = buildWithdrawBatch(
                positions,
                displayAddress as `0x${string}`
              );

              const txHash = await executeWithdrawBatch(smartWalletClient, batch);

              // Refresh balances and positions
              refetchBalances();
              refetchPositions();

              Alert.alert(
                'Withdrawal Complete!',
                `Successfully withdrew $${batch.totalUsdValue} USDC.\n\nTx: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`,
                [{ text: 'OK' }]
              );
            } catch (error) {
              Alert.alert('Withdrawal Failed', (error as Error)?.message || 'An error occurred');
            } finally {
              setIsWithdrawing(false);
            }
          },
        },
      ]
    );
  };

  const riskColor = getRiskLevelColor(STRATEGY.riskLevel);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Earn Yield</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Your Positions */}
        <View style={styles.positionsSection}>
          <View style={styles.positionsHeader}>
            <Text style={styles.sectionTitle}>Your Positions</Text>
            {parseFloat(positionsTotal) > 0 && (
              <Text style={styles.positionsTotal}>${positionsTotal}</Text>
            )}
          </View>

          {positionsLoading ? (
            <View style={styles.positionsLoading}>
              <ActivityIndicator size="small" color="#22c55e" />
              <Text style={styles.positionsLoadingText}>Loading positions...</Text>
            </View>
          ) : positionsError ? (
            <View style={styles.positionsError}>
              <Text style={styles.positionsErrorText}>Failed to load positions</Text>
              <TouchableOpacity onPress={refetchPositions} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : positions.length === 0 ? (
            <View style={styles.noPositions}>
              <Text style={styles.noPositionsText}>No positions yet</Text>
              <Text style={styles.noPositionsSubtext}>Deposit USDC below to start earning yield</Text>
            </View>
          ) : (
            <View style={styles.positionsList}>
              {positions.map((position, index) => (
                <View key={position.vaultId} style={[
                  styles.positionRow,
                  index < positions.length - 1 && styles.positionRowBorder
                ]}>
                  <View style={styles.positionInfo}>
                    <Text style={styles.positionVaultName}>{position.vaultName}</Text>
                    <Text style={styles.positionShares}>
                      {parseFloat(position.sharesFormatted).toFixed(6)} shares
                    </Text>
                  </View>
                  <View style={styles.positionValue}>
                    <Text style={styles.positionAmount}>
                      {parseFloat(position.assetsFormatted).toFixed(2)} USDC
                    </Text>
                    <Text style={styles.positionUsd}>${position.usdValue}</Text>
                  </View>
                </View>
              ))}

              {/* Withdraw All Button */}
              {positions.some(p => p.shares > BigInt(0)) && (
                <TouchableOpacity
                  style={[styles.withdrawButton, isWithdrawing && styles.withdrawButtonDisabled]}
                  onPress={handleWithdrawAll}
                  disabled={isWithdrawing}
                >
                  {isWithdrawing ? (
                    <ActivityIndicator color="#ef4444" size="small" />
                  ) : (
                    <Text style={styles.withdrawButtonText}>Withdraw All</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available to Deposit</Text>
          <Text style={styles.balanceValue}>
            {usdc ? parseFloat(usdc.balance).toFixed(2) : '0.00'} USDC
          </Text>
        </View>

        {/* Strategy Info */}
        <View style={styles.strategyCard}>
          <View style={styles.strategyHeader}>
            <View style={styles.strategyIcon}>
              <Text style={styles.strategyIconText}>$</Text>
            </View>
            <View style={styles.strategyInfo}>
              <Text style={styles.strategyName}>{STRATEGY.name}</Text>
              <View style={[styles.riskBadge, { backgroundColor: `${riskColor}20` }]}>
                <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
                <Text style={[styles.riskText, { color: riskColor }]}>Low Risk</Text>
              </View>
            </View>
            <View style={styles.apyContainer}>
              <Text style={styles.apyValue}>{STRATEGY.expectedApy.toFixed(1)}%</Text>
              <Text style={styles.apyLabel}>APY</Text>
            </View>
          </View>
          <Text style={styles.strategyDescription}>{STRATEGY.description}</Text>
        </View>

        {/* Amount Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Deposit Amount</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={handleAmountChange}
              placeholder="0.00"
              placeholderTextColor="#52525b"
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={styles.maxButton} onPress={handleSetMaxAmount}>
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Allocation Preview */}
        {allocations.length > 0 && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Your deposit will be split into:</Text>
            {allocations.map((alloc, index) => (
              <View key={index} style={styles.previewRow}>
                <Text style={styles.previewVaultName}>{alloc.vault.name}</Text>
                <Text style={styles.previewAmount}>
                  {parseFloat(alloc.amount).toFixed(2)} USDC ({alloc.percentage}%)
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Deposit Button */}
        <TouchableOpacity
          style={[
            styles.depositButton,
            (!amount || parseFloat(amount) <= 0 || isDepositing) && styles.depositButtonDisabled,
          ]}
          onPress={handleDeposit}
          disabled={!amount || parseFloat(amount) <= 0 || isDepositing}
        >
          {isDepositing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.depositButtonText}>
              Deposit {amount || '0'} USDC
            </Text>
          )}
        </TouchableOpacity>

        {/* Info Footer */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>*</Text>
            <Text style={styles.infoText}>Gas fees are sponsored - free for you</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>*</Text>
            <Text style={styles.infoText}>Withdraw anytime, no lock-up period</Text>
          </View>
        </View>
      </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerSpacer: {
    width: 40,
  },
  // Positions Section
  positionsSection: {
    backgroundColor: '#141419',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  positionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  positionsTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#22c55e',
  },
  positionsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  positionsLoadingText: {
    marginLeft: 8,
    color: '#71717a',
    fontSize: 14,
  },
  positionsError: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  positionsErrorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 8,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#27272a',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  noPositions: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  noPositionsText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  noPositionsSubtext: {
    color: '#71717a',
    fontSize: 13,
  },
  positionsList: {
    marginTop: 4,
  },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  positionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  positionInfo: {
    flex: 1,
  },
  positionVaultName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 2,
  },
  positionShares: {
    fontSize: 12,
    color: '#71717a',
  },
  positionValue: {
    alignItems: 'flex-end',
  },
  positionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
    marginBottom: 2,
  },
  positionUsd: {
    fontSize: 12,
    color: '#71717a',
  },
  withdrawButton: {
    marginTop: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  withdrawButtonDisabled: {
    borderColor: '#52525b',
  },
  withdrawButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  // Balance Card
  balanceCard: {
    backgroundColor: '#141419',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#71717a',
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
  },
  // Strategy Card
  strategyCard: {
    backgroundColor: '#1a2e1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  strategyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  strategyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#22c55e20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  strategyIconText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#22c55e',
  },
  strategyInfo: {
    flex: 1,
  },
  strategyName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  riskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  riskText: {
    fontSize: 12,
    fontWeight: '500',
  },
  apyContainer: {
    alignItems: 'flex-end',
  },
  apyValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#22c55e',
  },
  apyLabel: {
    fontSize: 12,
    color: '#71717a',
  },
  strategyDescription: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
  },
  // Input Section
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#71717a',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#141419',
    borderRadius: 12,
    padding: 18,
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  maxButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    marginLeft: 12,
  },
  maxButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  // Preview Card
  previewCard: {
    backgroundColor: '#141419',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  previewTitle: {
    fontSize: 13,
    color: '#71717a',
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  previewVaultName: {
    fontSize: 14,
    color: '#ffffff',
  },
  previewAmount: {
    fontSize: 14,
    color: '#22c55e',
    fontWeight: '500',
  },
  // Deposit Button
  depositButton: {
    backgroundColor: '#22c55e',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  depositButtonDisabled: {
    backgroundColor: '#27272a',
  },
  depositButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  // Info Section
  infoSection: {
    backgroundColor: '#141419',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  infoIcon: {
    fontSize: 12,
    color: '#22c55e',
    marginRight: 10,
    marginTop: 2,
  },
  infoText: {
    fontSize: 13,
    color: '#71717a',
    flex: 1,
  },
});
