import React from 'react';
import {
  getSavingsGoal,
  setSavingsGoal,
  clearSavingsGoal,
  markGoalReached,
  SavingsGoal,
} from '../services/savingsGoal';
import {
  trackSavingsGoalSet,
  trackSavingsGoalCleared,
  trackSavingsGoalReached,
} from '../services/analytics';

export interface UseSavingsGoalResult {
  savingsGoal: SavingsGoal | null;
  showGoalModal: boolean;
  showGoalCelebration: boolean;
  setShowGoalModal: (v: boolean) => void;
  setShowGoalCelebration: (v: boolean) => void;
  handleSetGoal: (amount: number) => Promise<void>;
  handleClearGoal: () => Promise<void>;
  handleGoalReached: (
    savingsBalance: number,
    displayAddress: string,
    checkBadgesForGoal: (balance: number, address: string) => Promise<void>,
  ) => Promise<void>;
}

export function useSavingsGoalState(): UseSavingsGoalResult {
  const [savingsGoal, setSavingsGoalState] = React.useState<SavingsGoal | null>(null);
  const [showGoalModal, setShowGoalModal] = React.useState(false);
  const [showGoalCelebration, setShowGoalCelebration] = React.useState(false);

  React.useEffect(() => {
    const loadGoal = async () => {
      const goal = await getSavingsGoal();
      setSavingsGoalState(goal);
    };
    loadGoal();
  }, []);

  const handleSetGoal = async (amount: number) => {
    const goal = await setSavingsGoal(amount);
    setSavingsGoalState(goal);
    trackSavingsGoalSet(amount);
  };

  const handleClearGoal = async () => {
    await clearSavingsGoal();
    setSavingsGoalState(null);
    trackSavingsGoalCleared();
  };

  const handleGoalReached = async (
    savingsBalance: number,
    displayAddress: string,
    checkBadgesForGoal: (balance: number, address: string) => Promise<void>,
  ) => {
    await markGoalReached();
    setShowGoalCelebration(true);
    trackSavingsGoalReached(savingsGoal?.targetAmount || 0);
    await checkBadgesForGoal(savingsBalance, displayAddress);
  };

  return {
    savingsGoal,
    showGoalModal,
    showGoalCelebration,
    setShowGoalModal,
    setShowGoalCelebration,
    handleSetGoal,
    handleClearGoal,
    handleGoalReached,
  };
}
