/**
 * Notification Service
 * Handles push notification registration and API calls
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { savePushToken as savePushTokenToSupabase, deletePushToken as deletePushTokenFromSupabase } from './supabase';

const API_BASE_URL = 'https://x-yield-api.vercel.app';
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
 * Register push token with backend
 */
export const registerPushToken = async (
  registration: DeviceRegistration
): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/notifications/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expo_push_token: registration.expoPushToken,
        device_id: registration.deviceId,
        platform: registration.platform,
        wallet_address: registration.walletAddress,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || 'Failed to register token' };
    }

    // Save locally
    await savePushToken(registration.expoPushToken);

    // Also save to Supabase for external notification services
    const supabaseResult = await savePushTokenToSupabase(
      registration.walletAddress,
      registration.expoPushToken
    );
    if (!supabaseResult.success) {
      console.warn('[Notifications] Failed to save token to Supabase:', supabaseResult.error);
      // Don't fail the registration - the backend registration succeeded
    }

    return { success: true };
  } catch (error) {
    console.error('Error registering push token:', error);
    return { success: false, error: 'Network error' };
  }
};

/**
 * Unregister push token from backend
 */
export const unregisterPushToken = async (
  walletAddress: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const deviceId = await getDeviceId();

    const response = await fetch(`${API_BASE_URL}/api/notifications/unregister`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: deviceId,
        wallet_address: walletAddress,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || 'Failed to unregister token' };
    }

    // Remove locally
    await removePushToken();

    // Also remove from Supabase
    const supabaseResult = await deletePushTokenFromSupabase(walletAddress);
    if (!supabaseResult.success) {
      console.warn('[Notifications] Failed to delete token from Supabase:', supabaseResult.error);
      // Don't fail - the backend unregistration succeeded
    }

    return { success: true };
  } catch (error) {
    console.error('Error unregistering push token:', error);
    return { success: false, error: 'Network error' };
  }
};

/**
 * Update notification preferences on backend
 */
export const updatePreferencesOnServer = async (
  walletAddress: string,
  preferences: NotificationPreferences
): Promise<{ success: boolean; error?: string }> => {
  try {
    const deviceId = await getDeviceId();

    const response = await fetch(`${API_BASE_URL}/api/notifications/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: deviceId,
        wallet_address: walletAddress,
        notifications_enabled: preferences.enabled,
        deposit_notifications: preferences.deposits,
        withdrawal_notifications: preferences.withdrawals,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || 'Failed to update preferences' };
    }

    await savePreferences(preferences);
    return { success: true };
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return { success: false, error: 'Network error' };
  }
};
