/**
 * AchievementsModal Component
 * Clean, minimal design matching Dashboard style
 * With tappable locked badges showing unlock requirements
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BadgeDefinition,
  BADGE_DEFINITIONS,
  BadgesData,
  BadgeStats,
} from '../services/badges';
import BadgeIcon from './BadgeIcons';
import * as Analytics from '../services/analytics';

const COLORS = {
  primary: '#200191',
  white: '#F5F6FF',
  grey: '#484848',
  lightGrey: '#9CA3AF',
  black: '#00041B',
  pureWhite: '#FFFFFF',
  border: '#E8E8E8',
  success: '#22C55E',
};

// Unlock requirements for each badge
interface UnlockRequirement {
  description: string;
  getProgress: (stats: BadgeStats, currentBalance: number) => { current: number; target: number } | null;
  getProgressText: (stats: BadgeStats, currentBalance: number) => string | null;
}

const UNLOCK_REQUIREMENTS: Record<string, UnlockRequirement> = {
  first_step: {
    description: 'Make your first deposit',
    getProgress: (stats) => ({ current: stats.totalDeposits, target: 1 }),
    getProgressText: (stats) =>
      stats.totalDeposits === 0 ? 'Make a deposit to unlock' : null,
  },
  saver: {
    description: 'Reach $100 in savings',
    getProgress: (stats, currentBalance) => ({ current: Math.floor(currentBalance), target: 100 }),
    getProgressText: (stats, currentBalance) =>
      currentBalance < 100 ? `$${currentBalance.toFixed(0)} / $100` : null,
  },
  committed: {
    description: 'Reach $500 in savings',
    getProgress: (stats, currentBalance) => ({ current: Math.floor(currentBalance), target: 500 }),
    getProgressText: (stats, currentBalance) =>
      currentBalance < 500 ? `$${currentBalance.toFixed(0)} / $500` : null,
  },
  serious_saver: {
    description: 'Reach $1,000 in savings',
    getProgress: (stats, currentBalance) => ({ current: Math.floor(currentBalance), target: 1000 }),
    getProgressText: (stats, currentBalance) =>
      currentBalance < 1000 ? `$${currentBalance.toFixed(0)} / $1,000` : null,
  },
  goal_getter: {
    description: 'Complete a savings goal',
    getProgress: (stats) => ({ current: stats.goalsCompleted, target: 1 }),
    getProgressText: (stats) =>
      stats.goalsCompleted === 0 ? 'Set and complete a goal' : null,
  },
  consistent: {
    description: 'Use the app for 7 days in a row',
    getProgress: (stats) => ({ current: stats.currentStreak, target: 7 }),
    getProgressText: (stats) =>
      stats.currentStreak < 7 ? `${stats.currentStreak} / 7 days` : null,
  },
  dedicated: {
    description: 'Use the app for 30 days in a row',
    getProgress: (stats) => ({ current: stats.currentStreak, target: 30 }),
    getProgressText: (stats) =>
      stats.currentStreak < 30 ? `${stats.currentStreak} / 30 days` : null,
  },
};

interface AchievementsModalProps {
  visible: boolean;
  onClose: () => void;
  badges: BadgesData;
  stats: BadgeStats;
  currentBalance?: number; // Current savings balance for progress calculation
}

export default function AchievementsModal({
  visible,
  onClose,
  badges,
  stats,
  currentBalance = 0,
}: AchievementsModalProps) {
  const [selectedBadge, setSelectedBadge] = useState<BadgeDefinition | null>(null);
  const earnedCount = Object.values(badges).filter((b) => b.earned).length;
  const totalCount = BADGE_DEFINITIONS.length;

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleBadgeTap = (badge: BadgeDefinition, isEarned: boolean) => {
    if (!isEarned) {
      Analytics.track('Locked Badge Tapped', {
        badge_id: badge.id,
        badge_name: badge.name,
      });
      setSelectedBadge(badge);
    }
  };

  const closeTooltip = () => {
    setSelectedBadge(null);
  };

  const renderBadgeCard = (badge: BadgeDefinition) => {
    const isEarned = badges[badge.id]?.earned || false;
    const earnedAt = badges[badge.id]?.earnedAt || null;

    return (
      <TouchableOpacity
        key={badge.id}
        style={[
          styles.badgeCard,
          isEarned && styles.badgeCardEarned,
        ]}
        onPress={() => handleBadgeTap(badge, isEarned)}
        activeOpacity={isEarned ? 1 : 0.7}
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
          <View style={styles.lockedRow}>
            <Ionicons name="lock-closed" size={10} color={COLORS.lightGrey} />
            <Text style={styles.lockedText}>Tap to see how</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderTooltip = () => {
    if (!selectedBadge) return null;

    const requirement = UNLOCK_REQUIREMENTS[selectedBadge.id];
    const progress = requirement?.getProgress(stats, currentBalance);
    const progressText = requirement?.getProgressText(stats, currentBalance);
    const progressPercent = progress
      ? Math.min(100, (progress.current / progress.target) * 100)
      : 0;

    return (
      <Modal
        visible={!!selectedBadge}
        transparent
        animationType="fade"
        onRequestClose={closeTooltip}
      >
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={closeTooltip}
        >
          <View style={styles.tooltipContainer}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.tooltipContent}>
                {/* Badge Icon */}
                <View style={styles.tooltipIconContainer}>
                  <BadgeIcon badgeId={selectedBadge.id} size={32} isLocked={true} />
                </View>

                {/* Badge Name */}
                <Text style={styles.tooltipTitle}>{selectedBadge.name}</Text>

                {/* How to Unlock */}
                <View style={styles.tooltipSection}>
                  <Text style={styles.tooltipLabel}>How to unlock</Text>
                  <Text style={styles.tooltipDescription}>
                    {requirement?.description || selectedBadge.description}
                  </Text>
                </View>

                {/* Progress */}
                {progressText && (
                  <View style={styles.tooltipSection}>
                    <Text style={styles.tooltipLabel}>Your progress</Text>
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            { width: `${progressPercent}%` }
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>{progressText}</Text>
                    </View>
                  </View>
                )}

                {/* Dismiss Button */}
                <TouchableOpacity style={styles.tooltipButton} onPress={closeTooltip}>
                  <Text style={styles.tooltipButtonText}>Got it</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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

      {/* Tooltip for locked badges */}
      {renderTooltip()}
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
    opacity: 0.6,
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
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lockedText: {
    fontSize: 11,
    color: COLORS.lightGrey,
  },
  // Tooltip styles
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 4, 27, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  tooltipContainer: {
    width: '100%',
    maxWidth: 320,
  },
  tooltipContent: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  tooltipIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 16,
    textAlign: 'center',
  },
  tooltipSection: {
    width: '100%',
    marginBottom: 16,
  },
  tooltipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.lightGrey,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tooltipDescription: {
    fontSize: 15,
    color: COLORS.black,
    lineHeight: 22,
  },
  progressContainer: {
    width: '100%',
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    textAlign: 'center',
  },
  tooltipButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
    width: '100%',
  },
  tooltipButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.pureWhite,
    textAlign: 'center',
  },
});
