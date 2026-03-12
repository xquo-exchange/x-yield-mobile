import React from 'react';
import { Alert } from 'react-native';
import { encodeFunctionData, parseUnits } from 'viem';
import { TOKENS } from '../constants/contracts';
import { useDeepLink } from '../contexts/DeepLinkContext';
import * as Analytics from '../services/analytics';
import { getErrorMessage } from '../utils/errorHelpers';

interface SmartWalletClient {
  sendTransaction: (tx: { to: `0x${string}`; data: `0x${string}` }) => Promise<string>;
}

export function useOfframpTransfer(
  smartWalletClient: SmartWalletClient | undefined,
  refetchBalances: () => Promise<void>,
) {
  const [showOfframpTransfer, setShowOfframpTransfer] = React.useState(false);
  const [offrampParams, setOfframpParams] = React.useState<{
    toAddress: string;
    amount: string;
    expiresAt: string;
  } | null>(null);
  const [isOfframpProcessing, setIsOfframpProcessing] = React.useState(false);

  const { pendingOfframp, clearPendingOfframp } = useDeepLink();

  React.useEffect(() => {
    if (pendingOfframp) {
      if (pendingOfframp.expiresAt && new Date(pendingOfframp.expiresAt) < new Date()) {
        Alert.alert('Expired', 'The cash out window has expired (30 min). Please try again.');
        clearPendingOfframp();
        return;
      }

      setOfframpParams({
        toAddress: pendingOfframp.toAddress,
        amount: pendingOfframp.amount,
        expiresAt: pendingOfframp.expiresAt,
      });
      setShowOfframpTransfer(true);
      clearPendingOfframp();
    }
  }, [pendingOfframp, clearPendingOfframp]);

  const handleOfframpTransfer = async () => {
    if (!offrampParams || !smartWalletClient) return;

    setIsOfframpProcessing(true);

    try {
      const amountInUnits = parseUnits(offrampParams.amount, 6);

      const data = encodeFunctionData({
        abi: [
          {
            name: 'transfer',
            type: 'function',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ type: 'bool' }],
          },
        ],
        functionName: 'transfer',
        args: [offrampParams.toAddress as `0x${string}`, amountInUnits],
      });

      await smartWalletClient.sendTransaction({
        to: TOKENS.USDC as `0x${string}`,
        data,
      });

      Alert.alert(
        'Transfer Complete!',
        'Your USDC has been sent to Coinbase. EUR will arrive in your bank in 1-2 business days.',
        [{ text: 'OK', onPress: () => setShowOfframpTransfer(false) }],
      );

      refetchBalances();
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      Analytics.trackErrorDisplayed('offramp_transfer', errorMessage, 'Dashboard');
      Alert.alert('Transfer Failed', errorMessage || 'Something went wrong');
    } finally {
      setIsOfframpProcessing(false);
    }
  };

  return {
    showOfframpTransfer,
    offrampParams,
    isOfframpProcessing,
    setShowOfframpTransfer,
    handleOfframpTransfer,
  };
}
