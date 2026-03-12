import React from 'react';
import { Alert, Linking } from 'react-native';
import { encodeFunctionData } from 'viem';
import { TOKENS } from '../constants/contracts';
import { openCoinbaseOfframp } from '../services/coinbaseOfframp';
import * as Analytics from '../services/analytics';
import { getErrorMessage } from '../utils/errorHelpers';

interface SmartWalletClient {
  sendTransaction: (tx: {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
  }) => Promise<string>;
}

export function useWithdrawModal(
  smartWalletClient: SmartWalletClient | undefined,
  displayAddress: string,
  cashBalance: number,
  refetchBalances: () => Promise<void>,
) {
  const [showWithdrawModal, setShowWithdrawModal] = React.useState(false);
  const [withdrawMethod, setWithdrawMethod] = React.useState<'select' | 'wallet' | 'bank'>(
    'select',
  );
  const [withdrawAddress, setWithdrawAddress] = React.useState('');
  const [withdrawAmount, setWithdrawAmount] = React.useState('');
  const [isWithdrawingCash, setIsWithdrawingCash] = React.useState(false);
  const [isCashingOut, setIsCashingOut] = React.useState(false);

  const openWithdrawModal = React.useCallback(() => {
    Analytics.trackButtonTap('Withdraw Cash', 'Dashboard');
    setShowWithdrawModal(true);
  }, []);

  const closeWithdrawModal = React.useCallback(() => {
    Analytics.trackModalClosed('Withdraw', 'button');
    setShowWithdrawModal(false);
    setWithdrawAddress('');
    setWithdrawAmount('');
    setWithdrawMethod('select');
  }, []);

  const executeWithdrawCash = async () => {
    if (!smartWalletClient || !displayAddress) {
      Alert.alert('Error', 'Wallet not connected');
      return;
    }

    setIsWithdrawingCash(true);

    try {
      const amount = parseFloat(withdrawAmount);
      const amountRaw = BigInt(Math.floor(amount * 1_000_000));

      const transferData = encodeFunctionData({
        abi: [
          {
            name: 'transfer',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          },
        ],
        functionName: 'transfer',
        args: [withdrawAddress as `0x${string}`, amountRaw],
      });

      const hash = await smartWalletClient.sendTransaction({
        to: TOKENS.USDC as `0x${string}`,
        data: transferData,
        value: BigInt(0),
      });

      closeWithdrawModal();
      refetchBalances();

      Alert.alert(
        'Sent Successfully!',
        `$${amount.toFixed(2)} USDC sent to ${withdrawAddress.slice(0, 6)}...${withdrawAddress.slice(-4)}`,
        [
          { text: 'OK' },
          {
            text: 'View on BaseScan',
            onPress: () => Linking.openURL(`https://basescan.org/tx/${hash}`),
          },
        ],
      );
    } catch (error) {
      Alert.alert('Failed', getErrorMessage(error) || 'Transaction failed. Please try again.');
    } finally {
      setIsWithdrawingCash(false);
    }
  };

  const handleWithdrawCashReview = () => {
    if (!withdrawAddress.startsWith('0x') || withdrawAddress.length !== 42) {
      Alert.alert('Invalid Address', 'Please enter a valid Ethereum address (0x...)');
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    if (amount > cashBalance) {
      Alert.alert('Insufficient Balance', `You only have $${cashBalance.toFixed(2)} available`);
      return;
    }

    Alert.alert(
      'Confirm Withdrawal',
      `Send: $${amount.toFixed(2)} USDC\nTo: ${withdrawAddress.slice(0, 6)}...${withdrawAddress.slice(-4)}\nNetwork: Base\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm & Send', onPress: executeWithdrawCash },
      ],
    );
  };

  const handleCashOutToBank = async () => {
    const amount = parseFloat(withdrawAmount);

    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    if (amount > cashBalance) {
      Alert.alert('Insufficient Balance', `You only have $${cashBalance.toFixed(2)} available`);
      return;
    }

    if (!displayAddress) {
      Alert.alert('Error', 'Wallet not connected');
      return;
    }

    Analytics.trackOfframpButtonTapped();
    Analytics.trackOfframpAmountEntered(withdrawAmount);
    Analytics.trackOfframpProviderOpened('Coinbase');

    setIsCashingOut(true);

    try {
      const result = await openCoinbaseOfframp(displayAddress, withdrawAmount);

      if (!result.success) {
        Analytics.trackOfframpError(result.error || 'Unknown error');
        Alert.alert(
          'Unable to Connect',
          result.error || 'Could not connect to Coinbase. Please try again later.',
          [{ text: 'OK' }],
        );
      } else {
        closeWithdrawModal();
        setTimeout(() => {
          refetchBalances();
        }, 2000);
      }
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      Analytics.trackOfframpError(errorMsg);
      Alert.alert('Error', errorMsg || 'Something went wrong');
    } finally {
      setIsCashingOut(false);
    }
  };

  return {
    showWithdrawModal,
    withdrawMethod,
    withdrawAddress,
    withdrawAmount,
    isWithdrawingCash,
    isCashingOut,
    setWithdrawMethod,
    setWithdrawAddress,
    setWithdrawAmount,
    setShowWithdrawModal,
    openWithdrawModal,
    closeWithdrawModal,
    handleWithdrawCashReview,
    handleCashOutToBank,
  };
}
