/**
 * SensitiveView Component
 * Wraps content that should be hidden from UXCam session recordings
 * Use for wallet addresses, balances, amounts, and other sensitive financial data
 */

import React, { useRef, useEffect } from 'react';
import { View, ViewProps, findNodeHandle } from 'react-native';
import RNUxcam from 'react-native-ux-cam';

interface SensitiveViewProps extends ViewProps {
  /** Whether occlusion is enabled (default: true) */
  enabled?: boolean;
  /** Children to wrap */
  children: React.ReactNode;
}

/**
 * Wrapper component that hides its contents from UXCam recordings
 *
 * Usage:
 * <SensitiveView>
 *   <Text>${balance}</Text>
 * </SensitiveView>
 */
const SensitiveView: React.FC<SensitiveViewProps> = ({
  enabled = true,
  children,
  style,
  ...props
}) => {
  const viewRef = useRef<View>(null);

  useEffect(() => {
    if (enabled && viewRef.current) {
      try {
        // Get the native node handle and occlude it
        const node = findNodeHandle(viewRef.current);
        if (node) {
          RNUxcam.occludeSensitiveView(viewRef.current);
        }
      } catch {
        // Silently fail - UXCam may not be initialized yet
      }
    }
  }, [enabled]);

  return (
    <View ref={viewRef} style={style} {...props}>
      {children}
    </View>
  );
};

export default SensitiveView;

/**
 * Higher-order component for wrapping sensitive screens or components
 */
export function withSensitiveOcclusion<P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.FC<P> {
  return function SensitiveWrapper(props: P) {
    return (
      <SensitiveView>
        <WrappedComponent {...props} />
      </SensitiveView>
    );
  };
}
