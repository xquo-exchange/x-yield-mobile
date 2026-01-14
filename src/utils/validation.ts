/**
 * Input Validation Utilities
 * Validates user inputs before processing
 */

/**
 * Validates an Ethereum address format
 * @param address - The address to validate
 * @returns true if valid Ethereum address format
 */
export function isValidEthereumAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Must start with 0x
  if (!address.startsWith('0x')) {
    return false;
  }

  // Must be exactly 42 characters (0x + 40 hex chars)
  if (address.length !== 42) {
    return false;
  }

  // Must contain only valid hex characters after 0x
  const hexPart = address.slice(2);
  const hexRegex = /^[0-9a-fA-F]+$/;
  if (!hexRegex.test(hexPart)) {
    return false;
  }

  return true;
}

/**
 * Validates and sanitizes a wallet address
 * @param address - The address to validate
 * @returns Lowercase address if valid, null if invalid
 */
export function sanitizeAddress(address: string): string | null {
  if (!isValidEthereumAddress(address)) {
    return null;
  }
  return address.toLowerCase();
}

/**
 * Validates a positive number amount
 * @param amount - The amount to validate (can be string or number)
 * @returns true if valid positive number
 */
export function isValidAmount(amount: string | number): boolean {
  if (amount === undefined || amount === null || amount === '') {
    return false;
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  // Must be a valid number
  if (isNaN(numAmount) || !isFinite(numAmount)) {
    return false;
  }

  // Must be positive
  if (numAmount <= 0) {
    return false;
  }

  return true;
}

/**
 * Validates and parses an amount
 * @param amount - The amount to validate
 * @returns Parsed number if valid, null if invalid
 */
export function parseAmount(amount: string | number): number | null {
  if (!isValidAmount(amount)) {
    return null;
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return numAmount;
}

/**
 * Validates amount is within reasonable bounds for USDC
 * @param amount - The amount to validate
 * @param maxAmount - Maximum allowed amount (default: 1 billion)
 * @returns true if within bounds
 */
export function isAmountWithinBounds(
  amount: number,
  maxAmount: number = 1_000_000_000
): boolean {
  if (!isValidAmount(amount)) {
    return false;
  }

  // Check decimal places (USDC has 6 decimals)
  const decimalPart = amount.toString().split('.')[1];
  if (decimalPart && decimalPart.length > 6) {
    return false;
  }

  // Check max amount
  if (amount > maxAmount) {
    return false;
  }

  return true;
}
