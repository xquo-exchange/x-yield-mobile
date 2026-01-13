/**
 * Milestone Tracker Service
 * Tracks user achievements and deposit milestones using AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const STORAGE_KEYS = {
  FIRST_DEPOSIT: '@milestones/first_deposit',
  DEPOSITS_COUNT: '@milestones/deposits_count',
  TOTAL_DEPOSITED: '@milestones/total_deposited',
  MILESTONES_REACHED: '@milestones/milestones_reached',
};

// Milestone thresholds
export const MILESTONE_AMOUNTS = [100, 500, 1000, 5000, 10000, 25000, 50000, 100000];

export interface MilestoneState {
  isFirstDeposit: boolean;
  depositsCount: number;
  totalDeposited: number;
  milestonesReached: number[];
}

export interface DepositMilestoneResult {
  isFirstDeposit: boolean;
  newMilestoneReached: number | null;
  depositsCount: number;
}

/**
 * Get current milestone state
 */
export async function getMilestoneState(): Promise<MilestoneState> {
  try {
    const [firstDeposit, depositsCount, totalDeposited, milestonesReached] =
      await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.FIRST_DEPOSIT),
        AsyncStorage.getItem(STORAGE_KEYS.DEPOSITS_COUNT),
        AsyncStorage.getItem(STORAGE_KEYS.TOTAL_DEPOSITED),
        AsyncStorage.getItem(STORAGE_KEYS.MILESTONES_REACHED),
      ]);

    return {
      isFirstDeposit: firstDeposit !== 'true',
      depositsCount: depositsCount ? parseInt(depositsCount, 10) : 0,
      totalDeposited: totalDeposited ? parseFloat(totalDeposited) : 0,
      milestonesReached: milestonesReached ? JSON.parse(milestonesReached) : [],
    };
  } catch (error) {
    console.error('[MilestoneTracker] Error getting state:', error);
    return {
      isFirstDeposit: true,
      depositsCount: 0,
      totalDeposited: 0,
      milestonesReached: [],
    };
  }
}

/**
 * Record a deposit and check for milestones
 * Returns celebration data if first deposit or milestone reached
 */
export async function recordDepositMilestone(
  depositAmount: number
): Promise<DepositMilestoneResult> {
  try {
    const currentState = await getMilestoneState();

    const isFirstDeposit = currentState.isFirstDeposit;
    const newDepositsCount = currentState.depositsCount + 1;
    const newTotalDeposited = currentState.totalDeposited + depositAmount;

    // Check for new milestone
    let newMilestoneReached: number | null = null;
    const previousMilestones = currentState.milestonesReached;

    for (const milestone of MILESTONE_AMOUNTS) {
      // Check if we crossed this milestone with this deposit
      const previousTotal = currentState.totalDeposited;
      if (previousTotal < milestone && newTotalDeposited >= milestone) {
        // Only if not already reached
        if (!previousMilestones.includes(milestone)) {
          newMilestoneReached = milestone;
          break; // Only celebrate one milestone at a time
        }
      }
    }

    // Update storage
    const updates: Promise<void>[] = [
      AsyncStorage.setItem(STORAGE_KEYS.DEPOSITS_COUNT, newDepositsCount.toString()),
      AsyncStorage.setItem(STORAGE_KEYS.TOTAL_DEPOSITED, newTotalDeposited.toString()),
    ];

    // Mark first deposit as done
    if (isFirstDeposit) {
      updates.push(AsyncStorage.setItem(STORAGE_KEYS.FIRST_DEPOSIT, 'true'));
    }

    // Record new milestone
    if (newMilestoneReached) {
      const updatedMilestones = [...previousMilestones, newMilestoneReached];
      updates.push(
        AsyncStorage.setItem(
          STORAGE_KEYS.MILESTONES_REACHED,
          JSON.stringify(updatedMilestones)
        )
      );
    }

    await Promise.all(updates);

    return {
      isFirstDeposit,
      newMilestoneReached,
      depositsCount: newDepositsCount,
    };
  } catch (error) {
    console.error('[MilestoneTracker] Error recording deposit:', error);
    return {
      isFirstDeposit: false,
      newMilestoneReached: null,
      depositsCount: 0,
    };
  }
}

/**
 * Get the next milestone to reach
 */
export async function getNextMilestone(): Promise<number | null> {
  const state = await getMilestoneState();

  for (const milestone of MILESTONE_AMOUNTS) {
    if (!state.milestonesReached.includes(milestone) && state.totalDeposited < milestone) {
      return milestone;
    }
  }

  return null;
}

/**
 * Get progress towards next milestone (0-100)
 */
export async function getMilestoneProgress(): Promise<{
  current: number;
  target: number;
  progress: number;
}> {
  const state = await getMilestoneState();
  const nextMilestone = await getNextMilestone();

  if (!nextMilestone) {
    return {
      current: state.totalDeposited,
      target: state.totalDeposited,
      progress: 100,
    };
  }

  // Find previous milestone for progress calculation
  const previousMilestones = MILESTONE_AMOUNTS.filter(m => m < nextMilestone);
  const previousMilestone = previousMilestones.length > 0
    ? previousMilestones[previousMilestones.length - 1]
    : 0;

  const rangeStart = previousMilestone;
  const rangeEnd = nextMilestone;
  const currentInRange = Math.max(0, state.totalDeposited - rangeStart);
  const rangeSize = rangeEnd - rangeStart;

  return {
    current: state.totalDeposited,
    target: nextMilestone,
    progress: Math.min(100, (currentInRange / rangeSize) * 100),
  };
}

/**
 * Reset all milestones (for testing)
 */
export async function resetMilestones(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.FIRST_DEPOSIT),
      AsyncStorage.removeItem(STORAGE_KEYS.DEPOSITS_COUNT),
      AsyncStorage.removeItem(STORAGE_KEYS.TOTAL_DEPOSITED),
      AsyncStorage.removeItem(STORAGE_KEYS.MILESTONES_REACHED),
    ]);
  } catch (error) {
    console.error('[MilestoneTracker] Error resetting milestones:', error);
  }
}
