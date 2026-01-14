/**
 * Savings Goal Service
 * Manages user savings goals with AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidAmount } from '../utils/validation';

const STORAGE_KEY = '@savings_goal';

export interface SavingsGoal {
  targetAmount: number;
  createdAt: number;
  reachedAt?: number;
}

// Preset goal amounts
export const PRESET_GOALS = [1000, 5000, 10000, 25000, 50000, 100000];

/**
 * Get the current savings goal
 */
export async function getSavingsGoal(): Promise<SavingsGoal | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data) as SavingsGoal;
  } catch (error) {
    console.error('[SavingsGoal] Error getting goal:', error);
    return null;
  }
}

/**
 * Set a new savings goal
 */
export async function setSavingsGoal(targetAmount: number): Promise<SavingsGoal> {
  // Validate amount
  if (!isValidAmount(targetAmount)) {
    throw new Error('Invalid target amount');
  }

  const goal: SavingsGoal = {
    targetAmount,
    createdAt: Date.now(),
  };

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(goal));
    return goal;
  } catch (error) {
    console.error('[SavingsGoal] Error setting goal:', error);
    throw error;
  }
}

/**
 * Mark goal as reached
 */
export async function markGoalReached(): Promise<void> {
  try {
    const goal = await getSavingsGoal();
    if (goal && !goal.reachedAt) {
      goal.reachedAt = Date.now();
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(goal));
    }
  } catch (error) {
    console.error('[SavingsGoal] Error marking goal reached:', error);
  }
}

/**
 * Clear the current goal
 */
export async function clearSavingsGoal(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[SavingsGoal] Error clearing goal:', error);
  }
}

/**
 * Calculate progress towards goal
 */
export function calculateProgress(
  currentSavings: number,
  targetAmount: number
): {
  progress: number;
  percentage: number;
  remaining: number;
  isComplete: boolean;
} {
  const progress = Math.min(currentSavings / targetAmount, 1);
  const percentage = Math.round(progress * 100);
  const remaining = Math.max(0, targetAmount - currentSavings);
  const isComplete = currentSavings >= targetAmount;

  return {
    progress,
    percentage,
    remaining,
    isComplete,
  };
}

/**
 * Format currency for display
 */
export function formatGoalAmount(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}k`;
  }
  return `$${amount}`;
}
