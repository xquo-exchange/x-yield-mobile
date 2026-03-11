import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { AnimatedBalance, AnimatedEarned } from '../AnimatedBalance';
import SensitiveView from '../SensitiveView';

export interface PositionsListProps {
  savingsRef: React.RefObject<View | null>;
  savingsBalance: number;
  cashBalance: number;
  totalBalance: number;
  isLoading: boolean;
  displayApy: string;
  totalDeposited: number;
  pulseAnim: Animated.Value;
  onAddMore: () => void;
  onWithdraw: () => void;
  onStartEarning: () => void;
}

export default function PositionsList({
  savingsRef,
  savingsBalance,
  cashBalance,
  totalBalance,
  isLoading,
  displayApy,
  totalDeposited,
  pulseAnim,
  onAddMore,
  onWithdraw,
  onStartEarning,
}: PositionsListProps) {
  if (isLoading || totalBalance <= 0) return null;

  return (
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
                  <Text style={styles.breakdownLabel}>Added</Text>
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
                onPress={onAddMore}
              >
                <Text style={styles.startEarningButtonText}>Add More</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="dashboard-withdraw-button"
                style={styles.withdrawButton}
                onPress={onWithdraw}
              >
                <Text style={styles.withdrawButtonText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
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
              onPress={onStartEarning}
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
  );
}

const styles = StyleSheet.create({
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
});
