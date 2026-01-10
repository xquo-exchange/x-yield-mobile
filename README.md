# unflat

A non-custodial yield account mobile app built with React Native, Expo, and Privy authentication.

## Brand Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | `#200191` | Buttons, logos, key accents |
| Secondary | `#6198FF` | APY badges, links, highlights |
| White | `#F5F6FF` | Background |
| Grey | `#484848` | Secondary text, icons |
| Black | `#00041B` | Primary text, headers |

Deposit USDC into curated Morpho vault strategies on Base chain with gasless transactions powered by Account Abstraction.

## Features

- **Email Login** - Simple passwordless authentication via Privy
- **Smart Wallets** - ERC-4337 Account Abstraction wallets
- **Gas Sponsorship** - All transactions are gas-free for users (via Pimlico paymaster)
- **Add Funds** - Receive USDC via QR code or buy on Coinbase
- **Real APY** - Live APY fetched from Morpho API (not hardcoded)
- **Morpho Vaults** - Deposit into curated USDC lending strategies
- **Multi-Vault Allocation** - Single transaction splits deposits across multiple vaults
- **Position Tracking** - Real-time view of vault positions and USD values
- **Withdraw All** - One-tap withdrawal from all vault positions
- **Performance Fee** - 15% fee on yield only (not principal)
- **Deposit History** - Tracks deposits to calculate accurate yield
- **Yield Calculation** - Shows profit/loss before withdrawal
- **Real-time Balances** - View ETH and USDC balances on Base chain

## Fee Structure

unflat uses a **performance fee model** - we only take a cut of your profits, never your principal.

### How It Works

| Component | Fee |
|-----------|-----|
| Deposits | **Free** |
| Withdrawals (principal) | **Free** |
| Withdrawals (yield/profit) | **15%** |
| Gas fees | **Sponsored** (free) |

### Example

```
You deposit:     $100 USDC
After 1 month:   $110 USDC (grew 10%)
Yield earned:    $10 USDC

Performance fee: 15% × $10 = $1.50
You receive:     $108.50
```

### Key Points

- **No fee on your principal** - Only profits are subject to fees
- **No fee if you're at a loss** - If your position decreased in value, no fee is charged
- **Transparent** - Fee breakdown shown before every withdrawal
- **Atomic** - Fee transfer happens in the same transaction as withdrawal

### Treasury

Performance fees are sent to the unflat treasury:
`0xC33F9253E59eaC5713bb6e8C2Cb8Ecb9567FF31d`

## Verified On-Chain Transactions

The app has been tested end-to-end on Base mainnet:

