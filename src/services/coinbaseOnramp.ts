/**
 * Coinbase Onramp Service
 *
 * Integrates with x-yield-api backend to get Coinbase Onramp session tokens
 * for seamless one-click USDC purchases.
 *
 * Flow:
 * 1. User taps "Buy USDC"
 * 2. App calls backend POST /api/onramp/session
 * 3. Backend returns Coinbase URL with sessionToken
 * 4. App opens URL in browser
 * 5. User completes purchase on Coinbase
 * 6. USDC arrives in wallet on Base
 */

import { Linking, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// Backend API URL
const API_BASE_URL = 'https://x-yield-api.vercel.app';

// Base chain ID
const BASE_CHAIN_ID = 8453;

// Fallback Coinbase URLs (if backend fails)
const COINBASE_APP_URL = 'coinbase://';
const COINBASE_USDC_URL = 'https://www.coinbase.com/price/usd-coin';
const COINBASE_BUY_USDC_DEEP_LINK = 'coinbase://buy?asset=USDC';

interface OnrampSessionResponse {
  url: string;
  error?: string;
}

/**
 * Get Coinbase Onramp session URL from backend
 *
 * @param walletAddress - User's wallet address for receiving USDC
 * @returns The Coinbase Onramp URL with session token, or null if failed
 */
export async function getOnrampSessionUrl(walletAddress: string): Promise<string | null> {
  try {
    const startTime = Date.now();
    console.log('[Coinbase] Requesting onramp session for:', walletAddress);

    const response = await fetch(`${API_BASE_URL}/api/onramp/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress,
        chainId: BASE_CHAIN_ID,
      }),
    });

    const fetchTime = Date.now() - startTime;
    console.log(`[Coinbase] API response received in ${fetchTime}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Coinbase] Backend error:', response.status, errorText);
      return null;
    }

    const data: OnrampSessionResponse = await response.json();
    const totalTime = Date.now() - startTime;
    console.log(`[Coinbase] Total getOnrampSessionUrl time: ${totalTime}ms`);

    if (data.url) {
      console.log('[Coinbase] Got onramp URL');
      return data.url;
    }

    if (data.error) {
      console.error('[Coinbase] API error:', data.error);
    }

    return null;
  } catch (error) {
    console.error('[Coinbase] Failed to get session:', error);
    return null;
  }
}

/**
 * Open Coinbase Onramp with session token
 *
 * Gets session URL from backend and opens it in browser.
 * Falls back to manual Coinbase flow if backend fails.
 *
 * @param walletAddress - User's wallet address
 * @returns true if opened successfully, false otherwise
 */
export async function openCoinbaseOnramp(walletAddress: string): Promise<boolean> {
  try {
    const totalStart = Date.now();
    console.log('[Coinbase] openCoinbaseOnramp started');

    // Get session URL from backend
    const onrampUrl = await getOnrampSessionUrl(walletAddress);
    const apiTime = Date.now() - totalStart;
    console.log(`[Coinbase] API call completed in ${apiTime}ms`);

    if (onrampUrl) {
      console.log('[Coinbase] Opening onramp URL');
      const browserStart = Date.now();

      // Open in browser
      const result = await WebBrowser.openBrowserAsync(onrampUrl, {
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });

      const browserTime = Date.now() - browserStart;
      const totalTime = Date.now() - totalStart;
      console.log(`[Coinbase] Browser opened in ${browserTime}ms, total flow: ${totalTime}ms`);
      console.log('[Coinbase] Browser result:', result.type);
      return true;
    }

    // Fallback to manual flow
    console.log('[Coinbase] Session failed, using fallback');
    return await openCoinbaseToBuyUsdc();
  } catch (error) {
    console.error('[Coinbase] Error opening onramp:', error);
    return await openCoinbaseToBuyUsdc();
  }
}

/**
 * Fallback: Open Coinbase to buy USDC manually
 *
 * Tries to open the Coinbase app first, falls back to web
 */
export async function openCoinbaseToBuyUsdc(): Promise<boolean> {
  try {
    // Try to open Coinbase app deep link to buy USDC
    const canOpenApp = await Linking.canOpenURL(COINBASE_APP_URL);

    if (canOpenApp) {
      // Try the buy deep link first
      const canOpenBuy = await Linking.canOpenURL(COINBASE_BUY_USDC_DEEP_LINK);
      if (canOpenBuy) {
        await Linking.openURL(COINBASE_BUY_USDC_DEEP_LINK);
        return true;
      }
      // Fallback to just opening the app
      await Linking.openURL(COINBASE_APP_URL);
      return true;
    }

    // Fallback to web browser
    await WebBrowser.openBrowserAsync(COINBASE_USDC_URL, {
      dismissButtonStyle: 'close',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
    return true;
  } catch (error) {
    console.error('[Coinbase] Error opening Coinbase:', error);
    return false;
  }
}

/**
 * Show instructions for buying USDC on Coinbase
 *
 * @param walletAddress - User's wallet address to display
 * @param onCopyAddress - Callback to copy the address
 * @param onShowQrCode - Callback to show QR code
 */
export function showBuyUsdcInstructions(
  walletAddress: string,
  onCopyAddress: () => void,
  onShowQrCode: () => void
): void {
  Alert.alert(
    'Buy USDC',
    'To add funds to X-Yield:\n\n' +
      '1. Buy USDC on Coinbase\n' +
      '2. Withdraw to your X-Yield wallet\n' +
      '3. Select Base network when withdrawing\n\n' +
      'Your wallet address:',
    [
      {
        text: 'Open Coinbase',
        onPress: async () => {
          const opened = await openCoinbaseToBuyUsdc();
          if (!opened) {
            Alert.alert('Error', 'Could not open Coinbase');
          }
        },
      },
      {
        text: 'Show QR Code',
        onPress: onShowQrCode,
      },
      {
        text: 'Copy Address',
        onPress: onCopyAddress,
      },
      { text: 'Cancel', style: 'cancel' },
    ]
  );
}

/**
 * Get a formatted message explaining how to fund the wallet
 */
export function getFundingInstructions(walletAddress: string): string {
  const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  return [
    'How to add funds:',
    '',
    '1. Buy USDC on Coinbase or any exchange',
    '2. Withdraw to your X-Yield wallet',
    `3. Your address: ${shortAddress}`,
    '4. Network: Base',
    '',
    'Need help? Tap "Show QR Code" to scan with your exchange app.',
  ].join('\n');
}
