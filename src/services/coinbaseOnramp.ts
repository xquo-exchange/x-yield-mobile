/**
 * Coinbase Funding Service
 *
 * Simple approach: Open Coinbase app/website for users to buy USDC,
 * then they can send it to their X-Yield wallet address.
 *
 * TODO: Integrate with x-yield-api backend for direct Coinbase Onramp
 * with session token authentication for seamless one-click purchases.
 */

import { Linking, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// Coinbase URLs
const COINBASE_APP_URL = 'coinbase://';
const COINBASE_WEB_URL = 'https://www.coinbase.com';
const COINBASE_USDC_URL = 'https://www.coinbase.com/price/usd-coin';

// Deep link to buy USDC on Coinbase app
const COINBASE_BUY_USDC_DEEP_LINK = 'coinbase://buy?asset=USDC';

/**
 * Open Coinbase to buy USDC
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
