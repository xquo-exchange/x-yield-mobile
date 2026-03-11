import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export interface OnboardingCardProps {
  displayApy: string;
  addFundsRef: React.RefObject<View | null>;
  onAddFunds: () => void;
}

export default function OnboardingCard({
  displayApy,
  addFundsRef,
  onAddFunds,
}: OnboardingCardProps) {
  return (
    <View style={styles.onboardingCard}>
      <View style={styles.onboardingIconContainer}>
        <Ionicons name="rocket-outline" size={32} color={COLORS.primary} />
      </View>
      <Text style={styles.onboardingTitle}>Welcome! Let's get started</Text>
      <Text style={styles.onboardingText}>
        Add funds to your account to start earning up to {displayApy}% APY on your savings.
      </Text>

      <View style={styles.onboardingSteps}>
        <View style={styles.onboardingStep}>
          <View style={styles.onboardingStepNumber}>
            <Text style={styles.onboardingStepNumberText}>1</Text>
          </View>
          <View style={styles.onboardingStepContent}>
            <Text style={styles.onboardingStepTitle}>Add funds to your Cash account</Text>
            <Text style={styles.onboardingStepText}>Buy with card or transfer USDC</Text>
          </View>
        </View>
        <View style={styles.onboardingStep}>
          <View style={styles.onboardingStepNumber}>
            <Text style={styles.onboardingStepNumberText}>2</Text>
          </View>
          <View style={styles.onboardingStepContent}>
            <Text style={styles.onboardingStepTitle}>Move funds to Savings</Text>
            <Text style={styles.onboardingStepText}>Start earning yield instantly</Text>
          </View>
        </View>
        <View style={styles.onboardingStep}>
          <View style={styles.onboardingStepNumber}>
            <Text style={styles.onboardingStepNumberText}>3</Text>
          </View>
          <View style={styles.onboardingStepContent}>
            <Text style={styles.onboardingStepTitle}>Watch your money grow</Text>
            <Text style={styles.onboardingStepText}>Withdraw anytime, no lock-up</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        ref={addFundsRef}
        style={styles.onboardingButton}
        activeOpacity={0.7}
        onPress={onAddFunds}
      >
        <Ionicons name="add" size={20} color={COLORS.pureWhite} />
        <Text style={styles.onboardingButtonText}>Add Your First Funds</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  onboardingCard: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  onboardingIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${COLORS.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  onboardingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: 8,
  },
  onboardingText: {
    fontSize: 15,
    color: COLORS.grey,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  onboardingSteps: {
    gap: 16,
    marginBottom: 24,
  },
  onboardingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  onboardingStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onboardingStepNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.pureWhite,
  },
  onboardingStepContent: {
    flex: 1,
  },
  onboardingStepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 2,
  },
  onboardingStepText: {
    fontSize: 13,
    color: COLORS.grey,
  },
  onboardingButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  onboardingButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.pureWhite,
  },
});
