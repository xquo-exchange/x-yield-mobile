/**
 * TrackedScreen Component
 * A wrapper that automatically tracks screen views, time spent, and exit
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { View, ViewProps, AppState, AppStateStatus } from 'react-native';
import {
  trackScreenView,
  trackScreenExit,
  trackScreenLoadTime,
  trackTimeOnScreen,
  trackAppBackgrounded,
} from '../services/analytics';

interface TrackedScreenProps extends ViewProps {
  /** Name of the screen for analytics (required) */
  screenName: string;
  /** Track screen load time */
  trackLoadTime?: boolean;
  /** Callback when screen becomes active */
  onScreenActive?: () => void;
  /** Callback when screen becomes inactive */
  onScreenInactive?: () => void;
}

const TrackedScreen: React.FC<TrackedScreenProps> = ({
  screenName,
  trackLoadTime = true,
  onScreenActive,
  onScreenInactive,
  children,
  style,
  ...props
}) => {
  const mountTime = useRef<number>(Date.now());
  const screenEnterTime = useRef<number>(Date.now());
  const hasTrackedView = useRef(false);
  const appState = useRef(AppState.currentState);

  // Track screen view on mount
  useEffect(() => {
    if (!hasTrackedView.current) {
      mountTime.current = Date.now();
      screenEnterTime.current = Date.now();

      // Track screen view
      trackScreenView(screenName);
      hasTrackedView.current = true;

      // Track load time if enabled
      if (trackLoadTime) {
        // Use requestAnimationFrame to measure time to first render
        requestAnimationFrame(() => {
          const loadTime = Date.now() - mountTime.current;
          trackScreenLoadTime(screenName, loadTime);
        });
      }

      onScreenActive?.();
    }

    return () => {
      // Track screen exit and time spent
      if (hasTrackedView.current) {
        const timeSpent = Math.round((Date.now() - screenEnterTime.current) / 1000);
        trackScreenExit(screenName);
        trackTimeOnScreen(screenName, timeSpent);
        hasTrackedView.current = false;
        onScreenInactive?.();
      }
    };
  }, [screenName, trackLoadTime, onScreenActive, onScreenInactive]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        // App going to background
        trackAppBackgrounded(screenName);
        onScreenInactive?.();
      } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App coming to foreground
        screenEnterTime.current = Date.now();
        trackScreenView(screenName);
        onScreenActive?.();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [screenName, onScreenActive, onScreenInactive]);

  return (
    <View style={[{ flex: 1 }, style]} {...props}>
      {children}
    </View>
  );
};

export default TrackedScreen;

/**
 * Higher-order component for tracking screens
 * Wrap your screen component to auto-track
 */
export function withScreenTracking<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  screenName: string
): React.FC<P> {
  return function TrackedScreenWrapper(props: P) {
    return (
      <TrackedScreen screenName={screenName}>
        <WrappedComponent {...props} />
      </TrackedScreen>
    );
  };
}
