import { usePrivy, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';

export function useWalletAddress() {
  const { user, logout } = usePrivy();
  const embeddedWallet = useEmbeddedEthereumWallet();
  const { client: smartWalletClient } = useSmartWallets();

  const wallets = embeddedWallet?.wallets || [];
  const embeddedWalletAddress = wallets.length > 0 ? wallets[0].address : '';
  const smartWalletFromHook = smartWalletClient?.account?.address || '';
  const smartWalletAccount = user?.linked_accounts?.find(
    (account) => account.type === 'smart_wallet',
  ) as { address?: string } | undefined;
  const smartWalletFromLinkedAccounts = smartWalletAccount?.address || '';
  const smartWalletAddress = smartWalletFromHook || smartWalletFromLinkedAccounts;
  const displayAddress = smartWalletAddress || embeddedWalletAddress;

  return { user, logout, smartWalletClient, displayAddress };
}
