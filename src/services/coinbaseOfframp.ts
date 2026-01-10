/**
 * Coinbase Offramp Service
 *
 * Allows users to sell USDC and withdraw to their bank account via Coinbase.
 * Requires: Verified Coinbase account with linked bank.
 *
 * Flow:
 * 1. User enters amount to cash out
 * 2. App calls backend POST /api/offramp/session
 * 3. Backend returns Coinbase offramp URL with quote
 * 4. App opens URL in browser
 * 5. User completes sale on Coinbase
 * 6. USD sent to user's linked bank account (1-3 days)
 */

import * as WebBrowser from 'expo-web-browser';

const API_BASE_URL = 'https://x-yield-api.vercel.app';

interface OfframpQuote {
  cashoutTotal: string;
  coinbaseFee: string;
  sellAmount: string;
}

interface OfframpSessionResponse {
  url?: string;
  quote?: OfframpQuote;
  error?: string;
}

/**
 * Get Coinbase Offramp session URL from backend
 *
 * @param walletAddress - User's wallet address (source of USDC)
 * @param amount - Amount of USDC to sell
 * @param country - User's country code (default: 'US')
 * @returns The Coinbase Offramp URL and quote, or null if failed
 */
export async function getOfframpSessionUrl(
  walletAddress: string,
  amount: string,
  country: string = 'IT'
): Promise<OfframpSessionResponse | null> {
  try {
    const startTime = Date.now();
    console.log('[Coinbase Offramp] Requesting session for:', walletAddress, 'amount:', amount);

    const response = await fetch(`${API_BASE_URL}/api/offramp/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress,
        amount: parseFloat(amount),
        country,
      }),
    });

    const fetchTime = Date.now() - startTime;
    console.log(`[Coinbase Offramp] API response received in ${fetchTime}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Coinbase Offramp] Backend error:', response.status, errorText);
      return { error: `Backend error: ${response.status}` };
    }

    const data: OfframpSessionResponse = await response.json();
    const totalTime = Date.now() - startTime;
    console.log(`[Coinbase Offramp] Total time: ${totalTime}ms`);

    if (data.url) {
      console.log('[Coinbase Offramp] Got offramp URL');
      return data;
    }

    if (data.error) {
      console.error('[Coinbase Offramp] API error:', data.error);
      return { error: data.error };
    }

    return { error: 'No URL returned' };
  } catch (error) {
    console.error('[Coinbase Offramp] Failed to get session:', error);
    return { error: (error as Error)?.message || 'Network error' };
  }
}

/**
 * Open Coinbase Offramp flow in browser
 *
 * Gets session URL from backend and opens it.
 *
 * @param walletAddress - User's wallet address
 * @param amount - Amount of USDC to sell
 * @param country - User's country code (default: 'US')
 * @returns Object with success status and optional error
 */
export async function openCoinbaseOfframp(
  walletAddress: string,
  amount: string,
  country: string = 'IT'
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[Coinbase Offramp] Opening offramp flow');

    const result = await getOfframpSessionUrl(walletAddress, amount, country);

    if (result?.error) {
      return { success: false, error: result.error };
    }

    if (result?.url) {
      console.log('[Coinbase Offramp] Opening URL in browser');

      await WebBrowser.openBrowserAsync(result.url, {
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });

      return { success: true };
    }

    return { success: false, error: 'No URL returned from backend' };
  } catch (error) {
    console.error('[Coinbase Offramp] Error:', error);
    return { success: false, error: (error as Error)?.message || 'Unknown error' };
  }
}
