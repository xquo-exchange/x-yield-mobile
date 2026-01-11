/**
 * Analytics Context
 * Provides analytics initialization and app lifecycle tracking
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Application from 'expo-application';
import {
  initializeAnalytics,
  isAnalyticsReady,
  trackAppOpened,
  trackAppBackgrounded,
  trackSessionStarted,
  trackSessionEnded,
  flushAnalytics,
  identifyUser,
  setUserProperties,
  setSuperProperties,
} from '../services/analytics';

interface AnalyticsContextType {
  isReady: boolean;
  identifyUser: (walletAddress: string) => void;
  setUserProperties: (properties: Record<string, unknown>) => void;
  setSuperProperties: (properties: Record<string, unknown>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType>({
  isReady: false,
  identifyUser: () => {},
  setUserProperties: () => {},
  setSuperProperties: () => {},
});

export function useAnalyticsContext() {
  return useContext(AnalyticsContext);
}

interface AnalyticsProviderProps {
  children: React.ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const appState = useRef(AppState.currentState);
  const lastBackgroundTime = useRef<number>(0);
  const isFirstOpen = useRef(true);
  const sessionActive = useRef(false);

  // Initialize analytics on mount
  useEffect(() => {
    const init = async () => {
      await initializeAnalytics();
      setIsReady(isAnalyticsReady());

      // Track initial app open
      if (isFirstOpen.current) {
        trackAppOpened('cold');
        isFirstOpen.current = false;
        sessionActive.current = true;
      }
    };

    init();

    // Set device properties
    const setDeviceInfo = async () => {
      const deviceModel = Platform.OS === 'ios'
        ? 'iPhone'
        : 'Android';

      setUserProperties({
        device_model: deviceModel,
        platform: Platform.OS,
        os_version: Platform.Version,
        app_version: Application.nativeApplicationVersion || '1.0.0',
        build_number: Application.nativeBuildVersion || '1',
      });
    };

    setDeviceInfo();
  }, []);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        // App going to background
        lastBackgroundTime.current = Date.now();
        trackAppBackgrounded('unknown');

        // End session if going to background for more than 30 seconds
        // This will be handled when coming back to foreground

        // Flush events before going to background
        flushAnalytics();
      } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App coming to foreground
        const timeSinceBackground = lastBackgroundTime.current > 0
          ? Math.round((Date.now() - lastBackgroundTime.current) / 1000)
          : 0;

        // If more than 30 minutes in background, treat as new session
        if (timeSinceBackground > 1800) {
          if (sessionActive.current) {
            trackSessionEnded();
          }
          trackSessionStarted();
          trackAppOpened('cold', timeSinceBackground);
          sessionActive.current = true;
        } else if (timeSinceBackground > 0) {
          trackAppOpened('warm', timeSinceBackground);
        }
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
      // End session when provider unmounts
      if (sessionActive.current) {
        trackSessionEnded();
        flushAnalytics();
      }
    };
  }, []);

  const contextValue: AnalyticsContextType = {
    isReady,
    identifyUser: useCallback((walletAddress: string) => {
      identifyUser(walletAddress);
    }, []),
    setUserProperties: useCallback((properties: Record<string, unknown>) => {
      setUserProperties(properties);
    }, []),
    setSuperProperties: useCallback((properties: Record<string, unknown>) => {
      setSuperProperties(properties);
    }, []),
  };

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export default AnalyticsContext;
