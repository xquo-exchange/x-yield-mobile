import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { AnimatedBalance } from '../AnimatedBalance';
import SensitiveView from '../SensitiveView';

export interface BalanceCardProps {
  isLoading: boolean;
  totalBalance: number;
  displayApy: string;
  savingsBalance: number;
  onViewActivity: () => void;
}

export default function BalanceCard({
  isLoading,
  totalBalance,
  displayApy,
  savingsBalance,
  onViewActivity,
}: BalanceCardProps) {
  return (
    <View style={styles.balanceSection}>
      <Text style={styles.balanceLabel}>Total Balance</Text>
      {isLoading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 20 }} />
      ) : (
        <>
          <SensitiveView>
            <AnimatedBalance
              balance={totalBalance}
              apy={parseFloat(displayApy)}
              isEarning={savingsBalance > 0}
            />
          </SensitiveView>
          <TouchableOpacity
            style={styles.viewActivityLink}
            onPress={onViewActivity}
            hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
          >
            <Ionicons name="time-outline" size={14} color={COLORS.secondary} />
            <Text style={styles.viewActivityText}>View Activity</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.secondary} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  balanceSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  balanceLabel: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 8,
  },
  viewActivityLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: COLORS.secondary + '10',
  },
  viewActivityText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondary,
  },
});
