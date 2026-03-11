import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export interface WithdrawConfirmationProps {
  hasPositions: boolean;
  savingsAmount: number;
  displayDeposited: number;
  totalYield: number;
  youReceive: number;
  isWithdrawing: boolean;
  onWithdraw: () => void;
}

export default function WithdrawConfirmation({
  hasPositions,
  savingsAmount,
  displayDeposited,
  totalYield,
  youReceive,
  isWithdrawing,
  onWithdraw,
}: WithdrawConfirmationProps) {
  return (
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

          <View style={styles.withdrawPreview}>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Account balance</Text>
              <Text style={styles.previewValue}>${savingsAmount.toFixed(2)}</Text>
            </View>
            {totalYield > 0.001 && (
              <>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Total added</Text>
                  <Text style={styles.previewValue}>${displayDeposited.toFixed(2)}</Text>
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
            onPress={onWithdraw}
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
  );
}

export function FeeAndTrustSection() {
  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
  withdrawTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: 20,
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
  actionButton: {
    backgroundColor: COLORS.primary,
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
  withdrawNote: {
    fontSize: 13,
    color: COLORS.grey,
    textAlign: 'center',
    marginTop: 16,
  },
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
