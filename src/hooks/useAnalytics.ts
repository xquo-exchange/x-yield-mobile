/**
 * useAnalytics Hook
 * Convenient React hook for analytics tracking
 */

import { useCallback, useRef, useEffect } from 'react';
import * as Analytics from '../services/analytics';

interface UseAnalyticsOptions {
  screenName?: string;
}

export function useAnalytics(options: UseAnalyticsOptions = {}) {
  const { screenName } = options;
  const screenEnterTime = useRef<number>(0);
  const hasTrackedView = useRef(false);

  // Track screen view on mount
  useEffect(() => {
    if (screenName && !hasTrackedView.current) {
      screenEnterTime.current = Date.now();
      Analytics.trackScreenView(screenName);
      hasTrackedView.current = true;
    }

    return () => {
      if (screenName) {
        Analytics.trackScreenExit(screenName);
        hasTrackedView.current = false;
      }
    };
  }, [screenName]);

  // Generic track function
  const track = useCallback((eventName: string, properties?: Record<string, unknown>) => {
    Analytics.track(eventName, {
      ...properties,
      screen: screenName,
    });
  }, [screenName]);

  // Button tap tracking
  const trackButton = useCallback((buttonName: string, extraProps?: Record<string, unknown>) => {
    Analytics.trackButtonTap(buttonName, screenName || 'unknown', extraProps);
  }, [screenName]);

  // Input tracking
  const trackInput = useCallback((fieldName: string, action: 'focus' | 'change' | 'submit', valueLength?: number) => {
    const screen = screenName || 'unknown';
    switch (action) {
      case 'focus':
        Analytics.trackInputFocused(fieldName, screen);
        break;
      case 'change':
        Analytics.trackInputChanged(fieldName, valueLength || 0, screen);
        break;
      case 'submit':
        Analytics.trackInputSubmitted(fieldName, screen);
        break;
    }
  }, [screenName]);

  // Modal tracking
  const trackModal = useCallback((modalName: string, action: 'open' | 'close', dismissMethod?: 'button' | 'swipe' | 'backdrop' | 'back') => {
    if (action === 'open') {
      Analytics.trackModalOpened(modalName);
    } else {
      Analytics.trackModalClosed(modalName, dismissMethod || 'button');
    }
  }, []);

  // Error tracking
  const trackError = useCallback((errorType: string, message: string) => {
    Analytics.trackErrorDisplayed(errorType, message, screenName || 'unknown');
  }, [screenName]);

  // Performance timing
  const startTimer = useCallback(() => {
    return Analytics.createTimer();
  }, []);

  // API call tracking with timing
  const trackApiCall = useCallback(async <T>(
    endpoint: string,
    apiCall: () => Promise<T>
  ): Promise<T> => {
    const timer = Analytics.createTimer();
    try {
      const result = await apiCall();
      Analytics.trackApiCallDuration(endpoint, timer.stop(), true);
      return result;
    } catch (error) {
      Analytics.trackApiCallDuration(endpoint, timer.stop(), false);
      throw error;
    }
  }, []);

  return {
    track,
    trackButton,
    trackInput,
    trackModal,
    trackError,
    startTimer,
    trackApiCall,
    // Re-export commonly used functions
    trackScreenView: Analytics.trackScreenView,
    trackBalanceRefreshed: Analytics.trackBalanceRefreshed,
    trackBalanceTap: Analytics.trackBalanceTap,
    // Deposit funnel
    trackDepositScreenOpened: Analytics.trackDepositScreenOpened,
    trackDepositAmountEntered: Analytics.trackDepositAmountEntered,
    trackDepositMaxTapped: Analytics.trackDepositMaxTapped,
    trackDepositButtonTapped: Analytics.trackDepositButtonTapped,
    trackDepositConfirmationShown: Analytics.trackDepositConfirmationShown,
    trackDepositConfirmed: Analytics.trackDepositConfirmed,
    trackDepositTxPending: Analytics.trackDepositTxPending,
    trackDepositTxSuccess: Analytics.trackDepositTxSuccess,
    trackDepositTxFailed: Analytics.trackDepositTxFailed,
    // Withdraw funnel
    trackWithdrawScreenOpened: Analytics.trackWithdrawScreenOpened,
    trackWithdrawAmountEntered: Analytics.trackWithdrawAmountEntered,
    trackWithdrawMaxTapped: Analytics.trackWithdrawMaxTapped,
    trackWithdrawButtonTapped: Analytics.trackWithdrawButtonTapped,
    trackWithdrawConfirmationShown: Analytics.trackWithdrawConfirmationShown,
    trackWithdrawConfirmed: Analytics.trackWithdrawConfirmed,
    trackWithdrawTxPending: Analytics.trackWithdrawTxPending,
    trackWithdrawTxSuccess: Analytics.trackWithdrawTxSuccess,
    trackWithdrawTxFailed: Analytics.trackWithdrawTxFailed,
    // Onramp funnel
    trackOnrampButtonTapped: Analytics.trackOnrampButtonTapped,
    trackOnrampAmountSelected: Analytics.trackOnrampAmountSelected,
    trackOnrampProviderOpened: Analytics.trackOnrampProviderOpened,
    trackOnrampCompleted: Analytics.trackOnrampCompleted,
    trackOnrampCancelled: Analytics.trackOnrampCancelled,
    trackOnrampError: Analytics.trackOnrampError,
    // Offramp funnel
    trackOfframpButtonTapped: Analytics.trackOfframpButtonTapped,
    trackOfframpAmountEntered: Analytics.trackOfframpAmountEntered,
    trackOfframpProviderOpened: Analytics.trackOfframpProviderOpened,
    trackOfframpCompleted: Analytics.trackOfframpCompleted,
    trackOfframpCancelled: Analytics.trackOfframpCancelled,
    trackOfframpError: Analytics.trackOfframpError,
    // Auth
    trackLoginScreenOpened: Analytics.trackLoginScreenOpened,
    trackLoginEmailEntered: Analytics.trackLoginEmailEntered,
    trackLoginOtpRequested: Analytics.trackLoginOtpRequested,
    trackLoginOtpEntered: Analytics.trackLoginOtpEntered,
    trackLoginSuccess: Analytics.trackLoginSuccess,
    trackLoginFailed: Analytics.trackLoginFailed,
    trackLogout: Analytics.trackLogout,
    // Wallet
    trackWalletConnected: Analytics.trackWalletConnected,
    trackWalletDisconnected: Analytics.trackWalletDisconnected,
    trackWalletError: Analytics.trackWalletError,
    // Vault/Strategy
    trackVaultViewed: Analytics.trackVaultViewed,
    trackStrategySelected: Analytics.trackStrategySelected,
    trackPositionViewed: Analytics.trackPositionViewed,
    // Navigation
    trackTabSwitched: Analytics.trackTabSwitched,
    trackBackButtonTapped: Analytics.trackBackButtonTapped,
    // Clipboard
    trackAddressCopied: Analytics.trackAddressCopied,
    trackQrCodeShown: Analytics.trackQrCodeShown,
    // User identity
    identifyUser: Analytics.identifyUser,
    setUserProperties: Analytics.setUserProperties,
    setSuperProperties: Analytics.setSuperProperties,
  };
}

export default useAnalytics;
