/**
 * useNotificationPermission Hook
 *
 * Manages one-time push notification permission request after login.
 * - Only prompts once per device (tracked via AsyncStorage)
 * - Shows prompt only after successful authentication
 * - Handles user denial gracefully
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { savePushToken } from '../services/supabase';

// Storage key for tracking if permission was already requested
const PERMISSION_REQUESTED_KEY = '@notifications/permission_requested';

// Expo project ID from app.json
const EXPO_PROJECT_ID = 'eadf7b92-bd0e-42ee-9b18-de38d5da45eb';

export type PermissionStatus = 'undetermined' | 'granted' | 'denied' | 'not_requested';

export interface UseNotificationPermissionResult {
  /** Current permission status */
  permissionStatus: PermissionStatus;
  /** Whether the permission prompt has been shown before */
  hasPromptedBefore: boolean;
  /** Whether we're currently checking/requesting permission */
  isLoading: boolean;
  /** The Expo Push Token (if permission granted) */
  expoPushToken: string | null;
  /** Trigger the permission request flow */
  requestPermission: () => Promise<boolean>;
  /** Check if we should show a "enable notifications" prompt in settings */
  shouldShowSettingsPrompt: boolean;
  /** Open device notification settings */
  openNotificationSettings: () => Promise<void>;
}

