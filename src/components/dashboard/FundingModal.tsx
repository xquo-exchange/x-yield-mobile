/**
 * FundingModal Component
 * Modal for adding funds via QR code/address or Coinbase
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { COLORS } from '../../constants/colors';
import SensitiveView from '../SensitiveView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type FundingView = 'options' | 'receive';

export interface FundingModalProps {
  visible: boolean;
  fundingView: FundingView;
  displayAddress: string;
  copied: boolean;
  onClose: () => void;
  onViewChange: (view: FundingView) => void;
  onCopyAddress: () => void;
  onBuyWithCard: () => void;
}

export default function FundingModal({
  visible,
  fundingView,
  displayAddress,
  copied,
  onClose,
  onViewChange,
  onCopyAddress,
  onBuyWithCard,
}: FundingModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            {fundingView === 'receive' ? (
              <TouchableOpacity
                testID="funding-back-button"
                style={styles.modalHeaderButton}
                onPress={() => onViewChange('options')}
              >
                <Ionicons name="chevron-back" size={20} color={COLORS.black} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
            <Text style={styles.modalTitle}>Add Funds</Text>
            <TouchableOpacity testID="funding-close-button" style={styles.modalHeaderButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={COLORS.grey} />
            </TouchableOpacity>
          </View>

          {fundingView === 'options' ? (
            <OptionsView
              onTransferWallet={() => onViewChange('receive')}
              onBuyWithCard={onBuyWithCard}
            />
          ) : (
            <ReceiveView
              displayAddress={displayAddress}
              copied={copied}
              onCopyAddress={onCopyAddress}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// Options View - Choose funding method
interface OptionsViewProps {
  onTransferWallet: () => void;
  onBuyWithCard: () => void;
}

function OptionsView({ onTransferWallet, onBuyWithCard }: OptionsViewProps) {
  return (
    <View style={styles.optionsContainer}>
      <Text style={styles.fundingHelperText}>
        Choose how you'd like to transfer USDC to your account
      </Text>

      {/* Transfer from other wallets - Recommended */}
      <TouchableOpacity
        testID="funding-transfer-wallet-option"
        style={[styles.fundingOption, styles.fundingOptionRecommended]}
        onPress={onTransferWallet}
      >
        <View style={[styles.fundingOptionIcon, styles.fundingOptionIconRecommended]}>
          <Ionicons name="arrow-down" size={24} color={COLORS.primary} />
        </View>
        <View style={styles.fundingOptionContent}>
          <Text style={styles.fundingOptionTitle}>Transfer from other wallets</Text>
          <View style={styles.recommendedBadgeRow}>
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

      {/* Divider */}
      <View style={styles.fundingDivider}>
        <View style={styles.fundingDividerLine} />
        <Text style={styles.fundingDividerText}>or</Text>
        <View style={styles.fundingDividerLine} />
      </View>

      {/* Transfer with Coinbase */}
      <TouchableOpacity style={styles.fundingOption} onPress={onBuyWithCard}>
        <View style={styles.fundingOptionIcon}>
          <Ionicons name="swap-horizontal-outline" size={24} color={COLORS.grey} />
        </View>
        <View style={styles.fundingOptionContent}>
          <Text style={[styles.fundingOptionTitle, styles.fundingOptionTitleSecondary]}>
            Transfer with Coinbase
          </Text>
          <Text style={styles.fundingOptionSubtitle}>Buy or transfer via Coinbase app</Text>
          <Text style={styles.fundingOptionNote}>Opens Coinbase · May include fees</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
      </TouchableOpacity>

      {/* Info banner */}
      <View style={styles.fundingInfoBanner}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.grey} />
        <Text style={styles.fundingInfoText}>
          Already have USDC? Transfer from wallet is fastest. Otherwise, use Coinbase to buy and transfer.
        </Text>
      </View>
    </View>
  );
}

// Receive View - QR code and address
interface ReceiveViewProps {
  displayAddress: string;
  copied: boolean;
  onCopyAddress: () => void;
}

function ReceiveView({ displayAddress, copied, onCopyAddress }: ReceiveViewProps) {
  return (
    <View style={styles.receiveContainer}>
      <View style={styles.qrContainer}>
        {displayAddress ? (
          <QRCode value={displayAddress} size={160} backgroundColor="#ffffff" color={COLORS.primary} />
        ) : (
          <View style={styles.qrPlaceholder}>
            <Text style={styles.qrPlaceholderText}>No wallet</Text>
          </View>
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
        testID="funding-copy-address-button"
        style={[styles.copyButton, copied && styles.copyButtonCopied]}
        onPress={onCopyAddress}
      >
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={COLORS.pureWhite} />
        <Text style={styles.copyButtonText}>{copied ? 'Copied!' : 'Copy Address'}</Text>
      </TouchableOpacity>

      <View style={styles.networkInfo}>
        <View style={styles.networkDot} />
        <Text style={styles.networkText}>Base Network only</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.pureWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalHeaderButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  optionsContainer: {
    padding: 20,
  },
  fundingHelperText: {
    fontSize: 14,
    color: COLORS.grey,
    textAlign: 'center',
    marginBottom: 20,
  },
  fundingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'visible',
  },
  fundingOptionRecommended: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  fundingOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: `${COLORS.grey}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fundingOptionIconRecommended: {
    backgroundColor: `${COLORS.primary}15`,
  },
  fundingOptionContent: {
    flex: 1,
    overflow: 'visible',
  },
  fundingOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
  },
  fundingOptionTitleSecondary: {
    color: COLORS.grey,
  },
  fundingOptionSubtitle: {
    fontSize: 13,
    color: COLORS.grey,
    marginTop: 2,
  },
  fundingOptionNote: {
    fontSize: 12,
    color: COLORS.grey,
    marginTop: 4,
  },
  fundingOptionBenefits: {
    flexDirection: 'row',
    marginTop: 8,
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
  recommendedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    overflow: 'visible',
  },
  recommendedBadge: {
    backgroundColor: `${COLORS.primary}15`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  recommendedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  fundingDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  fundingDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  fundingDividerText: {
    paddingHorizontal: 16,
    fontSize: 13,
    color: COLORS.grey,
  },
  fundingInfoBanner: {
    flexDirection: 'row',
    backgroundColor: `${COLORS.secondary}10`,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  fundingInfoText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.grey,
    lineHeight: 18,
  },
  receiveContainer: {
    padding: 20,
    alignItems: 'center',
  },
  qrContainer: {
    backgroundColor: COLORS.pureWhite,
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  qrPlaceholder: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 8,
  },
  qrPlaceholderText: {
    fontSize: 14,
    color: COLORS.grey,
  },
  receiveInstructions: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 12,
  },
  addressBox: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    width: SCREEN_WIDTH - 80,
    marginBottom: 16,
  },
  addressText: {
    fontSize: 13,
    color: COLORS.black,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  copyButtonCopied: {
    backgroundColor: COLORS.success,
  },
  copyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  networkInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 6,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0052FF',
  },
  networkText: {
    fontSize: 13,
    color: COLORS.grey,
  },
});
