#!/usr/bin/env node
/**
 * Check live on-chain vault balances vs Blockscout deposit history
 * Usage: node scripts/check-live-balances.mjs <wallet-address>
 */

const RPC_URL = 'https://mainnet.base.org';
const BLOCKSCOUT_API = 'https://base.blockscout.com/api';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const VAULTS = {
  'Steakhouse High Yield': '0xbeeff7aE5E00Aae3Db302e4B0d8C883810a58100',
  'Re7 USDC': '0x618495ccC4e751178C4914b1E939C0fe0FB07b9b',
  'Steakhouse Prime': '0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9',
};

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

function hexToBigInt(hex) {
  if (!hex || hex === '0x' || hex === '0x0') return 0n;
  return BigInt(hex);
}

async function getVaultPosition(vaultAddress, userAddress) {
  const paddedAddr = userAddress.toLowerCase().replace('0x', '').padStart(64, '0');

  // balanceOf(address) → shares
  const sharesHex = await rpcCall('eth_call', [
    { to: vaultAddress, data: '0x70a08231' + paddedAddr },
    'latest',
  ]);
  const shares = hexToBigInt(sharesHex);

  if (shares === 0n) return { shares: 0n, assets: 0n, usdValue: 0 };

  // convertToAssets(shares) → USDC amount
  const paddedShares = shares.toString(16).padStart(64, '0');
  const assetsHex = await rpcCall('eth_call', [
    { to: vaultAddress, data: '0x07a2d13a' + paddedShares },
    'latest',
  ]);
  const assets = hexToBigInt(assetsHex);
  const usdValue = Number(assets) / 1e6;

  return { shares, assets, usdValue };
}

async function getBlockscoutTransfers(walletAddress) {
  const url = new URL(BLOCKSCOUT_API);
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', 'tokentx');
  url.searchParams.set('address', walletAddress);
  url.searchParams.set('contractaddress', USDC_ADDRESS);
  url.searchParams.set('startblock', '0');
  url.searchParams.set('endblock', '99999999');
  url.searchParams.set('sort', 'asc');

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== '1' || !Array.isArray(data.result)) return [];
  return data.result;
}

async function main() {
  const address = process.argv[2];
  if (!address) {
    console.error('Usage: node scripts/check-live-balances.mjs <wallet-address>');
    process.exit(1);
  }

  const addr = address.toLowerCase();
  const vaultAddrsSet = new Set(Object.values(VAULTS).map(v => v.toLowerCase()));

  console.log('\n═══════════════════════════════════════════');
  console.log('  LIVE ON-CHAIN BALANCE CHECK');
  console.log('═══════════════════════════════════════════');
  console.log('Wallet:', addr);
  console.log('Time:', new Date().toISOString());
  console.log('');

  // 1. Live vault positions
  console.log('── VAULT POSITIONS (live RPC) ──');
  let totalOnChain = 0;
  for (const [name, vaultAddr] of Object.entries(VAULTS)) {
    try {
      const pos = await getVaultPosition(vaultAddr, addr);
      console.log(`  ${name}: $${pos.usdValue.toFixed(6)} USDC`);
      if (pos.shares > 0n) {
        console.log(`    shares: ${pos.shares.toString()}`);
        console.log(`    assets: ${pos.assets.toString()} (raw)`);
      }
      totalOnChain += pos.usdValue;
    } catch (err) {
      console.error(`  ${name}: ERROR - ${err.message}`);
    }
  }
  console.log(`  ─────────────────────────`);
  console.log(`  TOTAL ON-CHAIN: $${totalOnChain.toFixed(6)}`);
  console.log('');

  // 2. USDC wallet balance
  console.log('── WALLET USDC BALANCE ──');
  try {
    const paddedAddr = addr.replace('0x', '').padStart(64, '0');
    const balHex = await rpcCall('eth_call', [
      { to: USDC_ADDRESS, data: '0x70a08231' + paddedAddr },
      'latest',
    ]);
    const usdcBal = Number(hexToBigInt(balHex)) / 1e6;
    console.log(`  USDC in wallet: $${usdcBal.toFixed(6)}`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }
  console.log('');

  // 3. Blockscout transaction history analysis
  console.log('── DEPOSIT/WITHDRAWAL HISTORY (Blockscout) ──');
  try {
    const transfers = await getBlockscoutTransfers(addr);
    console.log(`  Total USDC transfers: ${transfers.length}`);

    let cumulativeDeposited = 0;
    let cumulativeWithdrawn = 0;
    let currentDeposited = 0;
    let vaultBalance = 0;

    for (const tx of transfers) {
      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();
      const amount = Number(BigInt(tx.value || '0')) / 1e6;
      if (amount === 0) continue;

      const isFromWallet = from === addr;
      const isToWallet = to === addr;
      const isFromVault = vaultAddrsSet.has(from);
      const isToVault = vaultAddrsSet.has(to);

      if (isFromWallet && isToVault) {
        currentDeposited += amount;
        vaultBalance += amount;
        cumulativeDeposited += amount;
        const date = new Date(parseInt(tx.timeStamp) * 1000).toISOString().split('T')[0];
        console.log(`  [${date}] DEPOSIT  +$${amount.toFixed(2)} → cumDep=$${cumulativeDeposited.toFixed(2)}, balance=$${vaultBalance.toFixed(2)}`);
      } else if (isFromVault && isToWallet) {
        vaultBalance -= amount;
        cumulativeWithdrawn += amount;
        const date = new Date(parseInt(tx.timeStamp) * 1000).toISOString().split('T')[0];
        console.log(`  [${date}] WITHDRAW -$${amount.toFixed(2)} → cumWith=$${cumulativeWithdrawn.toFixed(2)}, balance=$${vaultBalance.toFixed(2)}`);
        if (vaultBalance < 1.0) {
          console.log(`  [RESET] Full withdrawal detected, currentDeposited reset 0`);
          currentDeposited = 0;
          vaultBalance = 0;
        }
      }
    }

    console.log('');
    console.log('── CALCULATED VALUES ──');
    console.log(`  currentDeposited (current cycle): $${currentDeposited.toFixed(6)}`);
    console.log(`  cumulativeDeposited (all-time):   $${cumulativeDeposited.toFixed(6)}`);
    console.log(`  cumulativeWithdrawn (all-time):   $${cumulativeWithdrawn.toFixed(6)}`);
    console.log('');
    console.log('── EARNINGS FORMULA ──');
    const earnings = Math.max(0, totalOnChain + cumulativeWithdrawn - cumulativeDeposited);
    console.log(`  earned = max(0, currentBalance + totalWithdrawn - cumulativeDeposited)`);
    console.log(`  earned = max(0, ${totalOnChain.toFixed(6)} + ${cumulativeWithdrawn.toFixed(6)} - ${cumulativeDeposited.toFixed(6)})`);
    console.log(`  earned = $${earnings.toFixed(6)}`);
    console.log('');
    console.log('── COMPARISON ──');
    console.log(`  On-chain balance:     $${totalOnChain.toFixed(6)}`);
    console.log(`  Current cycle dep:    $${currentDeposited.toFixed(6)}`);
    console.log(`  Difference (balance - currentDep): $${(totalOnChain - currentDeposited).toFixed(6)}`);
    console.log(`  Total earned (new formula):        $${earnings.toFixed(6)}`);

  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }

  console.log('\n═══════════════════════════════════════════\n');
}

main().catch(console.error);
