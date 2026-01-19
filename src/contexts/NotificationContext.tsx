/**
 * NotificationContext
 * Provides global notification state and functions throughout the app
 */

import React, { createContext, useContext, useEffect, useCallback, ReactNode, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications, UseNotificationsReturn } from '../hooks/useNotifications';

// Storage key for tracking if permission was already requested
const PERMISSION_REQUESTED_KEY = '@notifications/permission_requested';

interface NotificationContextValue extends UseNotificationsReturn {
  isRegistered: boolean;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface NotificationProviderProps {
  children: ReactNode;
  walletAddress?: string;
  isAuthenticated: boolean;
}

export function NotificationProvider({
  children,
  walletAddress,
  isAuthenticated,
}: NotificationProviderProps) {
  const notifications = useNotifications();
  const hasAttemptedAutoRegister = useRef(false);
  const [hasPromptedBefore, setHasPromptedBefore] = useState<boolean | null>(null);

  const isRegistered = Boolean(notifications.expoPushToken);

  // Check if we've already prompted the user before (on mount)
  useEffect(() => {
    const checkPromptHistory = async () => {
      try {
        const value = await AsyncStorage.getItem(PERMISSION_REQUESTED_KEY);
        setHasPromptedBefore(value === 'true');
      } catch (error) {
        console.error('[NotificationContext] Error checking prompt history:', error);
        setHasPromptedBefore(false);
      }
    };
    checkPromptHistory();
  }, []);

  // Auto-register when user logs in with a wallet (only once per session, only if never prompted)
  useEffect(() => {
    const autoRegister = async () => {
      // Wait until we know the prompt history
      if (hasPromptedBefore === null) return;

      // Skip if we've already prompted before
      if (hasPromptedBefore) {
        console.log('[NotificationContext] Already prompted before, skipping auto-register');
        return;
      }

      // Skip if already attempted in this session
      if (hasAttemptedAutoRegister.current) return;

      if (
        isAuthenticated &&
        walletAddress &&
        !notifications.isLoading &&
        !isRegistered &&
        notifications.preferences.enabled
      ) {
        // Only auto-register if permissions might be granted
        if (notifications.permissionStatus !== 'denied') {
          hasAttemptedAutoRegister.current = true;
          console.log('[NotificationContext] Auto-registering for push notifications...');

          // Mark as prompted BEFORE requesting (to prevent loops)
          await AsyncStorage.setItem(PERMISSION_REQUESTED_KEY, 'true');
          setHasPromptedBefore(true);

          const success = await notifications.registerForPushNotifications(walletAddress);

          if (success) {
            console.log('[NotificationContext] Push notifications registered successfully');
          } else {
            console.log('[NotificationContext] Push notifications registration failed or denied');
          }
        }
      }
    };

    autoRegister();
  }, [isAuthenticated, walletAddress, notifications.isLoading, isRegistered, hasPromptedBefore, notifications.permissionStatus, notifications.preferences.enabled]);

  // Unregister when user logs out
  const handleLogout = useCallback(async () => {
    if (walletAddress && isRegistered) {
      await notifications.unregisterFromPushNotifications(walletAddress);
    }
  }, [walletAddress, isRegistered, notifications.unregisterFromPushNotifications]);

  const contextValue: NotificationContextValue = {
    ...notifications,
    isRegistered,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
}

// Export a hook for logout handling
export function useNotificationLogout() {
  const context = useContext(NotificationContext);

  const handleLogout = useCallback(async (walletAddress?: string) => {
    if (context && walletAddress && context.isRegistered) {
      await context.unregisterFromPushNotifications(walletAddress);
    }
  }, [context]);

  return handleLogout;
}
