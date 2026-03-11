import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import SensitiveView from '../SensitiveView';
import { AnimatedEarned } from '../AnimatedBalance';

export interface StrategyCardProps {
  positionsLoading: boolean;
  positionsError: string | null;
  savingsAmount: number;
  hasPositions: boolean;
  displayApy: string;
  displayDeposited: number;
  availableBalance: number;
  onRetry: () => void;
}

export default function StrategyCard({
  positionsLoading,
  positionsError,
  savingsAmount,
  hasPositions,
  displayApy,
  displayDeposited,
  availableBalance,
  onRetry,
}: StrategyCardProps) {
  return (
    <>
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
            <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
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

            {displayDeposited > 0 && (
              <SensitiveView>
                <View style={styles.earningsDisplay}>
                  <Text style={styles.earningsLabel}>Total earned</Text>
                  <AnimatedEarned
                    currentBalance={savingsAmount}
                    depositedAmount={displayDeposited}
                    apy={parseFloat(displayApy)}
                  />
                </View>
              </SensitiveView>
            )}
          </>
        )}
      </View>

      <View style={styles.availableCard}>
        <Text style={styles.availableLabel}>Available to add</Text>
        <SensitiveView>
          <Text style={styles.availableValue}>${availableBalance.toFixed(2)}</Text>
        </SensitiveView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
});
