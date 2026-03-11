import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export interface HowItWorksProps {
  showHowItWorks: boolean;
  onToggle: () => void;
}

export default function HowItWorks({ showHowItWorks, onToggle }: HowItWorksProps) {
  return (
    <>
      <TouchableOpacity style={styles.howItWorksToggle} onPress={onToggle}>
        <Text style={styles.howItWorksToggleText}>How does it work?</Text>
        <Ionicons
          name={showHowItWorks ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={COLORS.grey}
        />
      </TouchableOpacity>

      {showHowItWorks && (
        <View style={styles.howItWorksContent}>
          <View style={styles.stepItem}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <Text style={styles.stepText}>Add USDC to your account</Text>
          </View>
          <View style={styles.stepItem}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <Text style={styles.stepText}>We allocate across trusted managers</Text>
          </View>
          <View style={styles.stepItem}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <Text style={styles.stepText}>You earn yield, withdraw anytime</Text>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  howItWorksToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  howItWorksToggleText: {
    fontSize: 14,
    color: COLORS.grey,
  },
  howItWorksContent: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  stepText: {
    fontSize: 14,
    color: COLORS.grey,
    flex: 1,
  },
});
