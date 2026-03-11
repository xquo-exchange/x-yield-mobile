import React from 'react';
import {
  getBadges,
  getBadgeStats,
  getBadgeDefinition,
  checkAndAwardBadges,
  trackAppOpen,
  BadgesData,
  BadgeStats,
  BadgeDefinition,
} from '../services/badges';

export interface UseBadgesResult {
  badges: BadgesData;
  badgeStats: BadgeStats;
  earnedBadgeCount: number;
  showBadgeToast: boolean;
  earnedBadge: BadgeDefinition | null;
  showAchievements: boolean;
  setShowBadgeToast: (v: boolean) => void;
  setEarnedBadge: (v: BadgeDefinition | null) => void;
  setShowAchievements: (v: boolean) => void;
  checkBadgesForGoal: (savingsBalance: number, walletAddress: string) => Promise<void>;
}

export function useBadges(displayAddress: string, savingsBalance: number): UseBadgesResult {
  const [badges, setBadges] = React.useState<BadgesData>({});
  const [badgeStats, setBadgeStats] = React.useState<BadgeStats>({
    depositCount: 0,
    withdrawalCount: 0,
    currentBalance: 0,
    totalDeposits: 0,
    highestBalance: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastOpenDate: null,
    goalsCompleted: 0,
  });
  const [showBadgeToast, setShowBadgeToast] = React.useState(false);
  const [earnedBadge, setEarnedBadge] = React.useState<BadgeDefinition | null>(null);
  const [showAchievements, setShowAchievements] = React.useState(false);

  const earnedBadgeCount = React.useMemo(
    () => Object.values(badges).filter((b) => b.earned).length,
    [badges]
  );

  const showNewBadge = React.useCallback(async (badgeId: string) => {
    const badgeDef = getBadgeDefinition(badgeId);
    if (badgeDef) {
      setEarnedBadge(badgeDef);
      setShowBadgeToast(true);
    }
    const updatedBadges = await getBadges();
    const updatedStats = await getBadgeStats(displayAddress);
    setBadges(updatedBadges);
    setBadgeStats(updatedStats);
  }, [displayAddress]);

  // Load badges and track app open for streaks
  React.useEffect(() => {
    const loadBadgesAndTrackOpen = async () => {
      const [loadedBadges, loadedStats] = await Promise.all([
        getBadges(),
        getBadgeStats(displayAddress),
      ]);
      setBadges(loadedBadges);
      setBadgeStats(loadedStats);

      const newStreakBadges = await trackAppOpen();
      if (newStreakBadges.length > 0) {
        await showNewBadge(newStreakBadges[0]);
      }
    };
    loadBadgesAndTrackOpen();
  }, []);

  // Check badges when savings balance OR wallet address changes
  const prevSavingsRef = React.useRef(savingsBalance);
  const prevAddressRef = React.useRef(displayAddress);
  React.useEffect(() => {
    const checkBadges = async () => {
      const balanceChanged = savingsBalance !== prevSavingsRef.current;
      const addressChanged = displayAddress !== prevAddressRef.current;

      if (savingsBalance > 0 && displayAddress && (balanceChanged || addressChanged)) {
        prevSavingsRef.current = savingsBalance;
        prevAddressRef.current = displayAddress;

        const newBadges = await checkAndAwardBadges({
          savingsBalance,
          walletAddress: displayAddress,
        });

        if (newBadges.length > 0) {
          await showNewBadge(newBadges[0]);
        }
      }
    };
    checkBadges();
  }, [savingsBalance, displayAddress, showNewBadge]);

  const checkBadgesForGoal = React.useCallback(async (balance: number, walletAddress: string) => {
    const newBadges = await checkAndAwardBadges({
      savingsBalance: balance,
      walletAddress,
      justCompletedGoal: true,
    });

    if (newBadges.length > 0) {
      setTimeout(() => showNewBadge(newBadges[0]), 3000);
    }
  }, [showNewBadge]);

  return {
    badges,
    badgeStats,
    earnedBadgeCount,
    showBadgeToast,
    earnedBadge,
    showAchievements,
    setShowBadgeToast,
    setEarnedBadge,
    setShowAchievements,
    checkBadgesForGoal,
  };
}
