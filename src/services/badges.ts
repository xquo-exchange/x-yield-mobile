/**
 * Badge/Achievement System
 * Tracks and awards badges based on user actions
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  trackBadgeEarned,
  trackStreakUpdated,
  trackStreakMilestoneReached,
} from './analytics';

// Storage keys
const STORAGE_KEYS = {
  BADGES: '@badges/earned',
  STATS: '@badges/stats',
};

// Badge definitions
export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string; // Ionicons name
  category: 'savings' | 'goals' | 'engagement';
  color: 'purple' | 'green' | 'blue';
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first_step',
    name: 'First Step',
    description: 'Made your first deposit',
    icon: 'footsteps',
    category: 'savings',
    color: 'green',
  },
  {
    id: 'saver',
    name: 'Saver',
    description: 'Reached $100 in savings',
    icon: 'wallet',
    category: 'savings',
    color: 'purple',
  },
  {
    id: 'committed',
    name: 'Committed',
    description: 'Reached $500 in savings',
    icon: 'trending-up',
    category: 'savings',
    color: 'purple',
  },
  {
    id: 'serious_saver',
    name: 'Serious Saver',
    description: 'Reached $1,000 in savings',
    icon: 'star',
    category: 'savings',
    color: 'green',
  },
  {
    id: 'goal_getter',
    name: 'Goal Getter',
    description: 'Completed a savings goal',
    icon: 'trophy',
    category: 'goals',
    color: 'green',
  },
  {
    id: 'consistent',
    name: 'Consistent',
    description: '7 day streak using the app',
    icon: 'flame',
    category: 'engagement',
    color: 'purple',
  },
  {
    id: 'dedicated',
    name: 'Dedicated',
    description: '30 day streak using the app',
    icon: 'ribbon',
    category: 'engagement',
    color: 'green',
  },
];

// Badge state
export interface BadgeState {
  earned: boolean;
  earnedAt: number | null;
}

export interface BadgesData {
  [badgeId: string]: BadgeState;
}

// User stats for badge tracking
export interface BadgeStats {
  totalDeposits: number;
  highestBalance: number;
  currentStreak: number;
  longestStreak: number;
  lastOpenDate: string | null; // YYYY-MM-DD format
  goalsCompleted: number;
}

const DEFAULT_STATS: BadgeStats = {
  totalDeposits: 0,
  highestBalance: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastOpenDate: null,
  goalsCompleted: 0,
};

/**
 * Get all badges with their earned status
 */
export async function getBadges(): Promise<BadgesData> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.BADGES);
    if (!data) {
      // Initialize with all badges as not earned
      const initial: BadgesData = {};
      BADGE_DEFINITIONS.forEach((badge) => {
        initial[badge.id] = { earned: false, earnedAt: null };
      });
      return initial;
    }
    return JSON.parse(data) as BadgesData;
  } catch (error) {
    console.error('[Badges] Error getting badges:', error);
    return {};
  }
}

/**
 * Get badge stats
 */
export async function getBadgeStats(): Promise<BadgeStats> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.STATS);
    if (!data) return DEFAULT_STATS;
    return { ...DEFAULT_STATS, ...JSON.parse(data) };
  } catch (error) {
    console.error('[Badges] Error getting stats:', error);
    return DEFAULT_STATS;
  }
}

/**
 * Save badge stats
 */
async function saveBadgeStats(stats: BadgeStats): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
  } catch (error) {
    console.error('[Badges] Error saving stats:', error);
  }
}

/**
 * Award a badge
 */
async function awardBadge(badgeId: string): Promise<boolean> {
  try {
    const badges = await getBadges();

    // Check if already earned
    if (badges[badgeId]?.earned) {
      return false;
    }

    // Award the badge
    badges[badgeId] = {
      earned: true,
      earnedAt: Date.now(),
    };

    await AsyncStorage.setItem(STORAGE_KEYS.BADGES, JSON.stringify(badges));

    // Track badge earned in analytics
    const badgeDef = BADGE_DEFINITIONS.find((b) => b.id === badgeId);
    if (badgeDef) {
      trackBadgeEarned(badgeId, badgeDef.name);
    }

    return true;
  } catch (error) {
    console.error('[Badges] Error awarding badge:', error);
    return false;
  }
}

/**
 * Check and award badges based on current state
 * Returns array of newly earned badge IDs
 */