export function useNotificationPermission(): UseNotificationPermissionResult {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [hasPromptedBefore, setHasPromptedBefore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);

  // Prevent multiple simultaneous permission requests
  const isRequestingRef = useRef(false);

  /**
   * Check if device can receive push notifications
   */
  const canReceivePushNotifications = useCallback((): boolean => {
    if (!Device.isDevice) {
      console.log('[NotificationPermission] Push notifications require a physical device');
      return false;
    }
    return true;
  }, []);

  /**
   * Get current system permission status
   */
  const getSystemPermissionStatus = useCallback(async (): Promise<PermissionStatus> => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') return 'granted';
      if (status === 'denied') return 'denied';
      return 'undetermined';
    } catch (error) {
      console.error('[NotificationPermission] Error getting permission status:', error);
      return 'undetermined';
    }
  }, []);

  /**
   * Check if we've already prompted the user before
   */
  const checkIfPromptedBefore = useCallback(async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(PERMISSION_REQUESTED_KEY);
      return value === 'true';
    } catch (error) {
      console.error('[NotificationPermission] Error checking prompt history:', error);
      return false;
    }
  }, []);

  /**
   * Mark that we've prompted the user
   */
  const markAsPrompted = useCallback(async (): Promise<void> => {
    try {
      await AsyncStorage.setItem(PERMISSION_REQUESTED_KEY, 'true');
      setHasPromptedBefore(true);
    } catch (error) {
      console.error('[NotificationPermission] Error saving prompt history:', error);
    }
  }, []);

  /**
   * Get Expo Push Token
   */
  const getExpoPushToken = useCallback(async (): Promise<string | null> => {
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      });
      const token = tokenData.data;
      console.log('[NotificationPermission] Expo Push Token:', token);
      return token;
    } catch (error) {
      console.error('[NotificationPermission] Error getting Expo push token:', error);
      return null;
    }
  }, []);

  /**
   * Setup Android notification channel (required for Android 8+)
   */
  const setupAndroidChannel = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#200191',
        sound: 'default',
      });
    }
  }, []);

  /**
   * Request notification permission
   * Returns true if granted, false otherwise
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    // Prevent multiple simultaneous requests
    if (isRequestingRef.current) {
      console.log('[NotificationPermission] Permission request already in progress');
      return false;
    }

    isRequestingRef.current = true;
    setIsLoading(true);

    try {
      // Check device capability
      if (!canReceivePushNotifications()) {
        console.log('[NotificationPermission] Device cannot receive push notifications');
        setIsLoading(false);
        isRequestingRef.current = false;
        return false;
      }

      // Check current permission status
      const currentStatus = await getSystemPermissionStatus();

      // If already granted, just get the token
      if (currentStatus === 'granted') {
        await setupAndroidChannel();
        const token = await getExpoPushToken();
        setExpoPushToken(token);
        setPermissionStatus('granted');
        setIsLoading(false);
        isRequestingRef.current = false;
        return true;
      }

      // If already denied, we can't request again on iOS
      // On Android we might be able to, but better to direct to settings
      if (currentStatus === 'denied') {
        console.log('[NotificationPermission] Permission previously denied');
        setPermissionStatus('denied');
        await markAsPrompted();
        setIsLoading(false);
        isRequestingRef.current = false;
        return false;
      }

      // Request permission
      const { status } = await Notifications.requestPermissionsAsync();

      // Mark as prompted (regardless of result)
      await markAsPrompted();

      if (status === 'granted') {
        console.log('[NotificationPermission] Permission granted');
        await setupAndroidChannel();
        const token = await getExpoPushToken();
        setExpoPushToken(token);
        setPermissionStatus('granted');
        setIsLoading(false);
        isRequestingRef.current = false;
        return true;
      } else {
        console.log('[NotificationPermission] Permission denied by user');
        setPermissionStatus('denied');
        setIsLoading(false);
        isRequestingRef.current = false;
        return false;
      }
    } catch (error) {
      console.error('[NotificationPermission] Error requesting permission:', error);
      setIsLoading(false);
      isRequestingRef.current = false;
      return false;
    }
  }, [canReceivePushNotifications, getSystemPermissionStatus, setupAndroidChannel, getExpoPushToken, markAsPrompted]);

  /**
   * Open device notification settings
   */
  const openNotificationSettings = useCallback(async (): Promise<void> => {
    try {
      const { Linking } = require('react-native');
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else {
        await Linking.openSettings();
      }
    } catch (error) {
      console.error('[NotificationPermission] Error opening settings:', error);
      Alert.alert(
        'Unable to open settings',
        'Please go to your device settings to enable notifications for this app.'
      );
    }
  }, []);

  /**
   * Initialize - check current state on mount
   */
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);

      try {
        // Check if we've prompted before
        const prompted = await checkIfPromptedBefore();
        setHasPromptedBefore(prompted);

        // Get current system permission status
        const status = await getSystemPermissionStatus();
        setPermissionStatus(status);

        // If already granted, get the token
        if (status === 'granted') {
          await setupAndroidChannel();
          const token = await getExpoPushToken();
          setExpoPushToken(token);
        }
      } catch (error) {
        console.error('[NotificationPermission] Error during initialization:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [checkIfPromptedBefore, getSystemPermissionStatus, setupAndroidChannel, getExpoPushToken]);

  // Determine if we should show a settings prompt
  // (user denied permission but might want to enable later)
  const shouldShowSettingsPrompt = hasPromptedBefore && permissionStatus === 'denied';

  return {
    permissionStatus,
    hasPromptedBefore,
    isLoading,
    expoPushToken,
    requestPermission,
    shouldShowSettingsPrompt,
    openNotificationSettings,
  };
}

/**
 * Hook to automatically request notification permission after login
 * Use this in a post-login component (e.g., DashboardScreen)
 *
 * @param isAuthenticated - Whether the user is currently authenticated
 * @param walletAddress - The user's wallet address (required for saving push token to Supabase)
 * @param onPermissionResult - Optional callback when permission result is known
 */
export function usePostLoginNotificationPrompt(
  isAuthenticated: boolean,
  walletAddress?: string | null,
  onPermissionResult?: (granted: boolean, token: string | null) => void
): {
  isPrompting: boolean;
  permissionStatus: PermissionStatus;
  expoPushToken: string | null;
  isSavingToken: boolean;
} {
  const {
    permissionStatus,
    hasPromptedBefore,
    isLoading,
    expoPushToken,
    requestPermission,
  } = useNotificationPermission();

  const [isPrompting, setIsPrompting] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const hasTriggeredPromptRef = useRef(false);
  const hasSavedTokenRef = useRef(false);

  // Save push token to Supabase when we have both token and wallet address
  useEffect(() => {
    const saveTokenToSupabase = async () => {
      if (
        expoPushToken &&
        walletAddress &&
        !hasSavedTokenRef.current &&
        permissionStatus === 'granted'
      ) {
        hasSavedTokenRef.current = true;
        setIsSavingToken(true);

        try {
          const result = await savePushToken(walletAddress, expoPushToken);
          if (result.success) {
            console.log('[NotificationPermission] Push token saved to Supabase');
          } else {
            console.error('[NotificationPermission] Failed to save push token:', result.error);
            // Reset flag to allow retry
            hasSavedTokenRef.current = false;
          }
        } catch (error) {
          console.error('[NotificationPermission] Error saving push token to Supabase:', error);
          // Reset flag to allow retry
          hasSavedTokenRef.current = false;
        } finally {
          setIsSavingToken(false);
        }
      }
    };

    saveTokenToSupabase();
  }, [expoPushToken, walletAddress, permissionStatus]);

  useEffect(() => {
    const triggerPrompt = async () => {
      // Only prompt if:
      // 1. User is authenticated
      // 2. We've finished loading the initial state
      // 3. We haven't prompted before
      // 4. Permission status is undetermined
      // 5. We haven't already triggered this prompt in this session
      if (
        isAuthenticated &&
        !isLoading &&
        !hasPromptedBefore &&
        permissionStatus === 'undetermined' &&
        !hasTriggeredPromptRef.current
      ) {
        hasTriggeredPromptRef.current = true;
        setIsPrompting(true);

        // Small delay to let the screen settle after login
        await new Promise(resolve => setTimeout(resolve, 1000));

        const granted = await requestPermission();

        setIsPrompting(false);

        if (onPermissionResult) {
          onPermissionResult(granted, granted ? expoPushToken : null);
        }
      }
    };

    triggerPrompt();
  }, [
    isAuthenticated,
    isLoading,
    hasPromptedBefore,
    permissionStatus,
    requestPermission,
    expoPushToken,
    onPermissionResult,
  ]);

  return {
    isPrompting,
    permissionStatus,
    expoPushToken,
    isSavingToken,
  };
}
