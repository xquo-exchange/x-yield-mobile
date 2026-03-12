/**
 * Secure Storage Service
 *
 * Wraps expo-secure-store for sensitive data (push tokens, deposit records).
 * Provides backward-compatible migration from AsyncStorage on first read.
 *
 * Note: expo-secure-store has a ~2KB per-value limit on iOS.
 * Large caches (transaction history, CDP transfers) remain in AsyncStorage
 * since they are derived/cacheable data, not secrets.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBUG = __DEV__ ?? false;
const debugLog = (message: string, ...args: unknown[]) => {
  if (DEBUG) console.log(message, ...args);
};

/**
 * Get a value from SecureStore, with automatic migration from AsyncStorage.
 * On first read after upgrade, checks AsyncStorage for legacy data,
 * migrates it to SecureStore, then deletes the AsyncStorage copy.
 */
export async function getSecureItem(key: string): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value !== null) return value;

    // Migration: check AsyncStorage for legacy data
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue !== null) {
      debugLog(`[SecureStorage] Migrating '${key}' from AsyncStorage to SecureStore`);
      await SecureStore.setItemAsync(key, legacyValue);
      await AsyncStorage.removeItem(key);
      return legacyValue;
    }

    return null;
  } catch (error) {
    debugLog('[SecureStorage] getSecureItem failed:', error);
    // Fallback to AsyncStorage if SecureStore fails (e.g. simulator issues)
    return AsyncStorage.getItem(key);
  }
}

/**
 * Save a value to SecureStore.
 * Also cleans up any legacy AsyncStorage copy.
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
    // Clean up legacy AsyncStorage if it exists
    await AsyncStorage.removeItem(key).catch(() => {});
  } catch (error) {
    debugLog('[SecureStorage] setSecureItem failed, falling back to AsyncStorage:', error);
    await AsyncStorage.setItem(key, value);
  }
}

/**
 * Remove a value from both SecureStore and AsyncStorage.
 */
export async function removeSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore - might not exist
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Ignore - might not exist
  }
}
