/**
 * Formatting Utilities
 * Shared formatting functions for currency, dates, and addresses
 */

/**
 * Format currency for display (USDC has 6 decimals)
 */
export function formatCurrency(amount: number, decimals: number = 6): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Format currency with 2 decimal places (common display)
 */
export function formatCurrencyShort(amount: number): string {
  return formatCurrency(amount, 2);
}

/**
 * Format date for display with time
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format date without time (for PDFs and compact displays)
 */
export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Get a shortened version of an address
 * e.g., "0x1234567890abcdef" -> "0x1234...cdef"
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Get a shortened transaction hash
 */
export function shortenTxHash(hash: string, chars: number = 6): string {
  if (!hash || hash.length < 14) return hash;
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

/**
 * Format a number with thousands separators
 */
export function formatNumber(num: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format percentage for display
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}
