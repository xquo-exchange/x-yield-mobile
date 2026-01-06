// Buffer polyfill MUST be first for viem/smart wallets
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// Other polyfills in correct order
import 'react-native-get-random-values';
import 'fast-text-encoding';
import '@ethersproject/shims';

// Import the main app
import './index';
