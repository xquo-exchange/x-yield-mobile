# X-Yield Mobile

A DeFi yield optimization mobile app built with React Native, Expo, and Privy authentication. Deposit USDC into curated Morpho vault strategies on Base chain with gasless transactions powered by Account Abstraction.

## Features

- **Email Login** - Simple passwordless authentication via Privy
- **Smart Wallets** - ERC-4337 Account Abstraction wallets
- **Gas Sponsorship** - All transactions are gas-free for users (via Pimlico paymaster)
- **Morpho Vaults** - Deposit into curated USDC lending strategies
- **Multi-Vault Allocation** - Single transaction splits deposits across multiple vaults
- **Real-time Balances** - View ETH and USDC balances on Base chain

## Tech Stack

- **React Native** + **Expo** (SDK 52)
- **TypeScript**
- **Privy** - Authentication & embedded wallets
- **Account Abstraction** - ERC-4337 smart wallets
- **Pimlico** - Bundler & paymaster for gas sponsorship
- **Base** - L2 blockchain (Coinbase)
- **Morpho** - DeFi lending protocol
- **viem** - Ethereum library

## Project Structure

```
x-yield-mobile/
├── App.tsx                 # App entry point with Privy providers
├── src/
│   ├── constants/
│   │   ├── contracts.ts    # Contract addresses and ABIs
│   │   └── strategies.ts   # Morpho vault configurations
│   ├── hooks/
│   │   └── useWalletBalance.ts  # Balance fetching hook
│   ├── navigation/
│   │   └── AppNavigator.tsx     # React Navigation setup
│   ├── screens/
│   │   ├── WelcomeScreen.tsx    # Login screen
│   │   ├── DashboardScreen.tsx  # Main dashboard
│   │   └── StrategiesScreen.tsx # Deposit UI
│   └── services/
│       ├── blockchain.ts        # RPC calls for balances
│       └── strategyExecution.ts # Transaction building
├── app.json                # Expo config
└── package.json
```

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator
- Privy account at [console.privy.io](https://console.privy.io)
- Pimlico account at [dashboard.pimlico.io](https://dashboard.pimlico.io)

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/xquo-exchange/x-yield-mobile.git
cd x-yield-mobile
npm install
```

### 2. Configure Privy Dashboard

1. Go to [console.privy.io](https://console.privy.io)
2. Create a new app or select existing
3. Copy your **App ID** and **Client ID**
4. Update `App.tsx` with your credentials:

```typescript
<PrivyProvider
  appId="YOUR_APP_ID"
  clientId="YOUR_CLIENT_ID"
  ...
>
```

### 3. Enable Smart Wallets in Privy

1. In Privy Dashboard, go to **Smart Wallets**
2. Enable smart wallets for **Base** chain
3. Under "Paymaster", add your Pimlico paymaster URL:

```
https://api.pimlico.io/v2/8453/rpc?apikey=YOUR_PIMLICO_API_KEY
```

### 4. Get Pimlico API Key

1. Go to [dashboard.pimlico.io](https://dashboard.pimlico.io)
2. Create a new project
3. Copy your API key
4. Add funds to sponsor gas (or use testnet first)

### 5. Run the App

```bash
# Start Expo
npx expo start

# Run on iOS Simulator
npx expo run:ios

# Run on Android Emulator
npx expo run:android
```

## Environment Variables

Create a `.env` file (see `.env.example`):

```env
PRIVY_APP_ID=your_privy_app_id
PRIVY_CLIENT_ID=your_privy_client_id
PIMLICO_API_KEY=your_pimlico_api_key
```

> Note: Currently credentials are hardcoded in `App.tsx`. Update to use environment variables for production.

## How It Works

### Authentication Flow
1. User enters email on Welcome screen
2. Privy sends magic link / OTP
3. On login, Privy creates an embedded wallet
4. Smart wallet (AA) is derived from embedded wallet

### Deposit Flow
1. User enters USDC amount on Strategies screen
2. App calculates allocation across 3 Morpho vaults
3. Builds batch transaction: 3 approvals + 3 deposits
4. Sends via Privy smart wallet (gasless via Pimlico paymaster)
5. Waits for on-chain confirmation
6. Shows success with transaction hash

### Morpho Vaults (Conservative USDC Strategy)

| Vault | Allocation | APY |
|-------|------------|-----|
| Gauntlet USDC Prime | 40% | 5.2% |
| Steakhouse USDC | 35% | 5.8% |
| Re7 USDC | 25% | 4.9% |

## Known Issues / TODO

- [ ] Position tracking (show deposited amounts)
- [ ] Withdraw functionality
- [ ] Multiple strategy options
- [ ] Price oracle integration
- [ ] Push notifications
- [ ] Transaction history
- [ ] Biometric authentication

## License

MIT

## Links

- [Privy Documentation](https://docs.privy.io)
- [Pimlico Documentation](https://docs.pimlico.io)
- [Morpho Documentation](https://docs.morpho.org)
- [Base Documentation](https://docs.base.org)
