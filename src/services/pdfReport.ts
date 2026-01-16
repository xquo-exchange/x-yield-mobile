/**
 * PDF Report Generation Service
 * Generates account statements for transaction history and capital gains calculation
 *
 * Note: PDF export requires native builds with expo-print and expo-sharing.
 * These features are disabled in development builds to prevent crashes.
 */

import { TransactionHistoryResult } from './transactionHistory';

/**
 * Check if PDF export is available
 * Currently disabled - will be enabled in production builds
 */
export async function isPdfExportAvailable(): Promise<boolean> {
  // PDF export is disabled in dev builds to prevent crashes
  // Will be enabled when running a production/preview build via EAS
  if (__DEV__) {
    return false;
  }

  // In production, check if native module exists
  try {
    const ExpoModules = require('expo-modules-core');
    return !!ExpoModules.NativeModulesProxy?.ExpoPrint;
  } catch {
    return false;
  }
}

/**
 * Generate and display PDF report
 */
export async function generateTaxReport(
  data: TransactionHistoryResult
): Promise<{ success: boolean; error?: string; unavailable?: boolean }> {
  // In development mode, return unavailable immediately
  // This avoids any module loading issues
  if (__DEV__) {
    return {
      success: false,
      unavailable: true,
      error: 'PDF export is available in production builds only.',
    };
  }

  // Production build - use eval to hide require from Metro's static analysis
  // This ensures the require is only evaluated at runtime, not bundle time
  try {
    // eslint-disable-next-line no-eval
    const Print = eval("require('expo-print')");
    // eslint-disable-next-line no-eval
    const Sharing = eval("require('expo-sharing')");

    const html = generateReportHTML(data);
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save Statement',
        UTI: 'com.adobe.pdf',
      });
    } else {
      await Print.printAsync({ uri });
    }

    return { success: true };
  } catch (error) {
    console.error('[PDFReport] Error:', error);
    return {
      success: false,
      unavailable: true,
      error: 'PDF export failed. Please try again.',
    };
  }
}

/**
 * Preview PDF in print dialog
 */
