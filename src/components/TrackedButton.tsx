/**
 * TrackedButton Component
 * A TouchableOpacity wrapper that automatically tracks button taps
 */

import React, { useCallback } from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { trackButtonTap } from '../services/analytics';

interface TrackedButtonProps extends TouchableOpacityProps {
  /** Name of the button for analytics (required) */
  trackingName: string;
  /** Screen where the button is located */
  screen: string;
  /** Additional properties to track */
  trackingProps?: Record<string, unknown>;
  /** Button text (optional, can also use children) */
  title?: string;
  /** Text style */
  textStyle?: TextStyle;
  /** Show loading indicator */
  loading?: boolean;
  /** Loading indicator color */
  loadingColor?: string;
  /** Variant style */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
}

const TrackedButton: React.FC<TrackedButtonProps> = ({
  trackingName,
  screen,
  trackingProps,
  title,
  textStyle,
  loading = false,
  loadingColor = '#FFFFFF',
  variant = 'primary',
  style,
  onPress,
  disabled,
  children,
  ...props
}) => {
  const handlePress = useCallback((event: any) => {
    // Track the button tap
    trackButtonTap(trackingName, screen, {
      ...trackingProps,
      disabled: !!disabled,
      loading: !!loading,
    });

    // Call original onPress if not disabled/loading
    if (onPress && !disabled && !loading) {
      onPress(event);
    }
  }, [trackingName, screen, trackingProps, onPress, disabled, loading]);

  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case 'primary':
        return styles.primaryButton;
      case 'secondary':
        return styles.secondaryButton;
      case 'outline':
        return styles.outlineButton;
      case 'ghost':
        return styles.ghostButton;
      default:
        return styles.primaryButton;
    }
  };

  const getTextVariantStyles = (): TextStyle => {
    switch (variant) {
      case 'primary':
        return styles.primaryText;
      case 'secondary':
        return styles.secondaryText;
      case 'outline':
        return styles.outlineText;
      case 'ghost':
        return styles.ghostText;
      default:
        return styles.primaryText;
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        getVariantStyles(),
        disabled && styles.disabled,
        style,
      ]}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={loadingColor} size="small" />
      ) : children ? (
        children
      ) : title ? (
        <Text style={[styles.text, getTextVariantStyles(), textStyle]}>
          {title}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  text: {
    fontSize: 18,
    fontWeight: '700',
  },
  // Primary variant (default)
  primaryButton: {
    backgroundColor: '#200191',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  // Secondary variant
  secondaryButton: {
    backgroundColor: '#6198FF',
  },
  secondaryText: {
    color: '#FFFFFF',
  },
  // Outline variant
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#200191',
  },
  outlineText: {
    color: '#200191',
  },
  // Ghost variant
  ghostButton: {
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: '#6198FF',
  },
  // Disabled state
  disabled: {
    opacity: 0.5,
  },
});

export default TrackedButton;
