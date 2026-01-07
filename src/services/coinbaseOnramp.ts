/**
 * Coinbase Onramp Service
 *
 * Generates URLs to open Coinbase Onramp for buying USDC.
 * Users can purchase USDC which is sent directly to their X-Yield wallet.
 *
 * Configuration:
 * 1. Get your Project ID from https://portal.cdp.coinbase.com/
 * 2. Add redirect URLs to your domain allowlist:
 *    - xyield://
 *    - xyield://onramp-callback
 *
 * For sandbox testing, use pay-sandbox.coinbase.com
 */

import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// Your Coinbase Developer Platform Project ID
// Get this from: https://portal.cdp.coinbase.com/
const COINBASE_PROJECT_ID = 'cefdcbd9-ec86-4be4-89c4-5454ec084cbd';

// Use sandbox for testing, production for real purchases
// Sandbox: 25 test transactions, max $5 each
const USE_SANDBOX = true;
const COINBASE_BASE_URL = USE_SANDBOX
  ? 'https://pay-sandbox.coinbase.com'
  : 'https://pay.coinbase.com';

// Our app's URL scheme for redirects
const APP_SCHEME = 'xyield';
const REDIRECT_URL = `${APP_SCHEME}://onramp-callback`;

interface OnrampOptions {
  /** Wallet address to receive funds */
  walletAddress: string;
  /** Preset fiat amount in USD (optional) */
  presetAmount?: number;
  /** Asset to buy (default: USDC) */
  asset?: string;
  /** Network (default: base) */
  network?: string;
}

/**
 * Generate a Coinbase Onramp URL
 *
 * @param options - Configuration for the onramp
 * @returns The full Coinbase Onramp URL
 */
export function generateOnrampUrl(options: OnrampOptions): string {
  const {
    walletAddress,
    presetAmount,
    asset = 'USDC',
    network = 'base',
  } = options;

  // Build the addresses parameter
  // Format: {"0xAddress": ["network1", "network2"]}
  const addresses = JSON.stringify({
    [walletAddress]: [network],
  });

  // Build the assets parameter
  const assets = JSON.stringify([asset]);

  // Build URL with query parameters
  const params = new URLSearchParams({
    appId: COINBASE_PROJECT_ID,
    addresses: addresses,
    assets: assets,
    defaultNetwork: network,
    defaultAsset: asset,
  });

  // Add optional parameters
  if (presetAmount) {
    params.append('presetFiatAmount', presetAmount.toString());
  }

  // Add redirect URL for mobile app callback
  params.append('redirectUrl', REDIRECT_URL);

  return `${COINBASE_BASE_URL}/buy/select-asset?${params.toString()}`;
}

/**
 * Open Coinbase Onramp in a web browser
 *
 * @param walletAddress - The wallet address to receive USDC
 * @param presetAmount - Optional preset amount in USD
 */
export async function openCoinbaseOnramp(
  walletAddress: string,
  presetAmount?: number
): Promise<void> {
  const url = generateOnrampUrl({
    walletAddress,
    presetAmount,
    asset: 'USDC',
    network: 'base',
  });

  console.log('[CoinbaseOnramp] Opening URL:', url);

  try {
    // Use expo-web-browser for better integration
    // This opens a modal browser that can redirect back to the app
    const result = await WebBrowser.openBrowserAsync(url, {
      dismissButtonStyle: 'close',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      // Enable redirects back to our app
      createTask: false,
    });

    console.log('[CoinbaseOnramp] Browser result:', result);
  } catch (error) {
    console.error('[CoinbaseOnramp] Error opening browser:', error);

    // Fallback to system browser
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      throw new Error('Cannot open Coinbase Onramp');
    }
  }
}

/**
 * Check if Coinbase is configured
 */
export function isCoinbaseConfigured(): boolean {
  return COINBASE_PROJECT_ID !== 'YOUR_COINBASE_PROJECT_ID';
}

/**
 * Get configuration status message
 */
export function getConfigStatus(): string {
  if (!isCoinbaseConfigured()) {
    return 'Coinbase Onramp not configured. Add your Project ID to coinbaseOnramp.ts';
  }
  return `Coinbase Onramp ready (${USE_SANDBOX ? 'sandbox' : 'production'})`;
}