export async function previewTaxReport(
  data: TransactionHistoryResult
): Promise<{ success: boolean; error?: string; unavailable?: boolean }> {
  if (__DEV__) {
    return {
      success: false,
      unavailable: true,
      error: 'PDF preview is available in production builds only.',
    };
  }

  try {
    // eslint-disable-next-line no-eval
    const Print = eval("require('expo-print')");
    const html = generateReportHTML(data);
    await Print.printAsync({ html });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: 'Failed to preview report',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTML GENERATION (kept for production builds)
// ═══════════════════════════════════════════════════════════════════════════════

import {
  formatCurrency,
  formatDateShort,
  getTransactionTypeLabel,
} from './transactionHistory';

const COLORS = {
  primary: '#200191',
  secondary: '#6198FF',
  black: '#00041B',
  grey: '#484848',
  lightGrey: '#E8E8E8',
  white: '#FFFFFF',
  green: '#22c55e',
  red: '#ef4444',
};

function generateReportHTML(data: TransactionHistoryResult): string {
  const { transactions, summary, dateRange, walletAddress } = data;

  const fromDate = formatDateShort(dateRange.from);
  const toDate = formatDateShort(dateRange.to);
  const generatedDate = formatDateShort(new Date());
  const shortWallet = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

  const transactionRows = transactions
    .map((tx, index) => {
      const typeColor =
        tx.type === 'deposit'
          ? COLORS.green
          : tx.type === 'withdraw'
          ? COLORS.red
          : COLORS.secondary;

      const amountPrefix = tx.type === 'deposit' ? '+' : tx.type === 'withdraw' ? '-' : '+';

      return `
        <tr style="background-color: ${index % 2 === 0 ? '#FAFAFA' : '#FFFFFF'};">
          <td style="padding: 10px; border-bottom: 1px solid ${COLORS.lightGrey};">
            ${formatDateShort(tx.timestamp)}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid ${COLORS.lightGrey};">
            <span style="color: ${typeColor}; font-weight: 600;">
              ${getTransactionTypeLabel(tx.type)}
            </span>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid ${COLORS.lightGrey}; text-align: right;">
            <span style="color: ${typeColor};">
              ${amountPrefix}${formatCurrency(tx.amount)}
            </span>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid ${COLORS.lightGrey}; text-align: right;">
            ${tx.balanceAfter !== undefined ? formatCurrency(tx.balanceAfter) : '-'}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid ${COLORS.lightGrey}; font-size: 10px; color: ${COLORS.grey};">
            ${tx.vaultName || '-'}
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Unflat Account Statement</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: ${COLORS.black};
            line-height: 1.5;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 2px solid ${COLORS.primary};
          }
          .logo { font-size: 28px; font-weight: 700; color: ${COLORS.primary}; letter-spacing: -0.5px; }
          .logo-sub { font-size: 12px; color: ${COLORS.grey}; margin-top: 4px; }
          .report-info { text-align: right; font-size: 12px; color: ${COLORS.grey}; }
          .report-title { font-size: 24px; font-weight: 700; color: ${COLORS.black}; margin-bottom: 8px; }
          .section { margin-bottom: 32px; }
          .section-title {
            font-size: 16px;
            font-weight: 600;
            color: ${COLORS.primary};
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid ${COLORS.lightGrey};
          }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .info-item { background: #F8F8FC; padding: 16px; border-radius: 8px; }
          .info-label { font-size: 12px; color: ${COLORS.grey}; margin-bottom: 4px; }
          .info-value { font-size: 18px; font-weight: 600; color: ${COLORS.black}; }
          .info-value.positive { color: ${COLORS.green}; }
          .summary-box {
            background: linear-gradient(135deg, ${COLORS.primary} 0%, #4B0082 100%);
            color: white;
            padding: 24px;
            border-radius: 12px;
            margin-bottom: 32px;
          }
          .summary-title { font-size: 14px; opacity: 0.9; margin-bottom: 8px; }
          .summary-value { font-size: 32px; font-weight: 700; }
          .summary-subtitle { font-size: 12px; opacity: 0.8; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th {
            background: ${COLORS.primary};
            color: white;
            padding: 12px 10px;
            text-align: left;
            font-weight: 600;
          }
          th:nth-child(3), th:nth-child(4) { text-align: right; }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid ${COLORS.lightGrey};
            font-size: 10px;
            color: ${COLORS.grey};
            text-align: center;
          }
          .disclaimer {
            background: #FFF8E6;
            border: 1px solid #FFD666;
            border-radius: 8px;
            padding: 16px;
            margin-top: 24px;
            font-size: 11px;
            color: #996600;
          }
          .disclaimer-title { font-weight: 600; margin-bottom: 8px; }
          .no-transactions { text-align: center; padding: 40px; color: ${COLORS.grey}; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">unflat</div>
            <div class="logo-sub">DeFi Yield Platform</div>
          </div>
          <div class="report-info">
            <div class="report-title">Account Statement</div>
            <div>Period: ${fromDate} - ${toDate}</div>
            <div>Generated: ${generatedDate}</div>
            <div>Wallet: ${shortWallet}</div>
          </div>
        </div>

        <div class="summary-box">
          <div class="summary-title">Realized Earnings (Taxable)</div>
          <div class="summary-value">${formatCurrency(summary.realizedEarnings)}</div>
          <div class="summary-subtitle">
            Gross Yield: ${formatCurrency(summary.grossYieldRealized)} |
            Fees Paid: ${formatCurrency(summary.totalFees)}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Account Summary</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Invested (Net Deposited)</div>
              <div class="info-value">${formatCurrency(summary.totalDeposited)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Current Balance</div>
              <div class="info-value">${formatCurrency(summary.currentBalance)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Realized Earnings</div>
              <div class="info-value positive">+${formatCurrency(summary.realizedEarnings)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Unrealized Earnings</div>
              <div class="info-value">${formatCurrency(summary.totalEarnings)}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Transaction History (${summary.transactionCount} transactions)</div>
          ${
            transactions.length > 0
              ? `
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Balance After</th>
                  <th>Vault</th>
                </tr>
              </thead>
              <tbody>
                ${transactionRows}
              </tbody>
            </table>
          `
              : `<div class="no-transactions">No transactions found for this period.</div>`
          }
        </div>

        <div class="disclaimer">
          <div class="disclaimer-title">Important Tax Disclaimer</div>
          <p>
            This report is provided for informational purposes only and should not be considered
            tax advice. DeFi yield may be classified differently across jurisdictions (interest income,
            capital gains, etc.). Please consult with a qualified tax professional regarding your
            specific tax obligations. Unflat is not responsible for any tax liabilities arising from
            the use of this platform.
          </p>
        </div>

        <div class="footer">
          <p>Generated by Unflat | Base Chain (Chain ID: 8453)</p>
          <p>Wallet: ${walletAddress}</p>
          <p>This document is for informational purposes only.</p>
        </div>
      </body>
    </html>
  `;
}
