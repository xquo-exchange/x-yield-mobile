/**
 * SavingsGoalCard Component
 * Shows savings goal progress with animated progress bar
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SavingsGoal, calculateProgress } from '../services/savingsGoal';

const COLORS = {
  primary: '#200191',
  secondary: '#6198FF',
  success: '#22C55E',
  white: '#F5F6FF',
  grey: '#484848',
  black: '#00041B',
  pureWhite: '#FFFFFF',
  border: '#E8E8E8',
  progressBg: '#E5E7EB',
};

interface SavingsGoalCardProps {
  goal: SavingsGoal | null;
  currentSavings: number;
  onSetGoal: () => void;
  onEditGoal: () => void;
  onGoalReached?: () => void;
}

export default function SavingsGoalCard({
  goal,
  currentSavings,
  onSetGoal,
  onEditGoal,
  onGoalReached,
}: SavingsGoalCardProps) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const previousProgressRef = useRef(0);
  const hasTriggeredCelebration = useRef(false);

  // Calculate progress if goal exists
  const progressData = goal
    ? calculateProgress(currentSavings, goal.targetAmount)
    : null;

  // Animate progress bar when progress changes
  useEffect(() => {
    if (progressData) {
      const targetProgress = progressData.progress;

      // Animate the progress bar
      Animated.timing(progressAnim, {
        toValue: targetProgress,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

      // Check if goal was just reached
      if (
        progressData.isComplete &&
        !goal?.reachedAt &&
        !hasTriggeredCelebration.current &&
        previousProgressRef.current < 1
      ) {
        hasTriggeredCelebration.current = true;

        // Celebration pulse animation
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.02,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();

        onGoalReached?.();
      }

      previousProgressRef.current = targetProgress;
    }
  }, [progressData?.progress, goal?.reachedAt]);

  // Interpolate progress bar width
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // No goal set - show prompt
  if (!goal) {
    return (
      <TouchableOpacity style={styles.promptCard} onPress={onSetGoal}>
        <View style={styles.promptIconContainer}>
          <Ionicons name="flag-outline" size={24} color={COLORS.primary} />
        </View>
        <View style={styles.promptContent}>
          <Text style={styles.promptTitle}>Set a savings goal</Text>
          <Text style={styles.promptSubtitle}>
            Track your progress towards a target
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
      </TouchableOpacity>
    );
  }

  // Goal exists - show progress
  const isComplete = progressData?.isComplete || false;
  const progressColor = isComplete ? COLORS.success : COLORS.primary;

  return (
    <Animated.View
      style={[styles.card, { transform: [{ scale: scaleAnim }] }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconContainer,
              isComplete && styles.iconContainerComplete,
            ]}
          >
            <Ionicons
              name={isComplete ? 'trophy' : 'flag'}
              size={20}
              color={isComplete ? COLORS.success : COLORS.primary}
            />
          </View>
          <View>
            <Text style={styles.title}>
              {isComplete ? 'Goal Reached!' : 'Savings Goal'}
            </Text>
            <Text style={styles.subtitle}>
              {isComplete
                ? 'Congratulations!'
                : `Target: $${goal.targetAmount.toLocaleString()}`}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.editButton}
          onPress={onEditGoal}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="pencil" size={16} color={COLORS.grey} />
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressWidth,
                backgroundColor: progressColor,
              },
            ]}
          />
        </View>
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            ${currentSavings.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
          <Text style={styles.statLabel}>Current</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: progressColor }]}>
            {progressData?.percentage}%
          </Text>
          <Text style={styles.statLabel}>Complete</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {isComplete
              ? 'Done!'
              : `$${progressData?.remaining.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}`}
          </Text>
          <Text style={styles.statLabel}>{isComplete ? 'Status' : 'To go'}</Text>
        </View>
      </View>

      {/* Motivational message */}
      {!isComplete && progressData && (
        <Text style={styles.motivation}>
          {progressData.percentage < 25
            ? "You're just getting started!"
            : progressData.percentage < 50
            ? 'Great progress, keep going!'
            : progressData.percentage < 75
            ? "You're halfway there!"
            : "Almost there, you've got this!"}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Prompt card (no goal set)
  promptCard: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  promptIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${COLORS.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  promptContent: {
    flex: 1,
  },
  promptTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 2,
  },
  promptSubtitle: {
    fontSize: 13,
    color: COLORS.grey,
  },

  // Goal card
  card: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${COLORS.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconContainerComplete: {
    backgroundColor: `${COLORS.success}15`,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.black,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.grey,
    marginTop: 2,
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Progress bar
  progressContainer: {
    marginBottom: 20,
  },
  progressBar: {
    height: 12,
    backgroundColor: COLORS.progressBg,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },

  // Stats
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.grey,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },

  // Motivation
  motivation: {
    fontSize: 13,
    color: COLORS.secondary,
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '500',
  },
});
