/**
 * API Response Types
 * Types for external API responses (Morpho, Blockscout, RPC)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MORPHO GRAPHQL API TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Vault item from Morpho GraphQL API
 */
export interface MorphoVaultApiItem {
  address: string;
  name: string;
  symbol: string;
  avgApy?: string;       // 7-day average APY as string (e.g., "0.051" for 5.1%)
  avgNetApy?: string;    // 7-day average Net APY (after fees, including rewards)
  performanceFee?: string;
  totalAssets?: string;
}

/**
 * Morpho GraphQL response for vault queries
 */
export interface MorphoVaultsResponse {
  data?: {
    vaultV2s?: {
      items?: MorphoVaultApiItem[];
    };
  };
  errors?: Array<{
    message: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCKSCOUT API TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ERC20 token transfer from Blockscout API
 * Based on Etherscan-compatible API response format
 */
export interface BlockscoutTokenTransfer {
  hash: string;           // Transaction hash
  from: string;           // Sender address
  to: string;             // Recipient address
  value: string;          // Transfer amount in raw units (string to handle large numbers)
  timeStamp: string;      // Unix timestamp in seconds (string)
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  blockNumber?: string;
  confirmations?: string;
  contractAddress?: string;
  gasUsed?: string;
  gasPrice?: string;
  nonce?: string;
  transactionIndex?: string;
  input?: string;
}

/**
 * Blockscout API response wrapper
 */
export interface BlockscoutApiResponse<T> {
  status: string;         // "1" for success, "0" for error
  message: string;        // "OK" or error message
  result: T;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RPC RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * JSON-RPC response wrapper
 */
export interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Transaction receipt from eth_getTransactionReceipt
 */
export interface TransactionReceipt {
  status: string;         // "0x1" for success, "0x0" for failure
  blockNumber: string;    // Hex string
  blockHash: string;
  transactionHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  contractAddress?: string | null;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
    logIndex: string;
    blockNumber: string;
    blockHash: string;
    transactionHash: string;
    transactionIndex: string;
    removed?: boolean;
  }>;
  logsBloom: string;
  type?: string;
  effectiveGasPrice?: string;
}

/**
 * Transaction from eth_getTransactionByHash
 */
export interface TransactionByHash {
  hash: string;
  blockNumber: string | null;
  blockHash: string | null;
  transactionIndex: string | null;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice: string;
  input: string;
  nonce: string;
  v?: string;
  r?: string;
  s?: string;
  type?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}
