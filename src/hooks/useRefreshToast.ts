import React from 'react';
import { Animated } from 'react-native';

export function useRefreshToast() {
  const [showUpdatedToast, setShowUpdatedToast] = React.useState(false);
  const toastOpacity = React.useRef(new Animated.Value(0)).current;
  const toastTranslateY = React.useRef(new Animated.Value(-20)).current;

  const showRefreshToast = React.useCallback(() => {
    setShowUpdatedToast(true);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(-20);

    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: -20, duration: 300, useNativeDriver: true }),
      ]).start(() => setShowUpdatedToast(false));
    }, 2000);
  }, [toastOpacity, toastTranslateY]);

  return { showUpdatedToast, toastOpacity, toastTranslateY, showRefreshToast };
}
