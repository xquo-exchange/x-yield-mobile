/**
 * AnimatedBalance Component
 *
 * Clean, professional balance display with real-time yield growth.
 * Designed to look like a modern banking app, not a flashy crypto app.
 *
 * Features:
 * - 6 decimal precision, all digits same size and color
 * - Subtle real-time animation (just numbers changing)
 * - Daily/monthly yield estimates
 * - Pauses when app is in background (battery saving)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, AppState, AppStateStatus } from 'react-native';

// Color Palette - PayPal/Revolut Style
const COLORS = {
  primary: '#200191',
  secondary: '#6198FF',
  white: '#F5F6FF',
  grey: '#484848',
  black: '#00041B',
  success: '#22C55E',
};

// Seconds in a year (365.25 days for accuracy)
const SECONDS_PER_YEAR = 31_557_600;

// Update interval in milliseconds
const UPDATE_INTERVAL_MS = 50;

interface AnimatedBalanceProps {
  /** The actual on-chain balance in USD */
  balance: number;
  /** Annual Percentage Yield as a decimal (e.g., 5.5 for 5.5%) */
  apy: number;
  /** Whether to show the animation (false = static display) */
  isAnimating?: boolean;
  /** Font size for the balance */
  fontSize?: number;
  /** Color for the balance (default black) */
  color?: string;
  /** Custom style for the container */
  style?: object;
  /** Label to show above the balance (optional) */
  label?: string;
  /** Label style */
  labelStyle?: object;
  /** Total deposited amount (for calculating earnings) */
  totalDeposited?: number;
  /** Show daily/monthly yield estimate */
  showYieldEstimate?: boolean;
  /** Show total earned since deposit */
  showTotalEarned?: boolean;
  /** Accent color for APY badge and earnings */
  accentColor?: string;
  /**
   * The portion of balance that is earning yield.
   * If not provided, assumes entire balance is earning.
   * Use this when displaying total balance (available + earning)
   * so animation only calculates yield on the earning portion.
   */
  earningBalance?: number;
}

export default function AnimatedBalance({
  balance,
  apy,
  isAnimating = true,
  fontSize = 42,
  color = COLORS.black,
  style,
  label,
  labelStyle,
  totalDeposited = 0,
  showYieldEstimate = true,
  showTotalEarned = false,
  accentColor = COLORS.success,
  earningBalance,
}: AnimatedBalanceProps) {
  // The balance portion that earns yield
  // If earningBalance not provided, assume entire balance is earning
  const yieldingBalance = earningBalance ?? balance;
  // Current display value (interpolated)
  const [displayValue, setDisplayValue] = useState(balance);
  const [isActive, setIsActive] = useState(true);

  // Track when balance was last synced from blockchain
  const lastSyncTime = useRef(Date.now());
  const lastSyncValue = useRef(balance);

  // Animation ref
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calculate yield per millisecond
  const yieldPerMs = useCallback((currentBalance: number, apyPercent: number) => {
    const apyDecimal = apyPercent / 100;
    const yieldPerSecond = (currentBalance * apyDecimal) / SECONDS_PER_YEAR;
    return yieldPerSecond / 1000;
  }, []);

  // Calculate daily and monthly yield estimates
  const calculateYieldEstimates = useCallback((currentBalance: number, apyPercent: number) => {
    const apyDecimal = apyPercent / 100;
    const dailyYield = (currentBalance * apyDecimal) / 365.25;
    const monthlyYield = (currentBalance * apyDecimal) / 12;
    return { dailyYield, monthlyYield };
  }, []);

  // Handle app state changes (foreground/background)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        setIsActive(true);
        lastSyncTime.current = Date.now();
        lastSyncValue.current = balance;
      } else {
        setIsActive(false);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [balance]);

  // Sync with new blockchain data
  useEffect(() => {
    lastSyncTime.current = Date.now();
    lastSyncValue.current = balance;
    setDisplayValue(balance);
  }, [balance]);

  // Real-time interpolation
  useEffect(() => {
    if (!isAnimating || !isActive || apy <= 0 || balance <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastSyncTime.current;
      // Calculate yield only on the earning portion, not the full balance
      const yieldGained = yieldPerMs(yieldingBalance, apy) * elapsedMs;
      const newValue = lastSyncValue.current + yieldGained;

      setDisplayValue(newValue);
    }, UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAnimating, isActive, apy, balance, yieldPerMs, yieldingBalance]);

  // Format the balance - all same size
  const formatBalance = useCallback((value: number) => {
    const formatted = value.toFixed(6);
    const [wholePart, decimalPart] = formatted.split('.');
    const wholeFormatted = parseInt(wholePart).toLocaleString('en-US');
    return `$${wholeFormatted}.${decimalPart}`;
  }, []);

  const formattedBalance = formatBalance(displayValue);

  // Calculate yield estimates based on earning portion only
  const { dailyYield, monthlyYield } = calculateYieldEstimates(yieldingBalance, apy);

  // Calculate total earned (current value - deposited)
  const totalEarned = totalDeposited > 0 ? Math.max(0, displayValue - totalDeposited) : 0;

  return (
    <View style={[styles.container, style]}>
      {label && (
        <Text style={[styles.label, labelStyle]}>{label}</Text>
      )}

      {/* Main Balance - all same size and color */}
      <Text
        style={[
          styles.balance,
          {
            fontSize: fontSize,
            color: color,
          }
        ]}
      >
        {formattedBalance}
      </Text>

      {/* Yield Estimate */}
      {showYieldEstimate && isAnimating && apy > 0 && (
        <Text style={styles.yieldEstimate}>
          ~${dailyYield.toFixed(3)}/day  •  ~${monthlyYield.toFixed(2)}/month
        </Text>
      )}

      {/* Total Earned Since Deposit */}
      {showTotalEarned && totalDeposited > 0 && totalEarned > 0 && (
        <View style={[styles.totalEarnedContainer, { backgroundColor: `${accentColor}15` }]}>
          <Text style={styles.totalEarnedLabel}>Total earned</Text>
          <Text style={[styles.totalEarnedValue, { color: accentColor }]}>
            +${totalEarned.toFixed(6)}
          </Text>
        </View>
      )}

      {/* APY indicator */}
      {isAnimating && apy > 0 && (
        <View style={styles.apyContainer}>
          <View style={[styles.apyDot, { backgroundColor: accentColor }]} />
          <Text style={[styles.apyText, { color: accentColor }]}>
            Earning {apy.toFixed(1)}% APY
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: COLORS.grey,
    marginBottom: 8,
  },
  balance: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'], // Monospace numbers for smooth animation
    letterSpacing: -0.5,
  },
  yieldEstimate: {
    fontSize: 13,
    color: COLORS.grey,
    marginTop: 6,
    letterSpacing: 0.2,
  },
  totalEarnedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  totalEarnedLabel: {
    fontSize: 13,
    color: COLORS.grey,
  },
  totalEarnedValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  apyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  apyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  apyText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