| Action | Transaction | Block |
|--------|-------------|-------|
| Deposit to 3 vaults | [0x43efeb9d...](https://basescan.org/tx/0x43efeb9da9099190f36c7ca79bc38bcbe921353771690db0eecda0ce827f1ae7) | 40458963 |
| Deposit (second) | [0xa73d50d4...](https://basescan.org/tx/0xa73d50d43b1a1326a55ee48f2a4c98d81171b7bf13aaa041b16730f717c163bb) | 40459581 |
| Withdraw (no fee) | [0x197c9449...](https://basescan.org/tx/0x197c94496f1ecae304f12c75a59cffa7075b09049fd9a824c68c1141f0a8d81a) | 40459760 |
| Withdraw with fee | [0x06156001...](https://basescan.org/tx/0x061560016861c2da4498d9fcc0398278629b4537bb2db00bdd9aae5516306e82) | 40461010 |

## Tech Stack

- **React Native** + **Expo** (SDK 54)
- **TypeScript**
- **Privy** - Authentication & embedded wallets
- **Account Abstraction** - ERC-4337 smart wallets
- **Pimlico** - Bundler & paymaster for gas sponsorship
- **Base** - L2 blockchain (Coinbase)
- **Morpho** - DeFi lending protocol (ERC-4626 vaults)
- **AsyncStorage** - Local deposit history persistence
- **viem** - Ethereum library

## Project Structure

```
unflat-mobile/
├── App.tsx                     # App entry point with Privy providers
├── src/
│   ├── constants/
│   │   ├── contracts.ts        # Contract addresses, ABIs, fee config
│   │   └── strategies.ts       # Morpho vault configurations
│   ├── hooks/
│   │   ├── useWalletBalance.ts # Balance fetching hook
│   │   ├── usePositions.ts     # Vault positions hook
│   │   └── useVaultApy.ts      # Real APY from Morpho API
│   ├── navigation/
│   │   └── AppNavigator.tsx    # React Navigation setup
│   ├── screens/
│   │   ├── WelcomeScreen.tsx   # Onboarding carousel
│   │   ├── LoginScreen.tsx     # Email login screen
│   │   ├── DashboardScreen.tsx # Main dashboard with Cash & Savings
│   │   └── StrategiesScreen.tsx # Manage Funds (Deposit/Withdraw)
│   └── services/
│       ├── blockchain.ts       # RPC calls for balances & positions
│       ├── coinbaseOnramp.ts   # Coinbase Onramp integration
│       ├── depositTracker.ts   # Deposit history & yield calculation
│       ├── morphoApi.ts        # Morpho API for real APY data
│       └── strategyExecution.ts # Transaction building & execution
├── app.json                    # Expo config
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
git clone https://github.com/your-org/unflat-mobile.git
cd unflat-mobile
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

### Add Funds Flow
1. User taps "Add Funds" on Dashboard
2. Two options: "Buy USDC" or "Receive from Wallet"
3. Buy USDC → Opens Coinbase to purchase USDC
4. Receive → Shows QR code and wallet address
5. User sends USDC on Base network to the address

### Deposit Flow
1. User enters USDC amount on Strategies screen
2. App calculates allocation across 3 Morpho vaults
3. Builds batch transaction: 3 approvals + 3 deposits
4. Sends via Privy smart wallet (gasless via Pimlico paymaster)
5. Waits for on-chain confirmation
6. Records deposit amount for yield tracking
7. Updates positions display

### Withdraw Flow
1. User taps "Withdraw All" button in positions section
2. App calculates yield: `current_value - total_deposited`
3. If yield > 0: calculates 15% performance fee
4. Shows confirmation with full breakdown:
   - Your deposits
   - Current value
   - Yield earned (%)
   - Performance fee
   - You receive
5. Builds batch: redeem calls + fee transfer (if applicable)
6. Sends via smart wallet (gasless)
7. USDC returns to wallet balance

### Morpho Vaults (Conservative USDC Strategy)

| Vault | Address | Allocation |
|-------|---------|------------|
| Steakhouse High Yield USD | `0xbEef...b83B` | 40% |
| Re7 USDC | `0x12AF...FbD9` | 35% |
| Steakhouse Prime USDC | `0xbEEf...1Ab0` | 25% |

APY is fetched live from Morpho API (typically 4-7% depending on market conditions).

## What's Working

- [x] Email authentication via Privy
- [x] Smart wallet creation (ERC-4337)
- [x] Gas sponsorship via Pimlico paymaster
- [x] Add Funds modal with QR code
- [x] Buy USDC via Coinbase link
- [x] Real APY from Morpho API
- [x] USDC deposits to Morpho vaults
- [x] Multi-vault allocation in single transaction
- [x] Position tracking with real-time balances
- [x] Withdraw all positions
- [x] Performance fee on yield (15%)
- [x] Deposit history tracking (AsyncStorage)
- [x] Yield calculation with full USDC precision (6 decimals)
- [x] Fee-free withdrawal when no profits
- [x] ETH/USDC wallet balance display
- [x] Pull-to-refresh for balances
- [x] Transaction retry logic for nonce errors
- [x] RPC fallback and rate limit handling

## Future Development

- [ ] Multiple strategy options (moderate, aggressive)
- [ ] Individual vault withdrawal
- [ ] Price oracle integration for accurate APY
- [ ] Push notifications for yield updates
- [ ] Transaction history
- [ ] Biometric authentication
- [ ] Testnet mode toggle

## License

MIT

## Links

- [Privy Documentation](https://docs.privy.io)
- [Pimlico Documentation](https://docs.pimlico.io)
- [Morpho Documentation](https://docs.morpho.org)
- [Base Documentation](https://docs.base.org)
