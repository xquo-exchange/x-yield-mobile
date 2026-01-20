/**
 * Entrypoint for X-Yield Mobile
 *
 * Polyfill loading order is critical for viem/smart wallets to work.
 * On Android, heavy polyfills can block the UI thread during startup.
 *
 * Order matters:
 * 1. Buffer - Must be first for viem compatibility
 * 2. Random values - For crypto operations
 * 3. Text encoding - For string handling
 * 4. Ethers shims - For legacy compatibility
 */

// Buffer polyfill MUST be first for viem/smart wallets
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// Crypto polyfills - these can be heavy on Android
// Import synchronously but they initialize lazily
import 'react-native-get-random-values';
import 'fast-text-encoding';
import '@ethersproject/shims';

// Log initialization for debugging
if (__DEV__) {
  console.log('[Entrypoint] Polyfills loaded successfully');
}

// Import the main app
import './index';
