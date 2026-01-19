/**
 * useOnboardingTutorial Hook
 *
 * Manages the state and logic for the first-time user onboarding tutorial.
 * Tracks whether the tutorial has been shown, current step, and provides
 * navigation functions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LayoutRectangle, View } from 'react-native';

const TUTORIAL_COMPLETED_KEY = '@onboarding/tutorial_completed';
const TUTORIAL_VERSION_KEY = '@onboarding/tutorial_version';

// Increment this to force tutorial to show again for all users
const CURRENT_TUTORIAL_VERSION = 1;

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export interface TutorialTargetRef {
  id: string;
  ref: React.RefObject<View | null>;
}

export interface UseOnboardingTutorialResult {
  /** Whether the tutorial should be shown */
  shouldShowTutorial: boolean;
  /** Whether the tutorial is currently active */
  isActive: boolean;
  /** Current step index (0-based) */
  currentStepIndex: number;
  /** Current step data */
  currentStep: TutorialStep | null;
  /** Total number of steps */
  totalSteps: number;
  /** Start the tutorial */
  startTutorial: () => void;
  /** Go to next step */
  nextStep: () => void;
  /** Go to previous step */
  previousStep: () => void;
  /** Skip/close the tutorial */
  skipTutorial: () => void;
  /** Complete the tutorial (on last step) */
  completeTutorial: () => void;
  /** Reset tutorial (for "watch again" feature) */
  resetTutorial: () => Promise<void>;
  /** Register a target element ref */
  registerTarget: (id: string, ref: React.RefObject<View | null>) => void;
  /** Get the ref for a specific target */
  getTargetRef: (id: string) => React.RefObject<View | null> | null;
  /** Get measured layout for a target */
  measureTarget: (id: string) => Promise<LayoutRectangle | null>;
  /** Whether we're still loading the initial state */
  isLoading: boolean;
}

// Define the tutorial steps
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to X-Yield! 👋',
    description: "We'll show you how the app works in a few simple steps.",
    position: 'center',
  },
  {
    id: 'balance',
    title: 'Your Total Balance',
    description: 'Here you can see your total balance across Cash and Savings. It updates in real-time!',
    position: 'bottom',
  },
  {
    id: 'savings',
    title: 'Your Savings',
    description: 'The Savings section shows your invested funds and current APY. Earn while you sleep!',
    position: 'top',
  },
  {
    id: 'addFunds',
    title: 'Add Funds',
    description: 'Tap here to add funds to your account. You can use a card or transfer USDC.',
    position: 'top',
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Access settings to manage notifications, view your achievements, and more.',
    position: 'bottom',
  },
];

export function useOnboardingTutorial(): UseOnboardingTutorialResult {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Store refs to target elements
  const targetRefs = useRef<Map<string, React.RefObject<View | null>>>(new Map());

  // Check if tutorial should be shown on mount
  useEffect(() => {
    const checkTutorialStatus = async () => {
      try {
        const [completed, version] = await Promise.all([
          AsyncStorage.getItem(TUTORIAL_COMPLETED_KEY),
          AsyncStorage.getItem(TUTORIAL_VERSION_KEY),
        ]);

        const savedVersion = version ? parseInt(version, 10) : 0;

        // Show tutorial if never completed or if version has changed
        if (completed !== 'true' || savedVersion < CURRENT_TUTORIAL_VERSION) {
          setShouldShowTutorial(true);
        }
      } catch (error) {
        console.error('[OnboardingTutorial] Error checking tutorial status:', error);
        // On error, don't show tutorial to avoid blocking the user
        setShouldShowTutorial(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkTutorialStatus();
  }, []);

  const startTutorial = useCallback(() => {
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  }, [currentStepIndex]);

  const previousStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  const markTutorialComplete = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true'),
        AsyncStorage.setItem(TUTORIAL_VERSION_KEY, CURRENT_TUTORIAL_VERSION.toString()),
      ]);
      setShouldShowTutorial(false);
    } catch (error) {
      console.error('[OnboardingTutorial] Error saving tutorial completion:', error);
    }
  }, []);

  const skipTutorial = useCallback(async () => {
    setIsActive(false);
    await markTutorialComplete();
  }, [markTutorialComplete]);

  const completeTutorial = useCallback(async () => {
    setIsActive(false);
    await markTutorialComplete();
  }, [markTutorialComplete]);

  const resetTutorial = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(TUTORIAL_COMPLETED_KEY);
      await AsyncStorage.removeItem(TUTORIAL_VERSION_KEY);
      setShouldShowTutorial(true);
      setCurrentStepIndex(0);
    } catch (error) {
      console.error('[OnboardingTutorial] Error resetting tutorial:', error);
    }
  }, []);

  const registerTarget = useCallback((id: string, ref: React.RefObject<View | null>) => {
    targetRefs.current.set(id, ref);
  }, []);

  const getTargetRef = useCallback((id: string): React.RefObject<View | null> | null => {
    return targetRefs.current.get(id) || null;
  }, []);

  const measureTarget = useCallback(async (id: string): Promise<LayoutRectangle | null> => {
    const ref = targetRefs.current.get(id);
    if (!ref?.current) return null;

    return new Promise((resolve) => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width === 0 && height === 0) {
          resolve(null);
        } else {
          resolve({ x, y, width, height });
        }
      });
    });
  }, []);

  const currentStep = isActive ? TUTORIAL_STEPS[currentStepIndex] : null;

  return {
    shouldShowTutorial,
    isActive,
    currentStepIndex,
    currentStep,
    totalSteps: TUTORIAL_STEPS.length,
    startTutorial,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    resetTutorial,
    registerTarget,
    getTargetRef,
    measureTarget,
    isLoading,
  };
}
