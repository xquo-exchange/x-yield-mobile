/**
 * COINBASE OFFRAMP BACKEND
 *
 * Endpoint: POST /api/offramp/session
 *
 * Uses same CDP API keys as onramp.
 *
 * This file documents the backend endpoint that needs to be created
 * in x-yield-api for the offramp feature to work.
 */

// =============================================================================
// REQUEST
// =============================================================================

interface OfframpSessionRequest {
  walletAddress: string;  // User's smart wallet address (source of USDC)
  amount: string;         // Amount of USDC to sell (e.g., "100.00")
  country?: string;       // User's country code (default: 'US')
}

// =============================================================================
// RESPONSE
// =============================================================================

interface OfframpQuote {
  cashoutTotal: string;   // Amount user will receive in USD after fees
  coinbaseFee: string;    // Coinbase's fee for the transaction
  sellAmount: string;     // Amount of USDC being sold
}

interface OfframpSessionResponse {
  url?: string;           // Coinbase offramp URL to open in browser
  quote?: OfframpQuote;   // Quote details (optional, for display)
  error?: string;         // Error message if request failed
}

// =============================================================================
// BACKEND IMPLEMENTATION
// =============================================================================

/**
 * Backend handler for /api/offramp/session
 *
 * This endpoint calls the Coinbase CDP API to get an offramp URL.
 *
 * Coinbase API: POST https://api.developer.coinbase.com/onramp/v1/sell/quote
 *
 * Unlike onramp (which returns a session token), offramp returns
 * the ready-to-use URL directly from the sell/quote endpoint.
 *
 * Requirements:
 * - Same CDP API keys used for onramp
 * - User must have verified Coinbase account with linked bank
 * - No guest checkout available for offramp
 *
 * Example implementation (Vercel serverless function):
 */

/*
import { Coinbase } from '@coinbase/coinbase-sdk';

export async function POST(request: Request) {
  try {
    const { walletAddress, amount, country = 'US' } = await request.json();

    if (!walletAddress || !amount) {
      return Response.json(
        { error: 'Missing required fields: walletAddress, amount' },
        { status: 400 }
      );
    }

    // Initialize Coinbase SDK with CDP credentials
    const coinbase = Coinbase.configure({
      apiKeyName: process.env.CDP_API_KEY_NAME!,
      privateKey: process.env.CDP_API_KEY_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    });

    // Call Coinbase Offramp API
    const response = await fetch('https://api.developer.coinbase.com/onramp/v1/sell/quote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateJWT()}`, // Use CDP JWT
      },
      body: JSON.stringify({
        sell_currency: 'USDC',
        sell_amount: amount,
        sell_network: 'base',
        cashout_currency: 'USD',
        country: country,
        wallet_address: walletAddress,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Offramp] Coinbase API error:', response.status, errorText);
      return Response.json(
        { error: `Coinbase API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // The sell/quote endpoint returns offramp_url directly
    if (data.offramp_url) {
      return Response.json({
        url: data.offramp_url,
        quote: {
          cashoutTotal: data.cashout_total,
          coinbaseFee: data.coinbase_fee,
          sellAmount: data.sell_amount,
        },
      });
    }

    return Response.json(
      { error: 'No offramp URL returned from Coinbase' },
      { status: 500 }
    );
  } catch (error) {
    console.error('[Offramp] Error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
*/

// =============================================================================
// COINBASE OFFRAMP FLOW
// =============================================================================

/**
 * User Flow:
 *
 * 1. User taps "Withdraw" on Cash balance in mobile app
 * 2. User selects "Cash Out to Bank"
 * 3. User enters amount to cash out
 * 4. App calls POST /api/offramp/session with wallet address and amount
 * 5. Backend calls Coinbase sell/quote API
 * 6. Backend returns offramp URL to app
 * 7. App opens URL in in-app browser (expo-web-browser)
 * 8. User logs into Coinbase (or is already logged in)
 * 9. User confirms the sale and selects bank account
 * 10. Coinbase requests USDC from user's wallet
 * 11. User signs transaction (via Privy smart wallet)
 * 12. USD is sent to user's bank account (1-3 business days)
 *
 * Important Notes:
 * - User must have a verified Coinbase account
 * - User must have a linked bank account in Coinbase
 * - There is NO guest checkout for offramp (unlike onramp)
 * - Coinbase handles all KYC/AML compliance
 * - Fees are displayed in the quote before confirmation
 */

// =============================================================================
// ENVIRONMENT VARIABLES (same as onramp)
// =============================================================================

/**
 * Required in x-yield-api .env:
 *
 * CDP_API_KEY_NAME=your_cdp_api_key_name
 * CDP_API_KEY_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"
 *
 * These are the same credentials used for the onramp endpoint.
 */

export {};
