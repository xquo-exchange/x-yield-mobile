import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export interface DashboardHeaderProps {
  earnedBadgeCount: number;
  settingsRef: React.RefObject<View | null>;
  onLogoPress: () => void;
  onAchievements: () => void;
  onSettings: () => void;
}

export default function DashboardHeader({
  earnedBadgeCount,
  settingsRef,
  onLogoPress,
  onAchievements,
  onSettings,
}: DashboardHeaderProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onLogoPress}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Image
          source={require('../../../assets/logo_full.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
      </TouchableOpacity>
      <View style={styles.headerButtons}>
        <TouchableOpacity style={styles.headerButton} onPress={onAchievements}>
          <Ionicons name="trophy" size={20} color={COLORS.primary} />
          {earnedBadgeCount > 0 && (
            <View style={styles.badgeCountIndicator}>
              <Text style={styles.badgeCountText}>{earnedBadgeCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          testID="dashboard-settings-button"
          ref={settingsRef}
          style={styles.headerButton}
          onPress={onSettings}
        >
          <Ionicons name="settings-outline" size={22} color={COLORS.grey} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export interface StreakCardProps {
  currentStreak: number;
}

export function StreakCard({ currentStreak }: StreakCardProps) {
  if (currentStreak <= 0) return null;

  return (
    <View style={styles.streakCard}>
      <View style={styles.streakLeft}>
        <Ionicons name="flame" size={20} color="#F97316" />
        <Text style={styles.streakText}>
          <Text style={styles.streakNumber}>{currentStreak}</Text> day streak
        </Text>
      </View>
      <Text style={styles.streakMotivation}>
        {currentStreak >= 7 ? "You're on fire!" : "Open tomorrow to continue"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  headerLogo: {
    width: 100,
    height: 32,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.pureWhite,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  badgeCountIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: COLORS.pureWhite,
  },
  badgeCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.pureWhite,
  },
  streakCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.pureWhite,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  streakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakText: {
    fontSize: 14,
    color: COLORS.black,
  },
  streakNumber: {
    fontWeight: '700',
  },
  streakMotivation: {
    fontSize: 12,
    color: COLORS.grey,
  },
});
