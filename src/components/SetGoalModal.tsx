/**
 * SetGoalModal Component
 * Modal for setting or editing savings goals
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRESET_GOALS, SavingsGoal, formatGoalAmount } from '../services/savingsGoal';

const COLORS = {
  primary: '#200191',
  secondary: '#6198FF',
  success: '#22C55E',
  white: '#F5F6FF',
  grey: '#484848',
  black: '#00041B',
  pureWhite: '#FFFFFF',
  border: '#E8E8E8',
  error: '#EF4444',
};

interface SetGoalModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (amount: number) => void;
  onClear?: () => void;
  currentGoal: SavingsGoal | null;
  currentSavings: number;
}

export default function SetGoalModal({
  visible,
  onClose,
  onSave,
  onClear,
  currentGoal,
  currentSavings,
}: SetGoalModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      if (currentGoal) {
        // Editing existing goal
        const isPreset = PRESET_GOALS.includes(currentGoal.targetAmount);
        if (isPreset) {
          setSelectedPreset(currentGoal.targetAmount);
          setIsCustom(false);
          setCustomAmount('');
        } else {
          setIsCustom(true);
          setCustomAmount(currentGoal.targetAmount.toString());
          setSelectedPreset(null);
        }
      } else {
        // New goal
        setSelectedPreset(null);
        setCustomAmount('');
        setIsCustom(false);
      }
      setError(null);
    }
  }, [visible, currentGoal]);

  const handlePresetSelect = (amount: number) => {
    setSelectedPreset(amount);
    setIsCustom(false);
    setCustomAmount('');
    setError(null);
  };

  const handleCustomToggle = () => {
    setIsCustom(true);
    setSelectedPreset(null);
    setError(null);
  };

  const handleCustomChange = (text: string) => {
    // Only allow numbers
    const cleaned = text.replace(/[^0-9]/g, '');
    setCustomAmount(cleaned);
    setError(null);
  };

  const getSelectedAmount = (): number | null => {
    if (selectedPreset) return selectedPreset;
    if (isCustom && customAmount) {
      const amount = parseInt(customAmount, 10);
      if (!isNaN(amount) && amount > 0) return amount;
    }
    return null;
  };

  const handleSave = () => {
    const amount = getSelectedAmount();

    if (!amount) {
      setError('Please select or enter a goal amount');
      return;
    }

    if (amount < 100) {
      setError('Minimum goal is $100');
      return;
    }

    if (amount <= currentSavings) {
      setError(`Goal must be higher than your current savings ($${currentSavings.toFixed(0)})`);
      return;
    }

    onSave(amount);
    onClose();
  };

  const handleClear = () => {
    onClear?.();
    onClose();
  };

  const selectedAmount = getSelectedAmount();
  const canSave = selectedAmount && selectedAmount > currentSavings;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.headerButton} onPress={onClose}>
                <Ionicons name="close" size={24} color={COLORS.black} />
              </TouchableOpacity>
              <Text style={styles.title}>
                {currentGoal ? 'Edit Goal' : 'Set Savings Goal'}
              </Text>
              <View style={styles.headerButton} />
            </View>

            {/* Current savings info */}
            <View style={styles.currentInfo}>
              <Text style={styles.currentLabel}>Your current savings</Text>
              <Text style={styles.currentAmount}>
                ${currentSavings.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>

            {/* Preset amounts */}
            <Text style={styles.sectionTitle}>Choose a target</Text>
            <View style={styles.presetGrid}>
              {PRESET_GOALS.map((amount) => {
                const isSelected = selectedPreset === amount;
                const isDisabled = amount <= currentSavings;
                return (
                  <TouchableOpacity
                    key={amount}
                    style={[
                      styles.presetButton,
                      isSelected && styles.presetButtonSelected,
                      isDisabled && styles.presetButtonDisabled,
                    ]}
                    onPress={() => !isDisabled && handlePresetSelect(amount)}
                    disabled={isDisabled}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        isSelected && styles.presetTextSelected,
                        isDisabled && styles.presetTextDisabled,
                      ]}
                    >
                      {formatGoalAmount(amount)}
                    </Text>
                    {isDisabled && (
                      <Text style={styles.presetDisabledHint}>Reached</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom amount */}
            <TouchableOpacity
              style={[
                styles.customToggle,
                isCustom && styles.customToggleActive,
              ]}
              onPress={handleCustomToggle}
            >
              <Text
                style={[
                  styles.customToggleText,
                  isCustom && styles.customToggleTextActive,
                ]}
              >
                Custom amount
              </Text>
              {isCustom && (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              )}
            </TouchableOpacity>

            {isCustom && (
              <View style={styles.customInputContainer}>
                <Text style={styles.currencyPrefix}>$</Text>
                <TextInput
                  style={styles.customInput}
                  value={customAmount}
                  onChangeText={handleCustomChange}
                  placeholder="Enter amount"
                  placeholderTextColor={COLORS.grey}
                  keyboardType="number-pad"
                  autoFocus
                />
              </View>
            )}

            {/* Error message */}
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Preview */}
            {selectedAmount && selectedAmount > currentSavings && (
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>You need to save</Text>
                <Text style={styles.previewAmount}>
                  ${(selectedAmount - currentSavings).toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </Text>
                <Text style={styles.previewHint}>more to reach your goal</Text>
              </View>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              {currentGoal && onClear && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={handleClear}
                >
                  <Text style={styles.clearButtonText}>Remove Goal</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  !canSave && styles.saveButtonDisabled,
                ]}
                onPress={handleSave}
                disabled={!canSave}
              >
                <Text style={styles.saveButtonText}>
                  {currentGoal ? 'Update Goal' : 'Set Goal'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 4, 27, 0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: COLORS.pureWhite,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  currentInfo: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderRadius: 12,
  },
  currentLabel: {
    fontSize: 13,
    color: COLORS.grey,
    marginBottom: 4,
  },
  currentAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.black,
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 12,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  presetButton: {
    width: '31%',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.pureWhite,
  },
  presetButtonSelected: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}08`,
  },
  presetButtonDisabled: {
    backgroundColor: COLORS.white,
    opacity: 0.6,
  },
  presetText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
  },
  presetTextSelected: {
    color: COLORS.primary,
  },
  presetTextDisabled: {
    color: COLORS.grey,
  },
  presetDisabledHint: {
    fontSize: 10,
    color: COLORS.success,
    marginTop: 2,
  },
  customToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  customToggleActive: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}08`,
  },
  customToggleText: {
    fontSize: 15,
    color: COLORS.grey,
  },
  customToggleTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  currencyPrefix: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.black,
    marginRight: 4,
  },
  customInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.black,
    paddingVertical: 14,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.error,
    flex: 1,
  },
  preview: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 16,
    backgroundColor: `${COLORS.secondary}10`,
    borderRadius: 12,
  },
  previewLabel: {
    fontSize: 13,
    color: COLORS.grey,
  },
  previewAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.secondary,
    fontVariant: ['tabular-nums'],
    marginVertical: 4,
  },
  previewHint: {
    fontSize: 13,
    color: COLORS.grey,
  },
  actions: {
    gap: 12,
  },
  clearButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 15,
    color: COLORS.error,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    backgroundColor: COLORS.grey,
    opacity: 0.5,
    shadowOpacity: 0,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
});
