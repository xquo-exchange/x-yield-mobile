/**
 * NotificationContext
 * Provides global notification state and functions throughout the app
 */

import React, { createContext, useContext, useEffect, useCallback, ReactNode } from 'react';
import { useNotifications, UseNotificationsReturn } from '../hooks/useNotifications';

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

  const isRegistered = Boolean(notifications.expoPushToken);

  // Auto-register when user logs in with a wallet
  useEffect(() => {
    const autoRegister = async () => {
      if (
        isAuthenticated &&
        walletAddress &&
        !notifications.isLoading &&
        !isRegistered &&
        notifications.preferences.enabled
      ) {
        // Only auto-register if we haven't already and permissions might be granted
        if (notifications.permissionStatus !== 'denied') {
          console.log('Auto-registering for push notifications...');
          await notifications.registerForPushNotifications(walletAddress);
        }
      }
    };

    autoRegister();
  }, [isAuthenticated, walletAddress, notifications.isLoading, isRegistered]);

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
