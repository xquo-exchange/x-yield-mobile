/**
 * Badge/Achievement System
 * Tracks and awards badges based on user actions
 *
 * DATA SOURCES:
 * - Add to Savings / Withdrawal counts: Blockchain via transactionHistory.ts (Blockscout API)
 *   Note: Counts user actions, not individual vault allocations
 *   (e.g., adding $100 split across 3 vaults = 1 action)
 * - Current balance: Blockchain via blockchain.ts (RPC calls)
 * - Streaks: Local AsyncStorage (daily app opens - can't be on-chain)
 * - Earned badges: Local AsyncStorage (UI state)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  trackBadgeEarned,
  trackStreakUpdated,
  trackStreakMilestoneReached,
} from './analytics';
import { getCachedTransactions, fetchTransactionHistory, getDateRangePreset, countUserSavingsActions } from './transactionHistory';
import { getVaultPositions } from './blockchain';
import type { Address } from 'viem';

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
    description: 'Made your first Add to Savings',
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

// Local stats (stored in AsyncStorage - for streaks and goals only)
export interface LocalBadgeStats {
  currentStreak: number;
  longestStreak: number;
  lastOpenDate: string | null; // YYYY-MM-DD format
  goalsCompleted: number;
  // Highest balance ever seen (updated when we fetch real balance)
  highestBalance: number;
}

// Real stats fetched from blockchain
export interface BlockchainBadgeStats {
  depositCount: number; // Number of Add to Savings actions (user-initiated, not per-vault)
  withdrawalCount: number; // Number of withdrawal actions
  currentBalance: number; // Current vault balance in USD
}

// Combined stats for badge checking
export interface BadgeStats {
  // From blockchain
  depositCount: number;
  withdrawalCount: number;
  currentBalance: number;
  // From local storage
  currentStreak: number;
  longestStreak: number;
  lastOpenDate: string | null;
  goalsCompleted: number;
  highestBalance: number;
  // Legacy alias for compatibility
  totalDeposits: number; // Alias for depositCount
}

const DEFAULT_LOCAL_STATS: LocalBadgeStats = {
  currentStreak: 0,
  longestStreak: 0,
  lastOpenDate: null,
  goalsCompleted: 0,
  highestBalance: 0,
};

// Legacy default for backward compatibility
const DEFAULT_STATS: BadgeStats = {
  depositCount: 0,
  withdrawalCount: 0,
  currentBalance: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastOpenDate: null,
  goalsCompleted: 0,
  highestBalance: 0,
  totalDeposits: 0,
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
 * Get LOCAL badge stats (streaks, goals, highest balance)
 * These are stored in AsyncStorage because they can't be derived from blockchain
 */
export async function getLocalBadgeStats(): Promise<LocalBadgeStats> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.STATS);
    if (!data) return DEFAULT_LOCAL_STATS;
    return { ...DEFAULT_LOCAL_STATS, ...JSON.parse(data) };
  } catch (error) {
    console.error('[Badges] Error getting local stats:', error);
    return DEFAULT_LOCAL_STATS;
  }
}

/**
 * Save LOCAL badge stats
 */
async function saveLocalBadgeStats(stats: LocalBadgeStats): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
  } catch (error) {
    console.error('[Badges] Error saving local stats:', error);
  }
}

/**
 * Fetch REAL stats from blockchain
 * - Deposit count from transaction history (Blockscout API)
 * - Withdrawal count from transaction history
 * - Current balance from vault positions (RPC)
 */
export async function fetchBlockchainBadgeStats(
  walletAddress: string
): Promise<BlockchainBadgeStats> {
  try {
    // Try cached transactions first for speed
    let transactions = await getCachedTransactions(walletAddress);

    // If no cache, fetch fresh (this may take a few seconds)
    if (!transactions) {
      const dateRange = getDateRangePreset('all_time');
      const result = await fetchTransactionHistory(walletAddress, dateRange, 0, false);
      transactions = result.transactions;
    }

    // Count user-initiated savings actions (grouped, not per-vault)
    // This ensures "Add to Savings" counts as 1 action even if split across 3 vaults
    const { addToSavingsCount, withdrawCount } = countUserSavingsActions(transactions);

    // Fetch current vault balance
    const positions = await getVaultPositions(walletAddress as Address);
    const currentBalance = parseFloat(positions.totalUsdValue);

    return {
      depositCount: addToSavingsCount,
      withdrawalCount: withdrawCount,
      currentBalance,
    };
  } catch (error) {
    console.error('[Badges] Error fetching blockchain stats:', error);
    return {
      depositCount: 0,
      withdrawalCount: 0,
      currentBalance: 0,
    };
  }
}

/**
 * Get COMBINED badge stats (local + blockchain)
 * This merges local streak data with real blockchain data
 */
