import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from 'react-native';
import { COLORS } from '../../constants/colors';

export interface WithdrawModalProps {
  visible: boolean;
  withdrawMethod: 'select' | 'wallet' | 'bank';
  withdrawAddress: string;
  withdrawAmount: string;
  cashBalance: number;
  isWithdrawingCash: boolean;
  isCashingOut: boolean;
  onClose: () => void;
  onMethodChange: (method: 'select' | 'wallet' | 'bank') => void;
  onAddressChange: (address: string) => void;
  onAmountChange: (amount: string) => void;
  onReview: () => void;
  onCashOutToBank: () => void;
}

export interface OfframpTransferModalProps {
  visible: boolean;
  offrampParams: { toAddress: string; amount: string; expiresAt: string } | null;
  isOfframpProcessing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function sanitizeAmount(val: string, cashBalance: number): string {
  const sanitized = val.replace(/[^0-9.]/g, '');
  if (parseFloat(sanitized) > cashBalance) {
    const truncated = Math.floor(cashBalance * 1000000) / 1000000;
    return truncated.toString();
  }
  return sanitized;
}

export function OfframpTransferModal({
  visible,
  offrampParams,
  isOfframpProcessing,
  onClose,
  onConfirm,
}: OfframpTransferModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={{ width: 40 }} />
            <Text style={styles.modalTitle}>Complete Cash Out</Text>
            <TouchableOpacity style={styles.modalHeaderButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={COLORS.grey} />
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              justifyContent: 'center', alignItems: 'center', marginBottom: 16,
            }}>
              <Ionicons name="business-outline" size={36} color="#22C55E" />
            </View>

            <Text style={{ color: COLORS.black, fontSize: 24, fontWeight: '600' }}>
              ${offrampParams?.amount} USDC
            </Text>
            <Text style={{ color: COLORS.grey, fontSize: 15, marginTop: 8, textAlign: 'center' }}>
              Will be sent to Coinbase for{'\n'}conversion to EUR
            </Text>
          </View>

