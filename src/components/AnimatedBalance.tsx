/**
 * AnimatedBalance Component
 * Real-time yield accumulation display with USDC precision (6 decimals)
 *
 * Two modes:
 * - Balance mode: Shows total balance with real-time yield accumulation
 * - Earned mode: Shows earned amount (balance - deposited) with real-time yield
 */

import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { COLORS } from '../constants/colors';

// Constants
const SECONDS_PER_YEAR = 31536000;
const UPDATE_INTERVAL_MS = 100;

/**
 * Format a value with USDC precision (6 decimals)
 */
function formatWithPrecision(value: number, prefix: string = '$'): string {
  const formatted = value.toFixed(6);
  const parts = formatted.split('.');
  const integerPart = parseInt(parts[0]).toLocaleString('en-US');
  return `${prefix}${integerPart}.${parts[1]}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATED BALANCE - Total balance display
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnimatedBalanceProps {
  /** Current balance amount */
  balance: number;
  /** Annual percentage yield */
  apy: number;
  /** Whether yield is being earned (balance > 0 in savings) */
  isEarning: boolean;
  /** Display size */
  size?: 'large' | 'medium' | 'small';
  /** Custom text style */
  style?: TextStyle;
}

export function AnimatedBalance({
  balance,
  apy,
  isEarning,
  size = 'large',
  style,
}: AnimatedBalanceProps) {
  const [displayBalance, setDisplayBalance] = useState(balance);
  const startTimeRef = useRef(Date.now());
  const startBalanceRef = useRef(balance);

  // Reset when balance changes significantly (new deposit/withdrawal)
  useEffect(() => {
    const diff = Math.abs(balance - startBalanceRef.current);
    if (diff > 0.01) {
      startBalanceRef.current = balance;
      startTimeRef.current = Date.now();
      setDisplayBalance(balance);
    }
  }, [balance]);

  // Real-time yield accumulation
  useEffect(() => {
    if (!isEarning || apy <= 0 || balance <= 0) {
      setDisplayBalance(balance);
      return;
    }

    // yieldPerSecond = balance * (APY / 100) / seconds_per_year
    const yieldPerSecond = balance * (apy / 100) / SECONDS_PER_YEAR;

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
      const accumulatedYield = yieldPerSecond * elapsedSeconds;
      setDisplayBalance(startBalanceRef.current + accumulatedYield);
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [balance, apy, isEarning]);

  const fontSize = size === 'large' ? 44 : size === 'medium' ? 28 : 20;

  return (
    <Text style={[balanceStyles.balance, { fontSize }, style]}>
      {formatWithPrecision(displayBalance)}
    </Text>
  );
}

const balanceStyles = StyleSheet.create({
  balance: {
    fontWeight: '700',
    color: COLORS.black,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATED EARNED - Earnings display (balance - deposited)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnimatedEarnedProps {
  /** Current total balance */
  currentBalance: number;
  /** Total amount deposited */
  depositedAmount: number;
  /** Annual percentage yield */
  apy: number;
  /** Custom text style */
  style?: TextStyle;
}

/**
 * Calculate earned amount (balance - deposited)
 * Shows exact value from blockchain without any filtering
 */
function calculateEarned(balance: number, deposited: number): number {
  if (deposited <= 0) return 0;
  return Math.max(0, balance - deposited);
}

export function AnimatedEarned({
  currentBalance,
  depositedAmount,
  apy,
  style,
}: AnimatedEarnedProps) {
  // Initial earned calculation
  const [displayEarned, setDisplayEarned] = useState(
    calculateEarned(currentBalance, depositedAmount)
  );
  const startTimeRef = useRef(Date.now());
  const startBalanceRef = useRef(currentBalance);

  // Reset when balance changes significantly
  useEffect(() => {
    const diff = Math.abs(currentBalance - startBalanceRef.current);
    if (diff > 0.01) {
      startBalanceRef.current = currentBalance;
      startTimeRef.current = Date.now();
      setDisplayEarned(calculateEarned(currentBalance, depositedAmount));
    }
  }, [currentBalance, depositedAmount]);

  // Real-time yield accumulation for earned amount
  useEffect(() => {
    // If we don't have valid deposit data, show earnings as 0
    if (apy <= 0 || currentBalance <= 0 || depositedAmount <= 0) {
      setDisplayEarned(calculateEarned(currentBalance, depositedAmount));
      return;
    }

    // yieldPerSecond based on current balance
    const yieldPerSecond = currentBalance * (apy / 100) / SECONDS_PER_YEAR;

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
      const accumulatedYield = yieldPerSecond * elapsedSeconds;
      const newBalance = startBalanceRef.current + accumulatedYield;
      // Calculate earned from blockchain values
      const earned = calculateEarned(newBalance, depositedAmount);
      setDisplayEarned(earned);
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [currentBalance, depositedAmount, apy]);

  return (
    <Text style={[earnedStyles.earned, style]}>
      {formatWithPrecision(displayEarned, '+$')}
    </Text>
  );
}

const earnedStyles = StyleSheet.create({
  earned: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success,
    fontVariant: ['tabular-nums'],
  },
});

export default AnimatedBalance;
