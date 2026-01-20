/**
 * Wallet type definitions
 * Types for Privy smart wallet client and transactions
 */

/**
 * Single transaction call
 */
export interface TransactionCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

/**
 * Single transaction request
 */
export interface SingleTransactionRequest {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

/**
 * Batch transaction request
 */
export interface BatchTransactionRequest {
  calls: Array<{
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
  }>;
}

/**
 * Smart wallet account interface
 */
export interface SmartWalletAccount {
  address: `0x${string}`;
}

/**
 * Smart wallet client interface
 * Based on Privy's smart wallet client API
 *
 * Note: This is a simplified interface that covers the methods we use.
 * The actual Privy client may have more properties/methods.
 */
export interface SmartWalletClient {
  account: SmartWalletAccount;
  sendTransaction(request: SingleTransactionRequest | BatchTransactionRequest): Promise<`0x${string}`>;
}