export async function checkAndAwardBadges(context: {
  savingsBalance: number;
  justMadeDeposit?: boolean;
  justCompletedGoal?: boolean;
}): Promise<string[]> {
  const { savingsBalance, justMadeDeposit, justCompletedGoal } = context;
  const newlyEarned: string[] = [];
  const stats = await getBadgeStats();

  // Update highest balance
  if (savingsBalance > stats.highestBalance) {
    stats.highestBalance = savingsBalance;
    await saveBadgeStats(stats);
  }

  // First Step - First deposit
  if (justMadeDeposit) {
    stats.totalDeposits += 1;
    await saveBadgeStats(stats);

    if (stats.totalDeposits === 1) {
      const awarded = await awardBadge('first_step');
      if (awarded) newlyEarned.push('first_step');
    }
  }

  // Saver - $100 in savings
  if (savingsBalance >= 100) {
    const awarded = await awardBadge('saver');
    if (awarded) newlyEarned.push('saver');
  }

  // Committed - $500 in savings
  if (savingsBalance >= 500) {
    const awarded = await awardBadge('committed');
    if (awarded) newlyEarned.push('committed');
  }

  // Serious Saver - $1,000 in savings
  if (savingsBalance >= 1000) {
    const awarded = await awardBadge('serious_saver');
    if (awarded) newlyEarned.push('serious_saver');
  }

  // Goal Getter - Completed a goal
  if (justCompletedGoal) {
    stats.goalsCompleted += 1;
    await saveBadgeStats(stats);

    const awarded = await awardBadge('goal_getter');
    if (awarded) newlyEarned.push('goal_getter');
  }

  return newlyEarned;
}

/**
 * Track app open and update streak
 * Returns newly earned badges (if any)
 */
export async function trackAppOpen(): Promise<string[]> {
  const stats = await getBadgeStats();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const newlyEarned: string[] = [];

  if (stats.lastOpenDate === today) {
    // Already opened today, no streak update needed
    return [];
  }

  if (stats.lastOpenDate) {
    // Check if yesterday
    const lastDate = new Date(stats.lastOpenDate);
    const todayDate = new Date(today);
    const diffDays = Math.floor(
      (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 1) {
      // Consecutive day - increase streak
      stats.currentStreak += 1;
    } else if (diffDays > 1) {
      // Streak broken - reset
      stats.currentStreak = 1;
    }
  } else {
    // First open ever
    stats.currentStreak = 1;
  }

  // Update longest streak
  if (stats.currentStreak > stats.longestStreak) {
    stats.longestStreak = stats.currentStreak;
  }

  stats.lastOpenDate = today;
  await saveBadgeStats(stats);

  // Track streak update in analytics
  trackStreakUpdated(stats.currentStreak, stats.longestStreak);

  // Check for streak milestones (7, 14, 30, 60, 90, 180, 365)
  const milestones = [7, 14, 30, 60, 90, 180, 365];
  if (milestones.includes(stats.currentStreak)) {
    trackStreakMilestoneReached(stats.currentStreak);
  }

  // Check streak badges
  if (stats.currentStreak >= 7) {
    const awarded = await awardBadge('consistent');
    if (awarded) newlyEarned.push('consistent');
  }

  if (stats.currentStreak >= 30) {
    const awarded = await awardBadge('dedicated');
    if (awarded) newlyEarned.push('dedicated');
  }

  return newlyEarned;
}

/**
 * Get badge definition by ID
 */
export function getBadgeDefinition(badgeId: string): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find((b) => b.id === badgeId);
}

/**
 * Get count of earned badges
 */
export async function getEarnedBadgeCount(): Promise<number> {
  const badges = await getBadges();
  return Object.values(badges).filter((b) => b.earned).length;
}

/**
 * Reset all badges (for testing)
 */
export async function resetBadges(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.BADGES);
    await AsyncStorage.removeItem(STORAGE_KEYS.STATS);
  } catch (error) {
    console.error('[Badges] Error resetting badges:', error);
  }
}

/**
 * Sync badge stats deposit count with the correct count from milestoneTracker
 * This fixes the bug where balance increases were counted as deposits
 */
export async function syncDepositCount(correctCount: number): Promise<void> {
  try {
    const stats = await getBadgeStats();
    if (stats.totalDeposits !== correctCount) {
      console.log(`[Badges] Syncing deposit count: ${stats.totalDeposits} -> ${correctCount}`);
      stats.totalDeposits = correctCount;
      await saveBadgeStats(stats);
    }
  } catch (error) {
    console.error('[Badges] Error syncing deposit count:', error);
  }
}

/**
 * Reset only the deposit count (for fixing affected users)
 * Preserves other stats like streak
 */
export async function resetDepositCount(): Promise<void> {
  try {
    const stats = await getBadgeStats();
    stats.totalDeposits = 0;
    await saveBadgeStats(stats);
    console.log('[Badges] Deposit count reset to 0');
  } catch (error) {
    console.error('[Badges] Error resetting deposit count:', error);
  }
}
