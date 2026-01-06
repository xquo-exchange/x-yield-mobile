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
} from '../services/depositTracker';

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
  const { apy: displayApy, refetch: refetchApy, getVaultApy } = useVaultApy();
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const hasPositions = positions.some(p => p.shares > BigInt(0));
  const savingsAmount = parseFloat(positionsTotal) || 0;

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
      Alert.alert('Enter Amount', 'Please enter an amount to deposit');
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

      // Record deposit for yield tracking
      const depositAmount = parseFloat(amount);
      await recordDeposit(displayAddress, depositAmount);

      setAmount('');
      refetchBalances();
      refetchPositions();

      Alert.alert(
        'Success!',
        `$${depositAmount.toFixed(2)} added to your savings.`,
        [
          { text: 'OK' },
          {
            text: 'View Transaction',
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
      Alert.alert('No Savings', 'You have no savings to withdraw.');
      return;
    }

    if (!smartWalletClient || !displayAddress) {
      Alert.alert('Error', 'Please log in first.');
      return;
    }

    // Get total deposited for yield calculation
    const totalDeposited = await getTotalDeposited(displayAddress);

    // Pre-calculate batch with yield-based fee
    const batch = buildWithdrawBatch(
      positions,
      displayAddress as `0x${string}`,
      totalDeposited
    );

    // Build user-friendly confirmation message
    let confirmMessage: string;
    if (batch.hasProfits) {
      // Show fee breakdown when there's profit (even tiny amounts)
      confirmMessage = [
        `You deposited: $${batch.totalDeposited}`,
        `Current value: $${batch.currentValue}`,
        `Earnings: +$${batch.yieldAmount} (+${batch.yieldPercent}%)`,
        ``,
        `Fee (${batch.feePercent}% of earnings): $${batch.feeAmount}`,
        ``,
        `You'll receive: $${batch.userReceives}`,
      ].join('\n');
    } else if (parseFloat(batch.yieldAmount) < 0) {
      // Loss scenario
      confirmMessage = [
        `You deposited: $${batch.totalDeposited}`,
        `Current value: $${batch.currentValue}`,
        ``,
        `No fee applies (no profit).`,
        ``,
        `You'll receive: $${batch.userReceives}`,
      ].join('\n');
    } else {
      // Break-even scenario
      confirmMessage = `Withdraw $${batch.currentValue}?\n\nNo fee applies.`;
    }

    Alert.alert(
      'Withdraw Savings',
      confirmMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
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
                  `You earned: +$${batch.yieldAmount}`,
                  `Fee paid: $${batch.feeAmount}`,
                  `You received: $${batch.userReceives}`,
                ].join('\n');
              } else {
                successMessage = `Withdrew $${batch.currentValue}`;
              }

              Alert.alert('Success!', successMessage, [
                { text: 'OK' },
                {
                  text: 'View Transaction',
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
          <Text style={styles.headerTitle}>Savings</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Your Savings - Simplified */}
        <View style={styles.savingsSection}>
          {positionsLoading ? (
            <View style={styles.savingsLoading}>
              <ActivityIndicator size="small" color="#22c55e" />
              <Text style={styles.savingsLoadingText}>Loading...</Text>
            </View>
          ) : positionsError ? (
            <View style={styles.savingsError}>
              <Text style={styles.savingsErrorText}>Unable to load savings</Text>
              <TouchableOpacity onPress={refetchPositions} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : !hasPositions ? (
            <View style={styles.noSavings}>
              <Text style={styles.noSavingsTitle}>Start Earning</Text>
              <Text style={styles.noSavingsSubtext}>
                Add money below to earn ~{displayApy}% APY
              </Text>
            </View>
          ) : (
            <View style={styles.savingsContent}>
              {/* Main Savings Display */}
              <View style={styles.savingsMain}>
                <Text style={styles.savingsLabel}>Your Savings</Text>
                <Text style={styles.savingsAmount}>${savingsAmount.toFixed(2)}</Text>
                <Text style={styles.savingsApy}>Earning ~{displayApy}% APY</Text>
              </View>

              {/* Diversification Note */}
              <TouchableOpacity
                style={styles.detailsToggle}
                onPress={() => setShowDetails(!showDetails)}
              >
                <Text style={styles.diversifiedText}>
                  Diversified across 3 lending markets
                </Text>
                <Text style={styles.detailsArrow}>{showDetails ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {/* Expandable Details */}
              {showDetails && (
                <View style={styles.detailsSection}>
                  {positions.map((position, index) => {
                    const vaultApy = getVaultApy(position.vaultAddress);
                    return (
                      <View key={position.vaultId} style={[
                        styles.detailRow,
                        index < positions.length - 1 && styles.detailRowBorder
                      ]}>
                        <View style={styles.detailLeft}>
                          <Text style={styles.detailName}>{position.vaultName}</Text>
                          {vaultApy && (
                            <Text style={styles.detailApy}>{vaultApy}% APY</Text>
                          )}
                        </View>
                        <Text style={styles.detailValue}>
                          ${parseFloat(position.usdValue).toFixed(2)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Withdraw Button */}
              <TouchableOpacity
                style={[styles.withdrawButton, isWithdrawing && styles.withdrawButtonDisabled]}
                onPress={handleWithdraw}
                disabled={isWithdrawing}
              >
                {isWithdrawing ? (
                  <ActivityIndicator color="#ef4444" size="small" />
                ) : (
                  <Text style={styles.withdrawButtonText}>Withdraw</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Available Balance */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available</Text>
          <Text style={styles.balanceValue}>
            ${usdc ? parseFloat(usdc.balance).toFixed(2) : '0.00'}
          </Text>
        </View>

        {/* Savings Info Card - Simplified */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View style={styles.infoIcon}>
              <Text style={styles.infoIconText}>$</Text>
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>High-Yield Savings</Text>
              <Text style={styles.infoApy}>~{displayApy}% APY</Text>
            </View>
          </View>
          <Text style={styles.infoDescription}>
            Your money earns yield automatically. Withdraw anytime, no fees on your deposits.
          </Text>
        </View>

        {/* Amount Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Amount to add</Text>
          <View style={styles.inputRow}>
            <View style={styles.currencyPrefix}>
              <Text style={styles.currencyText}>$</Text>
            </View>
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
              {amount && parseFloat(amount) > 0 ? `Add $${parseFloat(amount).toFixed(2)}` : 'Add Money'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Info Footer */}
        <View style={styles.footerSection}>
          <View style={styles.footerRow}>
            <Text style={styles.footerIcon}>✓</Text>
            <Text style={styles.footerText}>No transaction fees</Text>
          </View>
          <View style={styles.footerRow}>
            <Text style={styles.footerIcon}>✓</Text>
            <Text style={styles.footerText}>Withdraw anytime</Text>
          </View>
          <View style={styles.footerRow}>
            <Text style={styles.footerIcon}>✓</Text>
            <Text style={styles.footerText}>15% fee on earnings only</Text>
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
  // Savings Section
  savingsSection: {
    backgroundColor: '#141419',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  savingsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  savingsLoadingText: {
    marginLeft: 8,
    color: '#71717a',
    fontSize: 14,
  },
  savingsError: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  savingsErrorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#27272a',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  noSavings: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noSavingsTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  noSavingsSubtext: {
    color: '#71717a',
    fontSize: 14,
  },
  savingsContent: {},
  savingsMain: {
    alignItems: 'center',
    marginBottom: 16,
  },
  savingsLabel: {
    fontSize: 14,
    color: '#71717a',
    marginBottom: 8,
  },
  savingsAmount: {
    fontSize: 42,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  savingsApy: {
    fontSize: 16,
    color: '#22c55e',
    fontWeight: '500',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#27272a',
  },
  diversifiedText: {
    fontSize: 13,
    color: '#71717a',
    marginRight: 6,
  },
  detailsArrow: {
    fontSize: 10,
    color: '#71717a',
  },
  detailsSection: {
    backgroundColor: '#1a1a1f',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  detailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  detailLeft: {
    flex: 1,
  },
  detailName: {
    fontSize: 13,
    color: '#a1a1aa',
  },
  detailApy: {
    fontSize: 11,
    color: '#22c55e',
    marginTop: 2,
  },
  detailValue: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '500',
  },
  withdrawButton: {
    marginTop: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#52525b',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  withdrawButtonDisabled: {
    borderColor: '#3f3f46',
  },
  withdrawButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Balance Card
  balanceCard: {
    backgroundColor: '#141419',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#71717a',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  // Info Card
  infoCard: {
    backgroundColor: '#1a2e1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#22c55e20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoIconText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#22c55e',
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  infoApy: {
    fontSize: 15,
    color: '#22c55e',
    fontWeight: '600',
  },
  infoDescription: {
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
  currencyPrefix: {
    backgroundColor: '#141419',
    borderRadius: 12,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272a',
    borderRightWidth: 0,
  },
  currencyText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#71717a',
  },
  input: {
    flex: 1,
    backgroundColor: '#141419',
    borderRadius: 12,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    padding: 18,
    paddingLeft: 4,
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#27272a',
    borderLeftWidth: 0,
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
  // Footer Section
  footerSection: {
    backgroundColor: '#141419',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  footerIcon: {
    fontSize: 14,
    color: '#22c55e',
    marginRight: 10,
  },
  footerText: {
    fontSize: 13,
    color: '#71717a',
    flex: 1,
  },
});
