#!/usr/bin/env node
/**
 * Check deposit data from backend API
 * Usage: node scripts/check-deposits.mjs <wallet-address>
 */

const API_BASE = 'https://x-yield-api.vercel.app';

async function checkDeposits(address) {
  if (!address) {
    console.error('Usage: node scripts/check-deposits.mjs <wallet-address>');
    console.error('Example: node scripts/check-deposits.mjs 0x1234...abcd');
    process.exit(1);
  }

  const normalizedAddress = address.toLowerCase();
  console.log('\n=== DEPOSIT TRACKER DEBUG ===\n');
  console.log('Wallet:', normalizedAddress);
  console.log('API:', `${API_BASE}/api/deposits/${normalizedAddress}`);
  console.log('');

  try {
    const response = await fetch(`${API_BASE}/api/deposits/${normalizedAddress}`);
    const data = await response.json();

    console.log('Backend Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');

    if (data.totalDeposited !== undefined) {
      console.log('Summary:');
      console.log(`  Total Deposited: $${data.totalDeposited.toFixed(6)}`);
      console.log(`  Last Updated: ${data.lastUpdated ? new Date(data.lastUpdated).toISOString() : 'never'}`);
    }
  } catch (error) {
    console.error('Error fetching from backend:', error.message);
  }

  console.log('\n=============================\n');
}

const address = process.argv[2];
checkDeposits(address);
