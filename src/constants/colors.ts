/**
 * Shared Color Palette
 * Consistent PayPal/Revolut-style colors used across the app
 */

export const COLORS = {
  // Primary brand colors
  primary: '#200191',
  secondary: '#6198FF',

  // Backgrounds
  white: '#F5F6FF',
  pureWhite: '#FFFFFF',
  black: '#00041B',
  overlay: 'rgba(0, 0, 0, 0.75)',

  // Text
  grey: '#484848',
  lightGrey: '#9CA3AF',

  // Borders
  border: '#E8E8E8',
  borderLight: '#E5E5E5',

  // Status colors
  success: '#22C55E',
  green: '#22c55e',
  error: '#EF4444',
  red: '#ef4444',
  amber: '#f59e0b',

  // UI states
  disabled: '#A0A0A0',
  locked: '#9CA3AF',
  progressBg: '#E5E7EB',
} as const;

export type ColorKey = keyof typeof COLORS;
