import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import * as Analytics from '../../services/analytics';

export interface DepositFormProps {
  amount: string;
  isDepositing: boolean;
  isInputFocused: boolean;
  displayApy: string;
  isTrulyEmpty: boolean;
  amountInputRef: React.RefObject<TextInput | null>;
  onAmountChange: (value: string) => void;
  onSetMax: () => void;
  onDeposit: () => void;
  onGoToDashboard: () => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
}

export default function DepositForm({
  amount,
  isDepositing,
  isInputFocused,
  displayApy,
  isTrulyEmpty,
  amountInputRef,
  onAmountChange,
  onSetMax,
  onDeposit,
  onGoToDashboard,
  onInputFocus,
  onInputBlur,
}: DepositFormProps) {
  if (isTrulyEmpty) {
    return (
      <View style={styles.zeroBalanceGuide}>
        <View style={styles.zeroBalanceIconContainer}>
          <Ionicons name="wallet-outline" size={36} color={COLORS.secondary} />
        </View>
        <Text style={styles.zeroBalanceTitle}>No funds available</Text>
        <Text style={styles.zeroBalanceText}>
          First, add USDC to your Cash account. Then come back here to move it to Savings and start earning {displayApy}% APY.
        </Text>

        <View style={styles.zeroBalanceSteps}>
          <View style={styles.zeroBalanceStep}>
            <View style={styles.zeroBalanceStepDot} />
            <Text style={styles.zeroBalanceStepText}>Buy USDC with card via Coinbase</Text>
          </View>
          <View style={styles.zeroBalanceStep}>
            <View style={styles.zeroBalanceStepDot} />
            <Text style={styles.zeroBalanceStepText}>Or transfer USDC from another wallet</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.zeroBalanceButton}
          onPress={onGoToDashboard}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.pureWhite} />
          <Text style={styles.zeroBalanceButtonText}>Add Funds on Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Text style={styles.inputLabel}>Amount to add</Text>
      <View style={styles.inputRow}>
        <View style={styles.inputTouchable}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              amountInputRef.current?.focus();
            }}
          >
            <View style={[styles.currencyPrefix, isInputFocused && styles.inputFocused]}>
              <Text style={styles.currencyText}>$</Text>
            </View>
          </TouchableOpacity>
          <TextInput
            testID="strategies-amount-input"
            ref={amountInputRef}
            style={[styles.input, isInputFocused && styles.inputFocused]}
            value={amount}
            onChangeText={onAmountChange}
            placeholder="0.00"
            placeholderTextColor={COLORS.grey}
            keyboardType="decimal-pad"
            autoCorrect={false}
            spellCheck={false}
            editable={true}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          />
        </View>
        <TouchableOpacity style={styles.maxButton} onPress={onSetMax}>
          <Text style={styles.maxButtonText}>MAX</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.depositTrustSignals}>
        <View style={styles.depositTrustItem}>
          <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.grey} />
          <Text style={styles.depositTrustText}>Audited contracts</Text>
        </View>
        <View style={styles.depositTrustItem}>
          <Ionicons name="time-outline" size={14} color={COLORS.grey} />
          <Text style={styles.depositTrustText}>Withdraw anytime</Text>
        </View>
      </View>

      <TouchableOpacity
        testID="strategies-deposit-button"
        style={[
          styles.actionButton,
          (!amount || parseFloat(amount) <= 0 || isDepositing) && styles.actionButtonDisabled,
        ]}
        onPress={onDeposit}
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
  );
}

const styles = StyleSheet.create({
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
  inputTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  depositTrustSignals: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  depositTrustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  depositTrustText: {
    fontSize: 12,
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
  zeroBalanceGuide: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  zeroBalanceIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${COLORS.secondary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  zeroBalanceTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 8,
  },
  zeroBalanceText: {
    fontSize: 14,
    color: COLORS.grey,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  zeroBalanceSteps: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  zeroBalanceStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  zeroBalanceStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
  },
  zeroBalanceStepText: {
    fontSize: 14,
    color: COLORS.grey,
    flex: 1,
  },
  zeroBalanceButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  zeroBalanceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
});
