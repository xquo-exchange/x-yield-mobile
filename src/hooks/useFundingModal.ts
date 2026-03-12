import React from 'react';
import { Alert, AppState, AppStateStatus, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { openCoinbaseOnramp, getOnrampSessionUrl } from '../services/coinbaseOnramp';
import * as Analytics from '../services/analytics';
import { getErrorMessage } from '../utils/errorHelpers';

export function useFundingModal(
  displayAddress: string,
  refetchBalances: () => Promise<void>,
  refetchPositions: () => Promise<void>,
) {
  const [showFundingModal, setShowFundingModal] = React.useState(false);
  const [fundingView, setFundingView] = React.useState<'options' | 'receive'>('options');
  const [copied, setCopied] = React.useState(false);
  const [isBuyingUsdc, setIsBuyingUsdc] = React.useState(false);
  const [prefetchedOnrampUrl, setPrefetchedOnrampUrl] = React.useState<string | null>(null);
  const [isCheckingFunds, setIsCheckingFunds] = React.useState(false);
  const [wasInCoinbase, setWasInCoinbase] = React.useState(false);

  React.useEffect(() => {
    if (showFundingModal && displayAddress) {
      getOnrampSessionUrl(displayAddress).then((url) => {
        if (url) setPrefetchedOnrampUrl(url);
      });
    } else {
      setPrefetchedOnrampUrl(null);
    }
  }, [showFundingModal, displayAddress]);

  React.useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && wasInCoinbase) {
        setWasInCoinbase(false);
        setIsCheckingFunds(true);
        await new Promise((resolve) => setTimeout(resolve, 500));
        await Promise.all([refetchBalances(), refetchPositions()]);
        setIsCheckingFunds(false);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [wasInCoinbase, refetchBalances, refetchPositions]);

  const handleCopyAddress = React.useCallback(async () => {
    if (displayAddress) {
      await Clipboard.setStringAsync(displayAddress);
      Analytics.trackAddressCopied('Dashboard');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [displayAddress]);

  const handleBuyWithCard = async () => {
    if (isBuyingUsdc) return;
    if (!displayAddress) {
      Alert.alert('Error', 'No wallet address available');
      Analytics.trackOnrampError('No wallet address');
      return;
    }

    Analytics.trackOnrampButtonTapped();
    Analytics.trackOnrampProviderOpened('Coinbase');

    const urlToOpen = prefetchedOnrampUrl;
    setShowFundingModal(false);
    setIsBuyingUsdc(true);

    try {
      if (urlToOpen) {
        setWasInCoinbase(true);
        await Linking.openURL(urlToOpen);
      } else {
        setWasInCoinbase(true);
        await openCoinbaseOnramp(displayAddress);
      }
    } catch (error) {
      Analytics.trackOnrampError(getErrorMessage(error));
      Alert.alert('Error', 'Could not open payment provider');
    } finally {
      setIsBuyingUsdc(false);
    }
  };

  const openFundingModal = React.useCallback(() => {
    Analytics.trackButtonTap('Add Funds', 'Dashboard');
    setShowFundingModal(true);
  }, []);

  const closeFundingModal = React.useCallback(() => {
    Analytics.trackModalClosed('AddFunds', 'button');
    setShowFundingModal(false);
    setFundingView('options');
  }, []);

  return {
    showFundingModal,
    fundingView,
    copied,
    isBuyingUsdc,
    isCheckingFunds,
    setFundingView,
    setShowFundingModal,
    openFundingModal,
    closeFundingModal,
    handleCopyAddress,
    handleBuyWithCard,
  };
}
