/**
 * Supabase Client Configuration
 *
 * Provides a configured Supabase client for interacting with the backend.
 * Used primarily for push notification token management.
 */

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Supabase configuration from app.json extra
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl ?? '';
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey ?? '';

// Create and export the Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Database types for push_tokens table
export interface PushToken {
  id: string;
  wallet_address: string;
  expo_push_token: string;
  created_at: string;
  updated_at: string;
}

export type PushTokenInsert = Omit<PushToken, 'id' | 'created_at' | 'updated_at'>;

/**
 * Save or update a push token for a wallet address
 *
 * @param walletAddress - The user's wallet address
 * @param expoPushToken - The Expo push token to save
 * @returns Object with success status and optional error message
 */
export async function savePushToken(
  walletAddress: string,
  expoPushToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!walletAddress || !expoPushToken) {
      return {
        success: false,
        error: 'Wallet address and push token are required',
      };
    }

    // Normalize wallet address to lowercase for consistency
    const normalizedWalletAddress = walletAddress.toLowerCase();

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          wallet_address: normalizedWalletAddress,
          expo_push_token: expoPushToken,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'wallet_address',
        }
      );

    if (error) {
      console.error('[Supabase] Error saving push token:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log('[Supabase] Push token saved successfully for wallet:', normalizedWalletAddress);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[Supabase] Unexpected error saving push token:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Delete a push token for a wallet address (useful for logout)
 *
 * @param walletAddress - The user's wallet address
 * @returns Object with success status and optional error message
 */
export async function deletePushToken(
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!walletAddress) {
      return {
        success: false,
        error: 'Wallet address is required',
      };
    }

    const normalizedWalletAddress = walletAddress.toLowerCase();

    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('wallet_address', normalizedWalletAddress);

    if (error) {
      console.error('[Supabase] Error deleting push token:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log('[Supabase] Push token deleted for wallet:', normalizedWalletAddress);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[Supabase] Unexpected error deleting push token:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
