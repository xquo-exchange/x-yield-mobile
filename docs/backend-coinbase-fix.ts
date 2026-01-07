/**
 * COINBASE ONRAMP BACKEND - CORRECT IMPLEMENTATION
 *
 * Your API keys are Ed25519 format:
 * - ID: UUID like "68480fc1-af4a-44b1-bead-6c20a4d6ef96"
 * - Secret: Base64 Ed25519 key like "7Ne9Cwele1O4Ao...==" (ends with ==)
 *
 * Use @coinbase/cdp-sdk which handles Ed25519 keys directly!
 *
 * INSTALL: npm install @coinbase/cdp-sdk
 */

// ============================================================
// OPTION 1: Using @coinbase/cdp-sdk (RECOMMENDED)
// ============================================================

import { generateJwt } from "@coinbase/cdp-sdk/auth";

const COINBASE_API_KEY_ID = process.env.COINBASE_API_KEY_ID!;
const COINBASE_API_KEY_SECRET = process.env.COINBASE_API_KEY_SECRET!;

// Coinbase Onramp API endpoint
const COINBASE_TOKEN_ENDPOINT = 'https://api.developer.coinbase.com/onramp/v1/token';

/**
 * Generate Coinbase Onramp session using CDP SDK
 */
export async function generateOnrampSession(walletAddress: string): Promise<{ url: string } | { error: string }> {
  try {
    console.log('[Coinbase] Generating session for:', walletAddress);
    console.log('[Coinbase] Using API Key ID:', COINBASE_API_KEY_ID);

    // Generate JWT using CDP SDK - it handles Ed25519 keys automatically!
    const jwt = await generateJwt({
      apiKeyId: COINBASE_API_KEY_ID,
      apiKeySecret: COINBASE_API_KEY_SECRET,
      requestMethod: 'POST',
      requestHost: 'api.developer.coinbase.com',
      requestPath: '/onramp/v1/token',
      expiresIn: 120,
    });

    console.log('[Coinbase] JWT generated successfully');

    // Request body for Onramp token
    const body = {
      addresses: [
        {
          address: walletAddress,
          blockchains: ['base'],
        },
      ],
      assets: ['USDC'],
    };

    console.log('[Coinbase] Calling Onramp API...');

    // Call Coinbase Onramp API
    const response = await fetch(COINBASE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[Coinbase] Response status:', response.status);

    const responseText = await response.text();
    console.log('[Coinbase] Response body:', responseText);

    if (!response.ok) {
      return { error: `Coinbase API error: ${response.status} - ${responseText}` };
    }

    const data = JSON.parse(responseText);

    if (!data.token) {
      return { error: 'No token in response' };
    }

    // Build the Onramp URL with session token
    const onrampUrl = `https://pay.coinbase.com/buy/select-asset?sessionToken=${data.token}&defaultNetwork=base&defaultAsset=USDC`;

    console.log('[Coinbase] Onramp URL generated');
    return { url: onrampUrl };

  } catch (error) {
    console.error('[Coinbase] Exception:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * API Route Handler (Next.js App Router)
 * File: app/api/onramp/session/route.ts
 */
export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return Response.json({ error: 'walletAddress required' }, { status: 400 });
    }

    const result = await generateOnrampSession(walletAddress);

    if ('error' in result) {
      console.error('[API] Onramp error:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    return Response.json({ url: result.url });
  } catch (error) {
    console.error('[API] Exception:', error);
    return Response.json(
      { error: 'Failed to generate onramp session' },
      { status: 500 }
    );
  }
}


// ============================================================
// OPTION 2: Manual JWT generation (if SDK doesn't work)
// ============================================================

/*
If the CDP SDK doesn't work, you can generate JWT manually.
Ed25519 keys need to be handled differently than ES256.

import * as jose from 'jose';

async function generateJwtManual(): Promise<string> {
  // Decode base64 secret to raw bytes
  const secretBytes = Buffer.from(COINBASE_API_KEY_SECRET, 'base64');

  // Ed25519 private key is first 32 bytes
  const privateKeyBytes = secretBytes.slice(0, 32);

  // Import as Ed25519 key
  const privateKey = await jose.importPKCS8(
    // Convert to PKCS8 format for Ed25519
    // This is complex - use the SDK instead!
  );

  const jwt = await new jose.SignJWT({
    sub: COINBASE_API_KEY_ID,
    iss: 'cdp',
    aud: ['cdp_service'],
  })
    .setProtectedHeader({
      alg: 'EdDSA',
      kid: COINBASE_API_KEY_ID,
      typ: 'JWT',
      nonce: crypto.randomUUID(),
    })
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(privateKey);

  return jwt;
}
*/


// ============================================================
// ENVIRONMENT VARIABLES FOR VERCEL
// ============================================================

/*
Set these in Vercel Dashboard > Project > Settings > Environment Variables:

COINBASE_API_KEY_ID=68480fc1-af4a-44b1-bead-6c20a4d6ef96
COINBASE_API_KEY_SECRET=7Ne9Cwele1O4Ao6mRg/sXhv/rqX2hPB4WsSdVgtVqngpQA6PRD1s1Ak35oU81gyON/7unFBvjAfVYuZD3RFI5g==

Note: The secret should be the raw base64 string, no PEM headers needed!
*/


// ============================================================
// TYPESCRIPT CONFIG (tsconfig.json)
// ============================================================

/*
If you get TypeScript errors with the CDP SDK, update tsconfig.json:

{
  "compilerOptions": {
    "moduleResolution": "node16",  // or "nodenext"
    // ... rest of config
  }
}
*/
