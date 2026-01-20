/**
 * Error handling utilities
 * Safe error message extraction without type assertions
 */

/**
 * Safely extract error message from unknown error type
 * Use this instead of `(error as Error).message` patterns
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error';
}

/**
 * Check if an error has a specific property
 */
export function hasErrorProperty<K extends string>(
  error: unknown,
  property: K
): error is Record<K, unknown> {
  return error !== null && typeof error === 'object' && property in error;
}

/**
 * Extract error code if present (common in blockchain/RPC errors)
 */
export function getErrorCode(error: unknown): number | undefined {
  if (hasErrorProperty(error, 'code') && typeof error.code === 'number') {
    return error.code;
  }
  return undefined;
}
