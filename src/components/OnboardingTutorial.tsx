/**
 * OnboardingTutorial Component
 *
 * A guided spotlight tutorial overlay that highlights UI elements one at a time
 * with explanatory tooltips. Used for first-time user onboarding.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  LayoutRectangle,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TutorialStep } from '../hooks/useOnboardingTutorial';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const COLORS = {
  primary: '#200191',
  secondary: '#6198FF',
  white: '#F5F6FF',
  pureWhite: '#FFFFFF',
  black: '#00041B',
  overlay: 'rgba(0, 0, 0, 0.75)',
};

interface OnboardingTutorialProps {
  isActive: boolean;
  currentStep: TutorialStep | null;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onComplete: () => void;
  measureTarget: (id: string) => Promise<LayoutRectangle | null>;
}

export default function OnboardingTutorial({
  isActive,
  currentStep,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrevious,
  onSkip,
  onComplete,
  measureTarget,
}: OnboardingTutorialProps) {
  const [targetLayout, setTargetLayout] = useState<LayoutRectangle | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Animation values
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  const isLastStep = currentStepIndex === totalSteps - 1;
  const isFirstStep = currentStepIndex === 0;
  // Show as center step if position is 'center' OR if target element doesn't exist (after measuring)
  const hasTargetPosition = currentStep?.position && currentStep.position !== 'center';
  const isCenterStep = currentStep?.position === 'center' || (!isMeasuring && !targetLayout && hasTargetPosition);

  // Measure target when step changes
  useEffect(() => {
    const measureCurrentTarget = async () => {
      if (!currentStep || currentStep.position === 'center') {
        setTargetLayout(null);
        setIsMeasuring(false);
        return;
      }

      setIsMeasuring(true);
      setTargetLayout(null); // Reset layout while measuring

      // Wait for scroll animation to complete before measuring
      // The DashboardScreen scrolls to the element, so we need to wait
      await new Promise((resolve) => setTimeout(resolve, 500));

      const layout = await measureTarget(currentStep.id);
      setTargetLayout(layout);
      setIsMeasuring(false);

      // If no layout found, the element might not exist (e.g., savings for new users)
      if (!layout) {
        console.warn(`[OnboardingTutorial] No layout found for step: ${currentStep.id}`);
      }
    };

    if (isActive && currentStep) {
      measureCurrentTarget();
    }
  }, [isActive, currentStep, currentStepIndex, measureTarget]);

  // Fade in/out animation
  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setIsVisible(false);
      });
    }
  }, [isActive, fadeAnim, scaleAnim]);

  // Pulse animation for spotlight
  useEffect(() => {
    if (isActive && targetLayout) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isActive, targetLayout, pulseAnim]);

  // Reset animations when step changes
  useEffect(() => {
    scaleAnim.setValue(0.9);
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [currentStepIndex, scaleAnim]);

  const handleNextOrComplete = useCallback(() => {
    if (isLastStep) {
      onComplete();
    } else {
      onNext();
    }
  }, [isLastStep, onComplete, onNext]);

  if (!isVisible || !currentStep || isMeasuring) {
    return null;
  }

  // Calculate tooltip position
  const getTooltipStyle = () => {
    if (isCenterStep || !targetLayout) {
      return {
        top: SCREEN_HEIGHT * 0.35,
        left: 20,
        right: 20,
      };
    }

    const padding = 16;
    const tooltipHeight = 220; // Approximate tooltip height (increased for safety)
    const spotlightPadding = 8; // Same as in getSpotlightCutout

    // The position in the step indicates WHERE the tooltip should appear relative to the element
    // 'bottom' = tooltip appears BELOW the element
    // 'top' = tooltip appears ABOVE the element
    if (currentStep.position === 'bottom') {
      // Show tooltip below the target
      return {
        top: targetLayout.y + targetLayout.height + spotlightPadding + padding,
        left: 20,
        right: 20,
      };
    } else if (currentStep.position === 'top') {
      // Show tooltip above the target
      const tooltipTop = targetLayout.y - spotlightPadding - tooltipHeight - padding;
      return {
        top: Math.max(60, tooltipTop), // Ensure it doesn't go above status bar
        left: 20,
        right: 20,
      };
    } else {
      // Auto-position based on element location
      const targetCenterY = targetLayout.y + targetLayout.height / 2;
      if (targetCenterY < SCREEN_HEIGHT / 2) {
        // Element is in top half, show tooltip below
        return {
          top: targetLayout.y + targetLayout.height + spotlightPadding + padding,
          left: 20,
          right: 20,
        };
      } else {
        // Element is in bottom half, show tooltip above
        return {
          top: Math.max(60, targetLayout.y - spotlightPadding - tooltipHeight - padding),
          left: 20,
          right: 20,
        };
      }
    }
  };

  // Calculate spotlight cutout
  const getSpotlightCutout = () => {
    if (!targetLayout || isCenterStep) return null;

    const padding = 8;
    return {
      x: targetLayout.x - padding,
      y: targetLayout.y - padding,
      width: targetLayout.width + padding * 2,
      height: targetLayout.height + padding * 2,
      borderRadius: 12,
    };
  };

  const spotlightCutout = getSpotlightCutout();
  const tooltipStyle = getTooltipStyle();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      {/* Dark overlay with cutout */}
      <View style={styles.overlayContainer} pointerEvents="box-none">
        {/* Top overlay */}
        {spotlightCutout && (
          <>
            <View
              style={[
                styles.overlaySection,
                {
                  top: 0,
                  left: 0,
                  right: 0,
                  height: spotlightCutout.y,
                },
              ]}
            />
            {/* Left overlay */}
            <View
              style={[
                styles.overlaySection,
                {
                  top: spotlightCutout.y,
                  left: 0,
                  width: spotlightCutout.x,
                  height: spotlightCutout.height,
                },
              ]}
            />
            {/* Right overlay */}
            <View
              style={[
                styles.overlaySection,
                {
                  top: spotlightCutout.y,
                  right: 0,
                  left: spotlightCutout.x + spotlightCutout.width,
                  height: spotlightCutout.height,
                },
              ]}
            />
            {/* Bottom overlay */}
            <View
              style={[
                styles.overlaySection,
                {
                  top: spotlightCutout.y + spotlightCutout.height,
                  left: 0,
                  right: 0,
                  bottom: 0,
                },
              ]}
            />
            {/* Spotlight border/glow */}
            <Animated.View
              style={[
                styles.spotlightBorder,
                {
                  top: spotlightCutout.y,
                  left: spotlightCutout.x,
                  width: spotlightCutout.width,
                  height: spotlightCutout.height,
                  borderRadius: spotlightCutout.borderRadius,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
          </>
        )}
        {/* Full overlay for center steps */}
        {isCenterStep && <View style={styles.fullOverlay} />}
      </View>

      {/* Tooltip card */}
      <Animated.View
        style={[
          styles.tooltip,
          tooltipStyle,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.progressDot,
                index === currentStepIndex && styles.progressDotActive,
                index < currentStepIndex && styles.progressDotCompleted,
              ]}
            />
          ))}
        </View>

        {/* Step counter */}
        <Text style={styles.stepCounter}>
          {currentStepIndex + 1} of {totalSteps}
        </Text>

        {/* Content */}
        <Text style={styles.title}>{currentStep.title}</Text>
        <Text style={styles.description}>{currentStep.description}</Text>

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          {/* Skip button */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={onSkip}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>

          {/* Navigation buttons */}
          <View style={styles.navButtons}>
            {!isFirstStep && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={onPrevious}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.nextButton}
              onPress={handleNextOrComplete}
              activeOpacity={0.8}
            >
              <Text style={styles.nextButtonText}>
                {isLastStep ? "Let's Go!" : 'Next'}
              </Text>
              {!isLastStep && (
                <Ionicons name="chevron-forward" size={18} color={COLORS.pureWhite} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlaySection: {
    position: 'absolute',
    backgroundColor: COLORS.overlay,
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
  },
  spotlightBorder: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: COLORS.secondary,
    backgroundColor: 'transparent',
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: COLORS.pureWhite,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  progressDotActive: {
    backgroundColor: COLORS.primary,
    width: 24,
  },
  progressDotCompleted: {
    backgroundColor: COLORS.secondary,
  },
  stepCounter: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  skipButtonText: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  navButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    gap: 4,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
});
