/**
 * SplashScreen Component
 * Shows loading animation with timeout detection and retry functionality
 * Handles Android-specific UI freeze issues by providing user feedback
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Animated,
  Dimensions,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

const { width } = Dimensions.get('window');

// Timeout settings
const LOADING_TIMEOUT_MS = 15000; // 15 seconds before showing retry
const MIN_SPLASH_DURATION_MS = 1800; // Minimum splash duration

interface SplashScreenProps {
  onAnimationComplete: () => void;
  isLoading?: boolean; // External loading state
  loadingError?: string | null; // External error message
  onRetry?: () => void; // Retry callback
}

export default function SplashScreen({
  onAnimationComplete,
  isLoading = true,
  loadingError = null,
  onRetry,
}: SplashScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  const [showTimeout, setShowTimeout] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const minDurationRef = useRef<NodeJS.Timeout | null>(null);
  const minDurationPassed = useRef(false);
  const animationCompleted = useRef(false);

  // Use refs to track current prop values for use in callbacks (avoids stale closures)
  const isLoadingRef = useRef(isLoading);
  const loadingErrorRef = useRef(loadingError);

  // Keep refs in sync with props
  useEffect(() => {
    isLoadingRef.current = isLoading;
    loadingErrorRef.current = loadingError;
  }, [isLoading, loadingError]);

  // Complete animation - fade out and notify parent
  const completeAnimation = useCallback(() => {
    if (animationCompleted.current) return;
    animationCompleted.current = true;

    // Clear all timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (minDurationRef.current) {
      clearTimeout(minDurationRef.current);
      minDurationRef.current = null;
    }

    // Fade out
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      onAnimationComplete();
    });
  }, [fadeAnim, onAnimationComplete]);

  // Check if we can complete the splash - uses refs to avoid stale closures
  const checkAndComplete = useCallback(() => {
    const canComplete =
      minDurationPassed.current &&
      !isLoadingRef.current &&
      !animationCompleted.current &&
      !loadingErrorRef.current;

    if (canComplete) {
      completeAnimation();
    }
  }, [completeAnimation]);

  // Start entrance animation and set up timers
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Minimum splash duration timer
    minDurationRef.current = setTimeout(() => {
      minDurationPassed.current = true;
      checkAndComplete();
    }, MIN_SPLASH_DURATION_MS);

    // Set up loading timeout - only show if still loading after timeout
    timeoutRef.current = setTimeout(() => {
      // Double-check current loading state using ref (not stale closure)
      if (!animationCompleted.current && isLoadingRef.current) {
        setShowTimeout(true);
      }
    }, LOADING_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (minDurationRef.current) {
        clearTimeout(minDurationRef.current);
      }
    };
  }, [checkAndComplete]);

  // Spinner animation
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    spin.start();

    return () => spin.stop();
  }, [spinAnim]);

  // Update loading status
  useEffect(() => {
    const statusMessages = [
      'Initializing...',
      'Connecting securely...',
      'Loading wallet...',
      'Almost ready...',
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (!showTimeout && !loadingError) {
        index = (index + 1) % statusMessages.length;
        setLoadingStatus(statusMessages[index]);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [showTimeout, loadingError]);

  // Check if loading is complete whenever props change
  useEffect(() => {
    if (!isLoading && !loadingError) {
      checkAndComplete();
    }
  }, [isLoading, loadingError, checkAndComplete]);

  const handleRetry = useCallback(() => {
    setShowTimeout(false);
    setLoadingStatus('Retrying...');
    animationCompleted.current = false;

    // Reset timeout - use ref for loading check
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      if (!animationCompleted.current && isLoadingRef.current) {
        setShowTimeout(true);
      }
    }, LOADING_TIMEOUT_MS);

    // Call external retry handler
    onRetry?.();
  }, [onRetry]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const hasError = loadingError || showTimeout;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Animated.Image
        source={require('../../assets/logo_full.png')}
        style={[
          styles.logo,
          { transform: [{ scale: scaleAnim }] },
        ]}
        resizeMode="contain"
      />

      {/* Loading indicator or error state */}
      <View style={styles.statusContainer}>
        {!hasError ? (
          <>
            <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </Animated.View>
            <Text style={styles.statusText}>{loadingStatus}</Text>
          </>
        ) : (
          <View style={styles.errorContainer}>
            <Ionicons
              name={loadingError ? 'alert-circle-outline' : 'time-outline'}
              size={40}
              color={loadingError ? COLORS.error : COLORS.grey}
            />
            <Text style={styles.errorTitle}>
              {loadingError ? 'Connection Error' : 'Taking too long?'}
            </Text>
            <Text style={styles.errorText}>
              {loadingError ||
                'The app is having trouble loading. This might be a network issue.'}
            </Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetry}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={18} color={COLORS.pureWhite} />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>

            {Platform.OS === 'android' && (
              <Text style={styles.hintText}>
                If this persists, try force-closing and reopening the app
              </Text>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.black,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  logo: {
    width: width * 0.5,
    height: 60,
    marginBottom: 48,
  },
  statusContainer: {
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  statusText: {
    marginTop: 16,
    fontSize: 14,
    color: COLORS.grey,
    textAlign: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.pureWhite,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.grey,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  hintText: {
    marginTop: 16,
    fontSize: 12,
    color: COLORS.grey,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