export async function getBadgeStats(walletAddress?: string): Promise<BadgeStats> {
  const localStats = await getLocalBadgeStats();

  // If no wallet address, return local stats with zero blockchain values
  if (!walletAddress) {
    return {
      ...DEFAULT_STATS,
      ...localStats,
      totalDeposits: 0, // Legacy alias
    };
  }

  // Fetch real blockchain stats
  const blockchainStats = await fetchBlockchainBadgeStats(walletAddress);

  // Update highest balance if current is higher
  if (blockchainStats.currentBalance > localStats.highestBalance) {
    localStats.highestBalance = blockchainStats.currentBalance;
    await saveLocalBadgeStats(localStats);
  }

  return {
    // Blockchain data (real, verifiable)
    depositCount: blockchainStats.depositCount,
    withdrawalCount: blockchainStats.withdrawalCount,
    currentBalance: blockchainStats.currentBalance,
    // Local data (streaks, goals)
    currentStreak: localStats.currentStreak,
    longestStreak: localStats.longestStreak,
    lastOpenDate: localStats.lastOpenDate,
    goalsCompleted: localStats.goalsCompleted,
    highestBalance: localStats.highestBalance,
    // Legacy alias for backward compatibility
    totalDeposits: blockchainStats.depositCount,
  };
}

/**
 * Save badge stats (LOCAL only - streaks and goals)
 * @deprecated Use saveLocalBadgeStats instead. Blockchain stats are read-only.
 */
async function saveBadgeStats(stats: Partial<LocalBadgeStats>): Promise<void> {
  const current = await getLocalBadgeStats();
  const updated = { ...current, ...stats };
  await saveLocalBadgeStats(updated);
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
 *
 * NOW USES REAL BLOCKCHAIN DATA:
 * - Deposit count from on-chain transaction history
 * - Current balance from vault positions
 * - Goals/streaks still from local storage
 */
export async function checkAndAwardBadges(context: {
  savingsBalance: number;
  walletAddress?: string; // Required for blockchain data
  justMadeDeposit?: boolean;
  justCompletedGoal?: boolean;
}): Promise<string[]> {
  const { savingsBalance, walletAddress, justMadeDeposit, justCompletedGoal } = context;
  const newlyEarned: string[] = [];

  // Get combined stats (blockchain + local)
  const stats = await getBadgeStats(walletAddress);
  const localStats = await getLocalBadgeStats();

  // Update highest balance locally (for tracking all-time high)
  if (savingsBalance > localStats.highestBalance) {
    localStats.highestBalance = savingsBalance;
    await saveLocalBadgeStats(localStats);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DEPOSIT-BASED BADGES (using REAL blockchain data)
  // ═══════════════════════════════════════════════════════════════════════════════

  // First Step - First deposit (check blockchain deposit count)
  // Note: depositCount comes from real blockchain transaction history
  if (stats.depositCount >= 1 || justMadeDeposit) {
    const awarded = await awardBadge('first_step');
    if (awarded) newlyEarned.push('first_step');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // BALANCE-BASED BADGES (using REAL blockchain balance)
  // ═══════════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════════
  // GOAL-BASED BADGES (local storage - user-set goals)
  // ═══════════════════════════════════════════════════════════════════════════════

  // Goal Getter - Completed a goal
  if (justCompletedGoal) {
    localStats.goalsCompleted += 1;
    await saveLocalBadgeStats(localStats);

    const awarded = await awardBadge('goal_getter');
    if (awarded) newlyEarned.push('goal_getter');
  }

  return newlyEarned;
}

/**
 * Track app open and update streak
 * Returns newly earned badges (if any)
 *
 * STREAKS ARE LOCAL: This is intentional - streaks track daily app opens
 * which can't be determined from blockchain data.
 */
export async function trackAppOpen(): Promise<string[]> {
  // Use LOCAL stats for streaks (can't be on-chain)
  const localStats = await getLocalBadgeStats();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const newlyEarned: string[] = [];

  if (localStats.lastOpenDate === today) {
    // Already opened today, no streak update needed
    return [];
  }

  if (localStats.lastOpenDate) {
    // Check if yesterday
    const lastDate = new Date(localStats.lastOpenDate);
    const todayDate = new Date(today);
    const diffDays = Math.floor(
      (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 1) {
      // Consecutive day - increase streak
      localStats.currentStreak += 1;
    } else if (diffDays > 1) {
      // Streak broken - reset
      localStats.currentStreak = 1;
    }
  } else {
    // First open ever
    localStats.currentStreak = 1;
  }

  // Update longest streak
  if (localStats.currentStreak > localStats.longestStreak) {
    localStats.longestStreak = localStats.currentStreak;
  }

  localStats.lastOpenDate = today;
  await saveLocalBadgeStats(localStats);

  // Track streak update in analytics
  trackStreakUpdated(localStats.currentStreak, localStats.longestStreak);

  // Check for streak milestones (7, 14, 30, 60, 90, 180, 365)
  const milestones = [7, 14, 30, 60, 90, 180, 365];
  if (milestones.includes(localStats.currentStreak)) {
    trackStreakMilestoneReached(localStats.currentStreak);
  }

  // Check streak badges
  if (localStats.currentStreak >= 7) {
    const awarded = await awardBadge('consistent');
    if (awarded) newlyEarned.push('consistent');
  }

  if (localStats.currentStreak >= 30) {
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
 * Reset only local stats (streaks, goals, highest balance)
 * Blockchain stats (deposit count, etc.) cannot be reset as they're read-only.
 */
export async function resetLocalStats(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.STATS);
  } catch (error) {
    console.error('[Badges] Error resetting local stats:', error);
  }
}
