/**
 * CSV Report Generation Service
 * Generates CSV exports for transaction history
 *
 * Unlike PDF export, CSV export works in all environments (dev and production)
 * because it uses expo-file-system and expo-sharing which are available everywhere.
 */

import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  TransactionHistoryResult,
  formatDateShort,
  getTransactionTypeLabel,
} from './transactionHistory';

/**
 * Check if CSV export is available
 * CSV export should work in all environments
 */
export async function isCsvExportAvailable(): Promise<boolean> {
  try {
    return await Sharing.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCSV(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate CSV content from transaction history
 */
function generateCSVContent(data: TransactionHistoryResult): string {
  const { transactions, summary, dateRange, walletAddress } = data;

  const lines: string[] = [];

  // Header section
  lines.push('Unflat Account Statement');
  lines.push(`Wallet,${escapeCSV(walletAddress)}`);
  lines.push(`Period,${formatDateShort(dateRange.from)} - ${formatDateShort(dateRange.to)}`);
  lines.push(`Generated,${formatDateShort(new Date())}`);
  lines.push('');

  // Summary section
  lines.push('SUMMARY');
  lines.push(`Invested (Net Deposited),${summary.totalDeposited.toFixed(2)}`);
  lines.push(`Current Balance,${summary.currentBalance.toFixed(2)}`);
  lines.push(`Realized Earnings,${summary.realizedEarnings.toFixed(2)}`);
  lines.push(`Unrealized Earnings,${summary.totalEarnings.toFixed(2)}`);
  lines.push(`Gross Yield Realized,${summary.grossYieldRealized.toFixed(2)}`);
  lines.push(`Total Fees Paid,${summary.totalFees.toFixed(2)}`);
  lines.push(`Transaction Count,${summary.transactionCount}`);
  lines.push('');

  // Transactions header
  lines.push('TRANSACTIONS');
  lines.push('Date,Type,Amount,Balance After,Vault,Transaction Hash');

  // Transaction rows
  for (const tx of transactions) {
    const amountPrefix = tx.type === 'deposit' ? '-' : tx.type === 'withdraw' ? '+' : '';
    lines.push([
      escapeCSV(formatDateShort(tx.timestamp)),
      escapeCSV(getTransactionTypeLabel(tx.type)),
      escapeCSV(`${amountPrefix}${tx.amount.toFixed(2)}`),
      escapeCSV(tx.balanceAfter !== undefined ? tx.balanceAfter.toFixed(2) : ''),
      escapeCSV(tx.vaultName || ''),
      escapeCSV(tx.txHash),
    ].join(','));
  }

  lines.push('');
  lines.push('Note: This report is for informational purposes only. DeFi yields may be taxed differently across jurisdictions. Consult a tax professional.');

  return lines.join('\n');
}

/**
 * Generate and share CSV report
 */
export async function generateCsvReport(
  data: TransactionHistoryResult
): Promise<{ success: boolean; error?: string; unavailable?: boolean }> {
  try {
    // Check if sharing is available
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return {
        success: false,
        unavailable: true,
        error: 'Sharing is not available on this device.',
      };
    }

    // Generate CSV content
    const csvContent = generateCSVContent(data);

    // Create filename with date
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `unflat-statement-${dateStr}.csv`;
    const fileUri = `${cacheDirectory}${filename}`;

    // Write to file (UTF-8 is the default encoding)
    await writeAsStringAsync(fileUri, csvContent);

    // Share the file
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: 'Save Statement',
      UTI: 'public.comma-separated-values-text',
    });

    return { success: true };
  } catch (error) {
    console.error('[CSVReport] Error:', error);
    return {
      success: false,
      error: 'Failed to generate CSV report. Please try again.',
    };
  }
}
