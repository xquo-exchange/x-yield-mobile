/**
 * useNotifications Hook
 * Manages push notification registration, permissions, and handling
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import {
  getDeviceId,
  registerPushToken,
  unregisterPushToken,
  loadPreferences,
  savePreferences,
  updatePreferencesOnServer,
  getSavedPushToken,
  NotificationPreferences,
} from '../services/notifications';

// Expo project ID from app.json
const EXPO_PROJECT_ID = 'eadf7b92-bd0e-42ee-9b18-de38d5da45eb';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationState {
  isLoading: boolean;
  expoPushToken: string | null;
  permissionStatus: Notifications.PermissionStatus | null;
  preferences: NotificationPreferences;
  error: string | null;
}

export interface UseNotificationsReturn extends NotificationState {
  requestPermissions: () => Promise<boolean>;
  registerForPushNotifications: (walletAddress: string) => Promise<boolean>;
  unregisterFromPushNotifications: (walletAddress: string) => Promise<boolean>;
  updatePreferences: (walletAddress: string, preferences: NotificationPreferences) => Promise<boolean>;
  openSettings: () => Promise<void>;
  refreshPermissionStatus: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [state, setState] = useState<NotificationState>({
    isLoading: true,
    expoPushToken: null,
    permissionStatus: null,
    preferences: {
      enabled: true,
      deposits: true,
      withdrawals: true,
    },
    error: null,
  });

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const appState = useRef(AppState.currentState);

  // Check if device can receive push notifications
  const canReceivePushNotifications = useCallback((): boolean => {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return false;
    }
    return true;
  }, []);

  // Setup Android notification channel
  const setupAndroidChannel = useCallback(async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#200191',
        sound: 'default',
      });

      // Channel for transaction notifications
      await Notifications.setNotificationChannelAsync('transactions', {
        name: 'Transactions',
        description: 'Notifications for deposits and withdrawals',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#22c55e',
        sound: 'default',
      });
    }
  }, []);

  // Get current permission status
  const getPermissionStatus = useCallback(async (): Promise<Notifications.PermissionStatus> => {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  }, []);

  // Refresh permission status (useful after returning from settings)
  const refreshPermissionStatus = useCallback(async () => {
    const status = await getPermissionStatus();
    setState(prev => ({ ...prev, permissionStatus: status }));
  }, [getPermissionStatus]);

  // Request notification permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!canReceivePushNotifications()) {
      setState(prev => ({
        ...prev,
        error: 'Push notifications require a physical device'
      }));
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();

      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      setState(prev => ({ ...prev, permissionStatus: finalStatus, error: null }));

      return finalStatus === 'granted';
    } catch (error) {
      console.error('Error requesting permissions:', error);
      setState(prev => ({ ...prev, error: 'Failed to request permissions' }));
      return false;
    }
  }, [canReceivePushNotifications]);

  // Get Expo push token
  const getExpoPushToken = useCallback(async (): Promise<string | null> => {
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      });
      return tokenData.data;
    } catch (error) {
      console.error('Error getting Expo push token:', error);
      return null;
    }
  }, []);

  // Register for push notifications
  const registerForPushNotifications = useCallback(async (walletAddress: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Check device capability
      if (!canReceivePushNotifications()) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Push notifications require a physical device'
        }));
        return false;
      }

      // Request permissions
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Notification permission denied'
        }));
        return false;
      }

      // Setup Android channel
      await setupAndroidChannel();

      // Get push token
      const token = await getExpoPushToken();
      if (!token) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to get push token'
        }));
        return false;
      }

      // Get device ID
      const deviceId = await getDeviceId();

      // Register with backend
      const result = await registerPushToken({
        expoPushToken: token,
        deviceId,
        platform: Platform.OS as 'ios' | 'android',
        walletAddress,
      });

      if (!result.success) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Failed to register token'
        }));
        return false;
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        expoPushToken: token,
        error: null
      }));

      return true;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to register for notifications'
      }));
      return false;
    }
  }, [canReceivePushNotifications, requestPermissions, setupAndroidChannel, getExpoPushToken]);

  // Unregister from push notifications
  const unregisterFromPushNotifications = useCallback(async (walletAddress: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await unregisterPushToken(walletAddress);

      if (!result.success) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Failed to unregister token'
        }));
        return false;
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        expoPushToken: null,
        error: null
      }));

      return true;
    } catch (error) {
      console.error('Error unregistering from push notifications:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to unregister from notifications'
      }));
      return false;
    }
  }, []);

  // Update notification preferences
  const updatePreferences = useCallback(async (
    walletAddress: string,
    preferences: NotificationPreferences
  ): Promise<boolean> => {
    try {
      // Save locally first for immediate UI update
      await savePreferences(preferences);
      setState(prev => ({ ...prev, preferences }));

      // Sync with backend
      const result = await updatePreferencesOnServer(walletAddress, preferences);

      if (!result.success) {
        console.warn('Failed to sync preferences with server:', result.error);
        // Still return true since local save succeeded
      }

      return true;
    } catch (error) {
      console.error('Error updating preferences:', error);
      return false;
    }
  }, []);

  // Open system settings for the app
  const openSettings = useCallback(async () => {
    // Use Linking to open app settings since openSettingsAsync may not be available
    const { Linking } = require('react-native');
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    } else {
      await Linking.openSettings();
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        // Load saved preferences
        const savedPreferences = await loadPreferences();

        // Get current permission status
        const status = await getPermissionStatus();

        // Load saved push token to restore registration state
        const savedToken = await getSavedPushToken();

        // Setup Android channel if permissions granted
        if (status === 'granted') {
          await setupAndroidChannel();
        }

        // Clear badge on app launch (cold start)
        await Notifications.setBadgeCountAsync(0);
        await Notifications.dismissAllNotificationsAsync();

        setState(prev => ({
          ...prev,
          isLoading: false,
          permissionStatus: status,
          preferences: savedPreferences,
          expoPushToken: savedToken,
        }));
      } catch (error) {
        console.error('Error initializing notifications:', error);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    initialize();
  }, [getPermissionStatus, setupAndroidChannel]);

  // Setup notification listeners
  useEffect(() => {
    // Listener for notifications received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Notification received - handled by system
    });

    // Listener for when user taps on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      // Handle navigation based on notification data
      // Navigation will be handled by the app through deep linking or context
      void data; // Acknowledge data for future navigation handling
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  // Clear badge and refresh permission status when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to foreground
        // Clear badge count when user opens the app
        Notifications.setBadgeCountAsync(0).catch(() => {
          // Silent fail - badge clearing is non-critical
        });

        // Dismiss all delivered notifications from notification center
        Notifications.dismissAllNotificationsAsync().catch(() => {
          // Silent fail - dismissing notifications is non-critical
        });

        // Refresh permission status
        refreshPermissionStatus();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [refreshPermissionStatus]);

  return {
    ...state,
    requestPermissions,
    registerForPushNotifications,
    unregisterFromPushNotifications,
    updatePreferences,
    openSettings,
    refreshPermissionStatus,
  };
}
