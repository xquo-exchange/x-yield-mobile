import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { COLORS } from '../../constants/colors';
import SensitiveView from '../SensitiveView';
import * as Analytics from '../../services/analytics';

export interface DepositModalProps {
  visible: boolean;
  fundingView: 'options' | 'receive';
  displayAddress: string;
  copied: boolean;
  onClose: () => void;
  onViewChange: (view: 'options' | 'receive') => void;
  onCopyAddress: () => void;
  onBuyWithCard: () => void;
}

export default function DepositModal({
  visible,
  fundingView,
  displayAddress,
  copied,
  onClose,
  onViewChange,
  onCopyAddress,
  onBuyWithCard,
}: DepositModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            {fundingView === 'receive' ? (
              <TouchableOpacity style={styles.modalHeaderButton} onPress={() => onViewChange('options')}>
                <Ionicons name="chevron-back" size={20} color={COLORS.black} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
            <Text style={styles.modalTitle}>Add Funds</Text>
            <TouchableOpacity style={styles.modalHeaderButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={COLORS.grey} />
            </TouchableOpacity>
          </View>

          {fundingView === 'options' ? (
            <View style={styles.optionsContainer}>
              <Text style={styles.fundingHelperText}>
                Choose how you'd like to transfer USDC to your account
              </Text>

              <TouchableOpacity
                style={[styles.fundingOption, styles.fundingOptionRecommended]}
                onPress={() => {
                  Analytics.trackButtonTap('Transfer from other wallets', 'FundingModal');
                  onViewChange('receive');
                }}
              >
                <View style={[styles.fundingOptionIcon, styles.fundingOptionIconRecommended]}>
                  <Ionicons name="arrow-down" size={24} color={COLORS.primary} />
                </View>
                <View style={styles.fundingOptionContent}>
                  <View style={styles.fundingOptionTitleRow}>
                    <Text style={styles.fundingOptionTitle}>Transfer from other wallets</Text>
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedBadgeText}>RECOMMENDED</Text>
                    </View>
                  </View>
                  <Text style={styles.fundingOptionSubtitle}>Receive USDC via QR code or address</Text>
                  <View style={styles.fundingOptionBenefits}>
                    <View style={styles.benefitItem}>
                      <Ionicons name="flash" size={12} color={COLORS.success} />
                      <Text style={styles.benefitText}>Instant</Text>
                    </View>
                    <View style={styles.benefitItem}>
                      <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
                      <Text style={styles.benefitText}>No fees</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
              </TouchableOpacity>

              <View style={styles.fundingDivider}>
                <View style={styles.fundingDividerLine} />
                <Text style={styles.fundingDividerText}>or</Text>
                <View style={styles.fundingDividerLine} />
              </View>

              <TouchableOpacity
                style={styles.fundingOption}
                onPress={() => {
                  Analytics.trackButtonTap('Transfer with Coinbase', 'FundingModal');
                  onBuyWithCard();
                }}
              >
                <View style={styles.fundingOptionIcon}>
                  <Ionicons name="swap-horizontal-outline" size={24} color={COLORS.grey} />
                </View>
                <View style={styles.fundingOptionContent}>
                  <Text style={[styles.fundingOptionTitle, styles.fundingOptionTitleSecondary]}>
                    Transfer with Coinbase
                  </Text>
                  <Text style={styles.fundingOptionSubtitle}>Buy or transfer via Coinbase app</Text>
                  <Text style={styles.fundingOptionNote}>
                    Opens Coinbase · May include fees
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
              </TouchableOpacity>

              <View style={styles.fundingInfoBanner}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.grey} />
                <Text style={styles.fundingInfoText}>
                  Already have USDC? Transfer from wallet is fastest. Otherwise, use Coinbase to buy and transfer.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.receiveContainer}>
              <View style={styles.qrContainer}>
                {displayAddress ? (
                  <QRCode value={displayAddress} size={160} backgroundColor="#ffffff" color={COLORS.primary} />
                ) : (
                  <View style={styles.qrPlaceholder}><Text style={styles.qrPlaceholderText}>No wallet</Text></View>
                )}
              </View>

              <Text style={styles.receiveInstructions}>Send USDC on Base network</Text>

              <SensitiveView>
                <View style={styles.addressBox}>
                  <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                    {displayAddress || 'No address'}
                  </Text>
                </View>
              </SensitiveView>

              <TouchableOpacity
                style={[styles.copyButton, copied && styles.copyButtonCopied]}
                onPress={onCopyAddress}
              >
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={COLORS.pureWhite} />
                <Text style={styles.copyButtonText}>
                  {copied ? 'Copied!' : 'Copy Address'}
                </Text>
              </TouchableOpacity>

              <View style={styles.networkInfo}>
                <View style={styles.networkDot} />
                <Text style={styles.networkText}>Base Network only</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
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
  optionsContainer: {
    gap: 12,
  },
  fundingHelperText: {
    fontSize: 14,
    color: COLORS.grey,
    textAlign: 'center',
    marginBottom: 8,
  },
  fundingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'visible',
  },
  fundingOptionRecommended: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    backgroundColor: `${COLORS.primary}05`,
  },
  fundingOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${COLORS.grey}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  fundingOptionIconRecommended: {
    backgroundColor: `${COLORS.primary}15`,
  },
  fundingOptionContent: {
    flex: 1,
    overflow: 'visible',
  },
  fundingOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
    overflow: 'visible',
  },
  fundingOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    flexShrink: 1,
  },
  fundingOptionTitleSecondary: {
    color: COLORS.grey,
  },
  fundingOptionSubtitle: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 6,
  },
  fundingOptionBenefits: {
    flexDirection: 'row',
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  benefitText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '500',
  },
  fundingOptionNote: {
    fontSize: 12,
    color: COLORS.grey,
    fontStyle: 'italic',
  },
  recommendedBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    flexShrink: 0,
  },
  recommendedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.pureWhite,
    letterSpacing: 0.5,
  },
  fundingDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  fundingDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  fundingDividerText: {
    fontSize: 13,
    color: COLORS.grey,
    paddingHorizontal: 16,
  },
  fundingInfoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${COLORS.grey}10`,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  fundingInfoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.grey,
    lineHeight: 18,
  },
  receiveContainer: {
    alignItems: 'center',
  },
  qrContainer: {
    backgroundColor: COLORS.pureWhite,
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  qrPlaceholder: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrPlaceholderText: {
    color: COLORS.grey,
  },
  receiveInstructions: {
    fontSize: 15,
    color: COLORS.grey,
    marginBottom: 16,
  },
  addressBox: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addressText: {
    fontSize: 13,
    color: COLORS.black,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
  },
  copyButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  copyButtonCopied: {
    backgroundColor: COLORS.success,
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  networkInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${COLORS.secondary}15`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
  },
  networkText: {
    fontSize: 13,
    color: COLORS.secondary,
    fontWeight: '500',
  },
});