          <View style={styles.compactInfoRow}>
            <Ionicons name="flash-outline" size={16} color="#22C55E" />
            <Text style={{ color: COLORS.grey, fontSize: 14 }}>
              Gasless transaction • No fees
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.reviewButton, isOfframpProcessing && styles.reviewButtonDisabled]}
            onPress={onConfirm}
            disabled={isOfframpProcessing}
          >
            {isOfframpProcessing ? (
              <ActivityIndicator color={COLORS.pureWhite} />
            ) : (
              <Text style={styles.reviewButtonText}>Confirm & Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function WithdrawModal({
  visible,
  withdrawMethod,
  withdrawAddress,
  withdrawAmount,
  cashBalance,
  isWithdrawingCash,
  isCashingOut,
  onClose,
  onMethodChange,
  onAddressChange,
  onAmountChange,
  onReview,
  onCashOutToBank,
}: WithdrawModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            {withdrawMethod !== 'select' ? (
              <TouchableOpacity
                style={styles.modalHeaderButton}
                onPress={() => { onMethodChange('select'); onAmountChange(''); }}
              >
                <Ionicons name="chevron-back" size={20} color={COLORS.black} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
            <Text style={styles.modalTitle}>
              {withdrawMethod === 'select' && 'Withdraw'}
              {withdrawMethod === 'wallet' && 'Send to Wallet'}
              {withdrawMethod === 'bank' && 'Cash Out to Bank'}
            </Text>
            <TouchableOpacity style={styles.modalHeaderButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={COLORS.grey} />
            </TouchableOpacity>
          </View>

          {withdrawMethod === 'select' && (
            <MethodSelection cashBalance={cashBalance} onMethodChange={onMethodChange} />
          )}

          {withdrawMethod === 'wallet' && (
            <WalletWithdraw
              withdrawAddress={withdrawAddress}
              withdrawAmount={withdrawAmount}
              cashBalance={cashBalance}
              isWithdrawingCash={isWithdrawingCash}
              onAddressChange={onAddressChange}
              onAmountChange={onAmountChange}
              onReview={onReview}
            />
          )}

          {withdrawMethod === 'bank' && (
            <BankCashout
              withdrawAmount={withdrawAmount}
              cashBalance={cashBalance}
              isCashingOut={isCashingOut}
              onAmountChange={onAmountChange}
              onCashOutToBank={onCashOutToBank}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function MethodSelection({ cashBalance, onMethodChange }: {
  cashBalance: number;
  onMethodChange: (method: 'select' | 'wallet' | 'bank') => void;
}) {
  return (
    <View style={styles.withdrawMethodsContainer}>
      <Text style={styles.withdrawMethodsSubtitle}>
        Available: ${cashBalance.toFixed(2)} USDC
      </Text>
      <TouchableOpacity style={styles.withdrawMethodOption} onPress={() => onMethodChange('wallet')}>
        <View style={styles.withdrawMethodIcon}>
          <Ionicons name="wallet-outline" size={24} color={COLORS.secondary} />
        </View>
        <View style={styles.withdrawMethodContent}>
          <Text style={styles.withdrawMethodTitle}>Send to Wallet</Text>
          <Text style={styles.withdrawMethodSubtitle}>USDC on Base network</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.withdrawMethodOption} onPress={() => onMethodChange('bank')}>
        <View style={[styles.withdrawMethodIcon, { backgroundColor: `${COLORS.success}15` }]}>
          <Ionicons name="business-outline" size={24} color={COLORS.success} />
        </View>
        <View style={styles.withdrawMethodContent}>
          <Text style={styles.withdrawMethodTitle}>Cash Out to Bank</Text>
          <Text style={styles.withdrawMethodSubtitle}>Via Coinbase • EUR to bank account</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
      </TouchableOpacity>
      <View style={styles.withdrawInfoBanner}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.grey} />
        <Text style={styles.withdrawInfoText}>
          Cash out requires a Coinbase account with linked EU bank (SEPA).
        </Text>
      </View>
    </View>
  );
}

function WalletWithdraw({ withdrawAddress, withdrawAmount, cashBalance, isWithdrawingCash, onAddressChange, onAmountChange, onReview }: {
  withdrawAddress: string; withdrawAmount: string; cashBalance: number; isWithdrawingCash: boolean;
  onAddressChange: (v: string) => void; onAmountChange: (v: string) => void; onReview: () => void;
}) {
  return (
    <>
      <View style={styles.withdrawInputSection}>
        <Text style={styles.withdrawInputLabel}>Send to</Text>
        <View style={styles.addressInputRow}>
          <View style={styles.addressInputIcon}>
            <Ionicons name="wallet-outline" size={20} color={COLORS.secondary} />
          </View>
          <TextInput
            style={styles.addressInput}
            value={withdrawAddress}
            onChangeText={onAddressChange}
            placeholder="0x... wallet address"
            placeholderTextColor={COLORS.grey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.qrScanButton}
            onPress={() => Alert.alert('Coming Soon', 'QR scanner coming in a future update')}
          >
            <Ionicons name="qr-code-outline" size={22} color={COLORS.grey} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.withdrawInputSection}>
        <Text style={styles.withdrawInputLabel}>Amount</Text>
        <View style={styles.amountInputRow}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            value={withdrawAmount}
            onChangeText={(val) => onAmountChange(sanitizeAmount(val, cashBalance))}
            placeholder="0.00"
            placeholderTextColor={COLORS.grey}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.availableRow}>
          <Text style={styles.availableText}>Available</Text>
          <Text style={styles.availableAmount}>${cashBalance.toFixed(6)}</Text>
          <TouchableOpacity
            style={styles.maxButtonSmall}
            onPress={() => {
              const truncated = Math.floor(cashBalance * 1000000) / 1000000;
              onAmountChange(truncated.toString());
            }}
          >
            <Text style={styles.maxButtonSmallText}>Max</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.networkInfoRow}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.grey} />
        <Text style={styles.networkInfoText}>
          Sending USDC on Base network. Make sure the recipient address supports Base.
        </Text>
      </View>
      <TouchableOpacity
        style={[
          styles.reviewButton,
          (!withdrawAddress || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || isWithdrawingCash) && styles.reviewButtonDisabled
        ]}
        onPress={onReview}
        disabled={!withdrawAddress || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || isWithdrawingCash}
      >
        {isWithdrawingCash ? (
          <ActivityIndicator color={COLORS.pureWhite} />
        ) : (
          <Text style={styles.reviewButtonText}>Review</Text>
        )}
      </TouchableOpacity>
    </>
  );
}

function BankCashout({ withdrawAmount, cashBalance, isCashingOut, onAmountChange, onCashOutToBank }: {
  withdrawAmount: string; cashBalance: number; isCashingOut: boolean;
  onAmountChange: (v: string) => void; onCashOutToBank: () => void;
}) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.bankCashoutContainer}>
        <View style={styles.withdrawInputSection}>
          <Text style={styles.withdrawInputLabel}>Amount to cash out</Text>
          <View style={styles.amountInputRow}>
            <Text style={styles.currencySymbol}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={withdrawAmount}
              onChangeText={(val) => onAmountChange(sanitizeAmount(val, cashBalance))}
              placeholder="0.00"
              placeholderTextColor={COLORS.grey}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              blurOnSubmit={true}
            />
          </View>
          <View style={styles.availableRow}>
            <Text style={styles.availableText}>Available</Text>
            <Text style={styles.availableAmount}>${cashBalance.toFixed(6)}</Text>
            <TouchableOpacity
              style={styles.maxButtonSmall}
              onPress={() => {
                const truncated = Math.floor(cashBalance * 1000000) / 1000000;
                onAmountChange(truncated.toString());
              }}
            >
              <Text style={styles.maxButtonSmallText}>Max</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.compactInfoRow}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.grey} />
          <Text style={styles.compactInfoText}>
            EUR via SEPA • Requires Coinbase account
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.reviewButton,
            (!withdrawAmount || parseFloat(withdrawAmount) <= 0 || isCashingOut) && styles.reviewButtonDisabled
          ]}
          onPress={onCashOutToBank}
          disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || isCashingOut}
        >
          {isCashingOut ? (
            <ActivityIndicator color={COLORS.pureWhite} />
          ) : (
            <View style={styles.reviewButtonContent}>
              <Ionicons name="open-outline" size={18} color={COLORS.pureWhite} />
              <Text style={styles.reviewButtonText}>Continue to Coinbase</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 4, 27, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.pureWhite,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    minHeight: 480,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  modalHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  withdrawMethodsContainer: {
    paddingTop: 8,
  },
  withdrawMethodsSubtitle: {
    fontSize: 15,
    color: COLORS.grey,
    textAlign: 'center',
    marginBottom: 24,
  },
  withdrawMethodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  withdrawMethodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${COLORS.secondary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  withdrawMethodContent: {
    flex: 1,
  },
  withdrawMethodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 2,
  },
  withdrawMethodSubtitle: {
    fontSize: 13,
    color: COLORS.grey,
  },
  withdrawInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.grey}10`,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  withdrawInfoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.grey,
    lineHeight: 18,
  },
  withdrawInputSection: {
    marginBottom: 20,
  },
  withdrawInputLabel: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 8,
  },
  addressInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  addressInputIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${COLORS.secondary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  addressInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.black,
  },
  qrScanButton: {
    padding: 8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.grey,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.black,
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 8,
  },
  availableText: {
    fontSize: 14,
    color: COLORS.grey,
  },
  availableAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
  },
  maxButtonSmall: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  maxButtonSmallText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  networkInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${COLORS.secondary}10`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  networkInfoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.grey,
    lineHeight: 18,
  },
  reviewButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  reviewButtonDisabled: {
    backgroundColor: COLORS.grey,
    opacity: 0.5,
  },
  reviewButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  reviewButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bankCashoutContainer: {
    marginTop: 8,
  },
  compactInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 8,
    marginBottom: 16,
  },
  compactInfoText: {
    fontSize: 14,
    color: COLORS.grey,
  },
});
