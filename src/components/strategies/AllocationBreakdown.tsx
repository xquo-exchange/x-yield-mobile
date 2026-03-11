import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import SensitiveView from '../SensitiveView';
import { VaultPosition } from '../../hooks/usePositions';
import * as Analytics from '../../services/analytics';

export interface AllocationBreakdownProps {
  positions: VaultPosition[];
  displayApy: string;
  getVaultApy: (vaultAddress: string) => string | null;
  onAddMoreFunds: () => void;
}

export default function AllocationBreakdown({
  positions,
  displayApy,
  getVaultApy,
  onAddMoreFunds,
}: AllocationBreakdownProps) {
  return (
    <>
      <View style={styles.allocationHeader}>
        <View style={styles.earningBadgeInline}>
          <View style={styles.earningDotInline} />
          <Text style={styles.earningTextInline}>Earning {displayApy}% APY</Text>
        </View>
      </View>

      <Text style={styles.allocationDescription}>
        Your funds are deposited into regulated DeFi lending protocols where they earn yield from borrowers.
        You maintain full ownership at all times.
      </Text>

      <View style={styles.allocationList}>
        <Text style={styles.allocationListLabel}>Current allocation:</Text>
        {positions.map((position) => {
          const vaultApy = getVaultApy(position.vaultAddress);
          const positionValue = parseFloat(position.usdValue);
          if (positionValue <= 0) return null;
          return (
            <View key={position.vaultId} style={styles.allocationRow}>
              <Text style={styles.allocationVaultName}>{position.vaultName}</Text>
              <View style={styles.allocationRight}>
                <SensitiveView>
                  <Text style={styles.allocationValue}>${positionValue.toFixed(2)}</Text>
                </SensitiveView>
                {vaultApy && (
                  <Text style={styles.allocationApy}>{vaultApy}%</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.addMoreSection}>
        <Text style={styles.addMoreText}>
          Add more funds to increase your earnings.
        </Text>
        <TouchableOpacity
          style={styles.addMoreButton}
          onPress={onAddMoreFunds}
        >
          <Ionicons name="add-circle-outline" size={18} color={COLORS.pureWhite} />
          <Text style={styles.addMoreButtonText}>Add Funds on Dashboard</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

export interface HowItWorksSectionProps {
  positions: VaultPosition[];
  getVaultApy: (vaultAddress: string) => string | null;
  showHowItWorks: boolean;
  onToggleHowItWorks: () => void;
}

export function HowItWorksSection({
  positions,
  getVaultApy,
  showHowItWorks,
  onToggleHowItWorks,
}: HowItWorksSectionProps) {
  return (
    <>
      <TouchableOpacity
        style={styles.howItWorksHeader}
        onPress={onToggleHowItWorks}
      >
        <View style={styles.howItWorksLeft}>
          <Ionicons name="help-circle-outline" size={20} color={COLORS.secondary} />
          <Text style={styles.howItWorksTitle}>Where do my funds go?</Text>
        </View>
        <Ionicons
          name={showHowItWorks ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={COLORS.grey}
        />
      </TouchableOpacity>

      {showHowItWorks && (
        <View style={styles.howItWorksContent}>
          <Text style={styles.howItWorksText}>
            Your funds are deposited into regulated DeFi lending protocols where they earn yield from borrowers.
            You maintain full ownership at all times.
          </Text>

          <View style={styles.protocolsList}>
            <Text style={styles.protocolsLabel}>Current allocation:</Text>
            {positions.map((position) => {
              const vaultApy = getVaultApy(position.vaultAddress);
              const positionValue = parseFloat(position.usdValue);
              if (positionValue <= 0) return null;
              return (
                <View key={position.vaultId} style={styles.protocolRow}>
                  <Text style={styles.protocolName}>{position.vaultName}</Text>
                  <View style={styles.protocolRight}>
                    <Text style={styles.protocolValue}>${positionValue.toFixed(2)}</Text>
                    {vaultApy && (
                      <Text style={styles.protocolApy}>{vaultApy}%</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  allocationHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  earningBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.success}15`,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  earningDotInline: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  earningTextInline: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success,
  },
  allocationDescription: {
    fontSize: 14,
    color: COLORS.grey,
    lineHeight: 22,
    marginBottom: 20,
    textAlign: 'center',
  },
  allocationList: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  allocationListLabel: {
    fontSize: 13,
    color: COLORS.grey,
    marginBottom: 12,
  },
  allocationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  allocationVaultName: {
    fontSize: 14,
    color: COLORS.black,
    fontWeight: '500',
    flex: 1,
  },
  allocationRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  allocationValue: {
    fontSize: 14,
    color: COLORS.black,
    fontWeight: '600',
  },
  allocationApy: {
    fontSize: 12,
    color: COLORS.secondary,
    backgroundColor: `${COLORS.secondary}15`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontWeight: '600',
  },
  addMoreSection: {
    alignItems: 'center',
    paddingTop: 4,
    gap: 16,
  },
  addMoreText: {
    fontSize: 14,
    color: COLORS.grey,
    textAlign: 'center',
  },
  addMoreButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  addMoreButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  howItWorksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  howItWorksLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  howItWorksTitle: {
    fontSize: 15,
    color: COLORS.grey,
  },
  howItWorksContent: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 20,
    marginTop: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  howItWorksText: {
    fontSize: 14,
    color: COLORS.grey,
    lineHeight: 22,
    marginBottom: 16,
  },
  protocolsList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
  },
  protocolsLabel: {
    fontSize: 13,
    color: COLORS.grey,
    marginBottom: 12,
  },
  protocolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  protocolName: {
    fontSize: 14,
    color: COLORS.black,
    flex: 1,
  },
  protocolRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  protocolValue: {
    fontSize: 14,
    color: COLORS.black,
    fontWeight: '500',
  },
  protocolApy: {
    fontSize: 12,
    color: COLORS.secondary,
    backgroundColor: `${COLORS.secondary}15`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
