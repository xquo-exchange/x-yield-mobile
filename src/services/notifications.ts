/**
 * Notification Service
 * Handles push notification registration with Supabase
 * and local transaction notifications
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { savePushToken as savePushTokenToSupabase, deletePushToken as deletePushTokenFromSupabase } from './supabase';

const STORAGE_KEYS = {
  PUSH_TOKEN: '@notifications/push_token',
  PREFERENCES: '@notifications/preferences',
  DEVICE_ID: '@notifications/device_id',
};

export interface NotificationPreferences {
  enabled: boolean;
  deposits: boolean;
  withdrawals: boolean;
}

export interface DeviceRegistration {
  expoPushToken: string;
  deviceId: string;
  platform: 'ios' | 'android';
  walletAddress: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  deposits: true,
  withdrawals: true,
};

/**
 * Generate a unique device ID
 */
export const generateDeviceId = (): string => {
  return `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Get or create device ID
 */
export const getDeviceId = async (): Promise<string> => {
  try {
    let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = generateDeviceId();
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    }
    return deviceId;
  } catch (error) {
    console.error('Error getting device ID:', error);
    return generateDeviceId();
  }
};

/**
 * Save push token locally
 */
export const savePushToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PUSH_TOKEN, token);
  } catch (error) {
    console.error('Error saving push token:', error);
  }
};

/**
 * Get saved push token
 */
export const getSavedPushToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.PUSH_TOKEN);
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
};

/**
 * Remove saved push token
 */
export const removePushToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.PUSH_TOKEN);
  } catch (error) {
    console.error('Error removing push token:', error);
  }
};

/**
 * Save notification preferences locally
 */
export const savePreferences = async (preferences: NotificationPreferences): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
  } catch (error) {
    console.error('Error saving notification preferences:', error);
  }
};

/**
 * Load notification preferences
 */
export const loadPreferences = async (): Promise<NotificationPreferences> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES);
    if (data) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(data) };
    }
    return DEFAULT_PREFERENCES;
  } catch (error) {
    console.error('Error loading notification preferences:', error);
    return DEFAULT_PREFERENCES;
  }
};

/**
 * Register push token with Supabase
 */
export const registerPushToken = async (
  registration: DeviceRegistration
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Save to Supabase
    const supabaseResult = await savePushTokenToSupabase(
      registration.walletAddress,
      registration.expoPushToken
    );

    if (!supabaseResult.success) {
      console.error('[Notifications] Failed to save token to Supabase:', supabaseResult.error);
      return { success: false, error: supabaseResult.error || 'Failed to register token' };
    }

    // Save locally
    await savePushToken(registration.expoPushToken);

    return { success: true };
  } catch (error) {
    console.error('[Notifications] Error registering push token:', error);
    return { success: false, error: 'Network error' };
  }
};

/**
 * Unregister push token from Supabase
 */
export const unregisterPushToken = async (
  walletAddress: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Remove from Supabase
    const supabaseResult = await deletePushTokenFromSupabase(walletAddress);
    if (!supabaseResult.success) {
      console.error('[Notifications] Failed to delete token from Supabase:', supabaseResult.error);
      return { success: false, error: supabaseResult.error || 'Failed to unregister token' };
    }

    // Remove locally
    await removePushToken();

    return { success: true };
  } catch (error) {
    console.error('[Notifications] Error unregistering push token:', error);
    return { success: false, error: 'Network error' };
  }
};

/**
 * Update notification preferences (local only)
 */
export const updatePreferencesOnServer = async (
  _walletAddress: string,
  preferences: NotificationPreferences
): Promise<{ success: boolean; error?: string }> => {
  try {
    await savePreferences(preferences);
    return { success: true };
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return { success: false, error: 'Failed to save preferences' };
  }
};

export type TransactionType = 'deposit' | 'withdrawal';

export interface TransactionNotificationParams {
  type: TransactionType;
  amount: string;
  txHash: string;
}

/**
 * Send a local notification for a completed transaction
 * Respects user preferences for deposits/withdrawals
 */
export const sendTransactionNotification = async (
  params: TransactionNotificationParams
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { type, amount, txHash } = params;

    // Load user preferences
    const preferences = await loadPreferences();

    // Check if notifications are enabled globally
    if (!preferences.enabled) {
      return { success: false, error: 'Notifications disabled' };
    }

    // Check type-specific preference
    if (type === 'deposit' && !preferences.deposits) {
      return { success: false, error: 'Deposit notifications disabled' };
    }

    if (type === 'withdrawal' && !preferences.withdrawals) {
      return { success: false, error: 'Withdrawal notifications disabled' };
    }

    // Build notification content based on type
    const isDeposit = type === 'deposit';
    const title = isDeposit ? 'Added to Savings! 🎉' : 'Withdrawal Complete! 💸';
    const body = isDeposit
      ? `Your $${amount} USDC has been added to Savings and is now earning yield.`
      : `Your withdrawal of $${amount} USDC has been processed successfully.`;

    // Schedule immediate local notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type,
          amount,
          txHash,
        },
        sound: 'default',
        categoryIdentifier: 'transactions',
      },
      trigger: null, // null trigger = immediate delivery
    });

    return { success: true };
  } catch (error) {
    console.error('[Notifications] Error sending transaction notification:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send notification',
    };
  }
};
