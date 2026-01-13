/**
 * AchievementsModal Component
 * Clean, minimal design matching Dashboard style
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BadgeDefinition,
  BADGE_DEFINITIONS,
  BadgesData,
  BadgeStats,
} from '../services/badges';
import BadgeIcon from './BadgeIcons';

const COLORS = {
  primary: '#200191',
  white: '#F5F6FF',
  grey: '#484848',
  lightGrey: '#9CA3AF',
  black: '#00041B',
  pureWhite: '#FFFFFF',
  border: '#E8E8E8',
};

interface AchievementsModalProps {
  visible: boolean;
  onClose: () => void;
  badges: BadgesData;
  stats: BadgeStats;
}

export default function AchievementsModal({
  visible,
  onClose,
  badges,
  stats,
}: AchievementsModalProps) {
  const earnedCount = Object.values(badges).filter((b) => b.earned).length;
  const totalCount = BADGE_DEFINITIONS.length;

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderBadgeCard = (badge: BadgeDefinition) => {
    const isEarned = badges[badge.id]?.earned || false;
    const earnedAt = badges[badge.id]?.earnedAt || null;

    return (
      <View
        key={badge.id}
        style={[
          styles.badgeCard,
          isEarned && styles.badgeCardEarned,
        ]}
      >
        {/* Icon */}
        <View style={[styles.badgeIcon, isEarned && styles.badgeIconEarned]}>
          <BadgeIcon badgeId={badge.id} size={24} isLocked={!isEarned} />
        </View>

        {/* Name */}
        <Text
          style={[styles.badgeName, !isEarned && styles.badgeNameLocked]}
          numberOfLines={1}
        >
          {badge.name}
        </Text>

        {/* Description */}
        <Text
          style={[styles.badgeDescription, !isEarned && styles.badgeDescriptionLocked]}
          numberOfLines={2}
        >
          {badge.description}
        </Text>

        {/* Status */}
        {isEarned ? (
          <Text style={styles.earnedDate}>{formatDate(earnedAt)}</Text>
        ) : (
          <Text style={styles.lockedText}>Locked</Text>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.black} />
            </TouchableOpacity>
            <Text style={styles.title}>Achievements</Text>
            <View style={styles.closeButton} />
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{earnedCount}/{totalCount}</Text>
              <Text style={styles.statLabel}>Badges</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.currentStreak}</Text>
              <Text style={styles.statLabel}>Day Streak</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalDeposits}</Text>
              <Text style={styles.statLabel}>Deposits</Text>
            </View>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* All Badges Grid */}
            <View style={styles.badgeGrid}>
              {BADGE_DEFINITIONS.map(renderBadgeCard)}
            </View>
          </ScrollView>
        </View>
      </View>
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
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '75%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.pureWhite,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.black,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.black,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.grey,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  badgeCard: {
    width: '48%',
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    opacity: 0.5,
  },
  badgeCardEarned: {
    opacity: 1,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  badgeIconEarned: {
    backgroundColor: `${COLORS.primary}10`,
  },
  badgeName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeNameLocked: {
    color: COLORS.lightGrey,
  },
  badgeDescription: {
    fontSize: 11,
    color: COLORS.grey,
    textAlign: 'center',
    lineHeight: 14,
    marginBottom: 8,
    minHeight: 28,
  },
  badgeDescriptionLocked: {
    color: COLORS.lightGrey,
  },
  earnedDate: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '500',
  },
  lockedText: {
    fontSize: 11,
    color: COLORS.lightGrey,
  },
});
