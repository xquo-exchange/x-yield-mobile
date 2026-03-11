import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import SensitiveView from '../SensitiveView';

export interface QuickActionsProps {
  isLoading: boolean;
  totalBalance: number;
  cashBalance: number;
  savingsBalance: number;
  addFundsRef: React.RefObject<View | null>;
  onAddFunds: () => void;
  onWithdraw: () => void;
}

export default function QuickActions({
  isLoading,
  totalBalance,
  cashBalance,
  savingsBalance,
  addFundsRef,
  onAddFunds,
  onWithdraw,
}: QuickActionsProps) {
  if (isLoading || totalBalance <= 0) return null;

  return (
    <View style={styles.cashCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconContainer}>
          <Ionicons name="wallet-outline" size={20} color={COLORS.primary} />
        </View>
        <View style={styles.cardTitleContainer}>
          <Text style={styles.cardTitle}>Cash</Text>
          <Text style={styles.cardSubtitle}>Available to use or invest</Text>
        </View>
      </View>
      <SensitiveView>
        <Text style={styles.cashBalance}>${cashBalance.toFixed(2)}</Text>
      </SensitiveView>
      <View style={styles.cashButtonsRow}>
        <TouchableOpacity
          testID="dashboard-add-funds-button"
          ref={totalBalance > 0 ? addFundsRef : undefined}
          style={[
            styles.cashButton,
            savingsBalance === 0 && cashBalance > 0 ? styles.addFundsButtonSecondary : styles.addFundsButtonStyle
          ]}
          activeOpacity={0.7}
          onPress={onAddFunds}
        >
          <Ionicons
            name="add"
            size={18}
            color={savingsBalance === 0 && cashBalance > 0 ? COLORS.primary : COLORS.pureWhite}
          />
          <Text style={[
            styles.cashButtonText,
            savingsBalance === 0 && cashBalance > 0 && styles.cashButtonTextSecondary
          ]}>
            Add Funds
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.cashButton, styles.withdrawCashButton, cashBalance <= 0 && styles.withdrawCashButtonDisabled]}
          onPress={onWithdraw}
          disabled={cashBalance <= 0}
        >
          <Ionicons name="arrow-up-outline" size={18} color={cashBalance > 0 ? COLORS.primary : COLORS.grey} />
          <Text style={[styles.withdrawCashButtonText, cashBalance <= 0 && styles.buttonTextDisabled]}>
            Withdraw
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cashCard: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${COLORS.primary}10`,
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
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.grey,
    marginTop: 2,
  },
  cashBalance: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 16,
    fontVariant: ['tabular-nums'],
  },
  cashButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cashButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  addFundsButtonStyle: {
    backgroundColor: COLORS.primary,
  },
  addFundsButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  cashButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  cashButtonTextSecondary: {
    color: COLORS.primary,
  },
  withdrawCashButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  withdrawCashButtonDisabled: {
    borderColor: COLORS.grey,
  },
  withdrawCashButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  buttonTextDisabled: {
    color: COLORS.grey,
  },
});
