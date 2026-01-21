/**
 * CelebrationModal Component
 * "Radiant Success" celebration for successful deposits
 *
 * Features:
 * - Animated circular ring that draws clockwise
 * - Checkmark scales up with spring animation
 * - Counter animation for projected earnings
 * - First deposit special message
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import {
  trackCelebrationModalShown,
  trackCelebrationModalDismissed,
} from '../services/analytics';
import { COLORS } from '../constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Animated Circle Component
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CelebrationModalProps {
  visible: boolean;
  onClose: () => void;
  amount: number;
  apy: number;
  isFirstDeposit?: boolean;
  milestoneReached?: number | null;
}

export default function CelebrationModal({
  visible,
  onClose,
  amount,
  apy,
  isFirstDeposit = false,
  milestoneReached = null,
}: CelebrationModalProps) {
  // Animation values
  const ringProgress = useRef(new Animated.Value(0)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const amountScale = useRef(new Animated.Value(0.8)).current;
  const amountOpacity = useRef(new Animated.Value(0)).current;
  const earningsOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Counter state for earnings animation
  const [displayedEarnings, setDisplayedEarnings] = useState(0);
  const projectedYearlyEarnings = amount * (apy / 100);

  // Ring dimensions
  const RING_SIZE = 120;
  const RING_STROKE_WIDTH = 6;
  const RING_RADIUS = (RING_SIZE - RING_STROKE_WIDTH) / 2;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  // Interpolate ring stroke dash offset
  const strokeDashoffset = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });

  // Run animation sequence when modal becomes visible
  useEffect(() => {
    if (visible) {
      // Track modal shown
      trackCelebrationModalShown(amount, isFirstDeposit, milestoneReached ?? undefined);

      // Reset all values
      ringProgress.setValue(0);
      checkmarkScale.setValue(0);
      titleOpacity.setValue(0);
      amountScale.setValue(0.8);
      amountOpacity.setValue(0);
      earningsOpacity.setValue(0);
      buttonOpacity.setValue(0);
      glowScale.setValue(1);
      glowOpacity.setValue(0);
      setDisplayedEarnings(0);

      // Start animation sequence
      Animated.sequence([
        // Step 1: Ring draws clockwise (800ms)
        Animated.parallel([
          Animated.timing(ringProgress, {
            toValue: 1,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false, // strokeDashoffset can't use native driver
          }),
          // Glow pulse during ring animation
          Animated.sequence([
            Animated.parallel([
              Animated.timing(glowScale, {
                toValue: 1.3,
                duration: 400,
                useNativeDriver: true,
              }),
              Animated.timing(glowOpacity, {
                toValue: 0.4,
                duration: 400,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(glowScale, {
                toValue: 1.1,
                duration: 400,
                useNativeDriver: true,
              }),
              Animated.timing(glowOpacity, {
                toValue: 0.2,
                duration: 400,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]),

        // Step 2: Checkmark scales up with spring (300ms)
        Animated.spring(checkmarkScale, {
          toValue: 1,
          friction: 6,
          tension: 200,
          useNativeDriver: true,
        }),

        // Step 3: Title fades in
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),

        // Step 4: Amount scales and fades in
        Animated.parallel([
          Animated.timing(amountOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.spring(amountScale, {
            toValue: 1,
            friction: 8,
            tension: 100,
            useNativeDriver: true,
          }),
        ]),

        // Step 5: Earnings section fades in
        Animated.timing(earningsOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Step 6: Counter animation for earnings (starts after 1.3s, runs for 1.5s)
      const counterDelay = setTimeout(() => {
        const duration = 1500;
        const startTime = Date.now();
        const endValue = projectedYearlyEarnings;

        const animateCounter = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Ease out cubic for smooth deceleration
          const easedProgress = 1 - Math.pow(1 - progress, 3);
          const currentValue = endValue * easedProgress;

          setDisplayedEarnings(currentValue);

          if (progress < 1) {
            requestAnimationFrame(animateCounter);
          }
        };

        animateCounter();
      }, 1300);

      // Button fades in last
      const buttonDelay = setTimeout(() => {
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 1800);

      return () => {
        clearTimeout(counterDelay);
        clearTimeout(buttonDelay);
      };
    }
  }, [visible, projectedYearlyEarnings]);

  // Format currency
  const formatCurrency = (value: number): string => {
    return `$${value.toFixed(2)}`;
  };

  // Get celebration message
  const getCelebrationMessage = (): string | null => {
    if (isFirstDeposit) {
      return "You've started your journey!";
    }
    if (milestoneReached) {
      return `Milestone reached: $${milestoneReached.toLocaleString()} in Savings!`;
    }
    return null;
  };

  const celebrationMessage = getCelebrationMessage();

  // Handle close with tracking
  const handleClose = () => {
    trackCelebrationModalDismissed();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Animated Ring with Checkmark */}
          <View style={styles.ringContainer}>
            {/* Glow effect */}
            <Animated.View
              style={[
                styles.glow,
                {
                  transform: [{ scale: glowScale }],
                  opacity: glowOpacity,
                },
              ]}
            />

            {/* Background ring (grey) */}
            <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={COLORS.white}
                strokeWidth={RING_STROKE_WIDTH}
                fill="none"
              />
            </Svg>

            {/* Animated progress ring (green) */}
            <Svg
              width={RING_SIZE}
              height={RING_SIZE}
              style={[styles.ringSvg, styles.ringAbsolute]}
            >
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={COLORS.success}
                strokeWidth={RING_STROKE_WIDTH}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                rotation="-90"
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            </Svg>

            {/* Checkmark icon */}
            <Animated.View
              style={[
                styles.checkmarkContainer,
                {
                  transform: [{ scale: checkmarkScale }],
                },
              ]}
            >
              <Ionicons name="checkmark" size={48} color={COLORS.success} />
            </Animated.View>
          </View>

          {/* Title */}
          <Animated.Text style={[styles.title, { opacity: titleOpacity }]}>
            Deposit Successful
          </Animated.Text>

          {/* First deposit / Milestone message */}
          {celebrationMessage && (
            <Animated.Text
              style={[styles.celebrationMessage, { opacity: titleOpacity }]}
            >
              {celebrationMessage}
            </Animated.Text>
          )}

          {/* Amount */}
          <Animated.View
            style={[
              styles.amountContainer,
              {
                opacity: amountOpacity,
                transform: [{ scale: amountScale }],
              },
            ]}
          >
            <Text style={styles.amount}>{formatCurrency(amount)}</Text>
            <Text style={styles.amountLabel}>added to Savings</Text>
          </Animated.View>

          {/* Projected Earnings */}
          <Animated.View
            style={[styles.earningsContainer, { opacity: earningsOpacity }]}
          >
            <Text style={styles.earningsLabel}>Projected yearly earnings</Text>
            <View style={styles.earningsRow}>
              <Text style={styles.earningsPrefix}>~</Text>
              <Text style={styles.earningsValue}>
                {formatCurrency(displayedEarnings)}
              </Text>
              <Text style={styles.earningsSuffix}>/year</Text>
            </View>
            <Text style={styles.apyNote}>at current {apy.toFixed(1)}% APY</Text>
          </Animated.View>

          {/* Action Button */}
          <Animated.View style={{ opacity: buttonOpacity, width: '100%' }}>
            <TouchableOpacity
              style={styles.button}
              onPress={handleClose}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>View Savings</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 4, 27, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  ringContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  glow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.success,
  },
  ringSvg: {
    position: 'absolute',
  },
  ringAbsolute: {
    transform: [{ rotateZ: '0deg' }],
  },
  checkmarkContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 8,
    textAlign: 'center',
  },
  celebrationMessage: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.success,
    marginBottom: 16,
    textAlign: 'center',
  },
  amountContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  amount: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.black,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  amountLabel: {
    fontSize: 15,
    color: COLORS.grey,
    marginTop: 4,
  },
  earningsContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  earningsLabel: {
    fontSize: 13,
    color: COLORS.grey,
    marginBottom: 8,
  },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  earningsPrefix: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.success,
  },
  earningsValue: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.success,
    fontVariant: ['tabular-nums'],
  },
  earningsSuffix: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.success,
    marginLeft: 4,
  },
  apyNote: {
    fontSize: 13,
    color: COLORS.grey,
    marginTop: 8,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
});
