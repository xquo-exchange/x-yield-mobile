# CLAUDE.md

## Project Overview

Unflat (unflat.finance) is a non-custodial savings wallet for retail users in Europe (based in Italy). Users deposit euros and earn 4-7% APY. They have zero crypto knowledge — they should never see wallets, gas, transactions, or token names.

## How It Works

1. User deposits euros via bank transfer / on-ramp
2. Euros are converted to USDC
3. USDC is deposited into Morpho Protocol (overcollateralized lending) on **Base**
4. User earns yield, displayed as simple APY in euros
5. User withdraws anytime — USDC back to euros, back to bank

## Architecture

- **Chain**: Base (Coinbase L2)
- **Yield source**: Morpho Protocol — we interact with Morpho contracts directly, no custom smart contracts
- **Account Abstraction (ERC-4337)**: Each user gets a smart account. This abstracts away seed phrases, gas payments, and transaction signing. We use AA for transaction batching (multiple actions in one UserOperation)
- **Non-custodial**: Unflat never holds user funds. Each user's smart account owns their position on Morpho directly. We are an interface layer only
- **Frontend**: React Native (mobile app)
- **Revenue model**: We take a fee (% of yield generated). The user sees a net APY after our fee

## Key Principles

- **User sees no crypto**: No wallet addresses, no token names, no gas fees, no transaction hashes in the UI. Everything is abstracted into familiar banking language (deposit, savings, withdraw, earnings)
- **Non-custodial is non-negotiable**: We never take custody of user funds. All interactions happen through the user's own smart account
- **Simplicity over features**: We do one thing — savings. No trading, no tokens, no DeFi features
- **Transparency**: Users can verify their funds on-chain via a public link, but they don't have to

## Current Limitations

- No deposit protection / insurance — this is our biggest product gap and the #1 user objection ("what if something goes wrong?")
- No custom smart contracts — we rely entirely on Morpho's contracts plus AA infrastructure

## Code Conventions

- Mobile app is React Native
- Use TypeScript throughout
- Keep code modular — AA logic, Morpho interactions, and UI should be cleanly separated
- Comments in English

## When Working on This Codebase

- Always consider the end user is non-technical. Any feature must be expressible in simple language
- Any on-chain interaction should be batchable via AA UserOperations
- Test against Base network (use Base Sepolia for testnet)
- Morpho docs: https://docs.morpho.org
- Base docs: https://docs.base.org
