/**
 * Transaction History Screen
 * Displays transaction history and allows PDF tax report generation
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
  Linking,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEmbeddedEthereumWallet } from '@privy-io/expo';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';

import { RootStackParamList } from '../navigation/AppNavigator';
import { usePositions } from '../hooks/usePositions';
import {
  fetchTransactionHistory,
  fetchTransactionHistoryWithCache,
  getDateRangePreset,
  groupTransactionsForDisplay,
  TransactionHistoryResult,
  Transaction,
  TransactionType,
  TransactionDisplayItem,
  GroupedTransaction,
  formatCurrency,
  formatDate,
  getTransactionTypeLabel,
  getTransactionTypeColor,
  getGroupedTransactionLabel,
  getAddressLabel,
  shortenTxHash,
  getBaseScanTxUrl,
} from '../services/transactionHistory';
import { generateTaxReport, isPdfExportAvailable } from '../services/pdfReport';
import * as Analytics from '../services/analytics';

// Color Palette
const COLORS = {
  primary: '#200191',
  secondary: '#6198FF',
  white: '#F5F6FF',
  grey: '#484848',
  black: '#00041B',
  pureWhite: '#FFFFFF',
  border: '#E8E8E8',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
};

type TransactionHistoryScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TransactionHistory'>;
};

type DateRangePreset = 'this_year' | 'last_year' | 'all_time';

export default function TransactionHistoryScreen({
  navigation,
}: TransactionHistoryScreenProps) {
  const { wallets } = useEmbeddedEthereumWallet();
  const { client: smartWalletClient } = useSmartWallets();
  const embeddedWallet = wallets?.[0];
  const smartWalletAddress = smartWalletClient?.account?.address;
  const eoaAddress = embeddedWallet?.address;
  const walletAddress = smartWalletAddress || eoaAddress;

  // If using smart wallet, the EOA is "internal" (transfers between them aren't external)
  const otherOwnedAddress = smartWalletAddress && eoaAddress ? eoaAddress : undefined;

  const { totalUsdValue } = usePositions(walletAddress);

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isPdfAvailable, setIsPdfAvailable] = useState<boolean | null>(null);
  const [historyData, setHistoryData] = useState<TransactionHistoryResult | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<DateRangePreset>('this_year');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TransactionDisplayItem | null>(null);

  // Get grouped transactions for display
  const displayItems = historyData
    ? groupTransactionsForDisplay(historyData.transactions)
    : [];

  // Open transaction in BaseScan
  const openInBaseScan = (txHash: string) => {
    const url = getBaseScanTxUrl(txHash);
    Linking.openURL(url).catch(err => {
      console.error('Failed to open URL:', err);
      Alert.alert('Error', 'Could not open BaseScan');
    });
  };

  // Calculate current balance from positions (convert string to number)
  const currentBalance = parseFloat(totalUsdValue) || 0;

  // Fetch transaction history with caching
  const fetchHistory = useCallback(async (forceRefresh: boolean = false) => {
    if (!walletAddress) return;

    const dateRange = getDateRangePreset(selectedPreset);

    try {
      if (forceRefresh) {
        // Force refresh: bypass cache, show loading
        const data = await fetchTransactionHistory(
          walletAddress,
          dateRange,
          currentBalance,
          true, // forceRefresh
          otherOwnedAddress // EOA address to treat as internal
        );
        setHistoryData(data);
      } else {
        // Normal load: show cached data immediately, refresh in background
        setIsBackgroundRefreshing(true);
        const cachedResult = await fetchTransactionHistoryWithCache(
          walletAddress,
          dateRange,
          currentBalance,
          (freshData) => {
            // Callback when fresh data is ready
            setHistoryData(freshData);
            setIsBackgroundRefreshing(false);
          },
          otherOwnedAddress // EOA address to treat as internal
        );

        if (cachedResult) {
          // Show cached data immediately
          setHistoryData(cachedResult);
          setIsLoading(false);
        } else {
          // No cache, wait for fresh data
          // The callback will update historyData when ready
        }
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      Alert.alert('Error', 'Failed to load transaction history');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [walletAddress, selectedPreset, currentBalance, otherOwnedAddress]);

  // Initial load
  useEffect(() => {
    Analytics.trackScreenView('TransactionHistory');
    fetchHistory();

    // Check if PDF export is available (async)
    isPdfExportAvailable().then(setIsPdfAvailable);

    return () => Analytics.trackScreenExit('TransactionHistory');
  }, [fetchHistory]);

  // Handle refresh (pull-to-refresh forces fresh data)
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchHistory(true); // forceRefresh = true
    Analytics.track('transaction_history_refreshed');
  }, [fetchHistory]);

  // Handle date preset change (force refresh for new date range)
  const handlePresetChange = (preset: DateRangePreset) => {
    if (preset === selectedPreset) return;
    setSelectedPreset(preset);
    setIsLoading(true);
    setHistoryData(null); // Clear old data while loading new range
    Analytics.track('date_range_changed', { preset });
  };

  // Handle PDF generation
  const handleGeneratePdf = async () => {
    if (!historyData) return;

    // Check if PDF is available first
    if (isPdfAvailable === false) {
      Alert.alert(
        'Not Available',
        'PDF export is only available in production builds. Install the app from TestFlight or the App Store to use this feature.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsGeneratingPdf(true);
    Analytics.track('statement_export_started', {
      transaction_count: historyData.transactions.length,
      date_range: selectedPreset,
    });

    try {
      const result = await generateTaxReport(historyData);

      if (result.success) {
        Analytics.track('statement_exported', {
          transaction_count: historyData.transactions.length,
        });
      } else if (result.unavailable) {
        // Native module not available
        setIsPdfAvailable(false);
        Alert.alert(
          'Not Available',
          'PDF export is only available in production builds. Install the app from TestFlight or the App Store to use this feature.',
          [{ text: 'OK' }]
        );
        Analytics.track('statement_export_unavailable');
      } else {
        Alert.alert('Error', result.error || 'Failed to generate statement');
        Analytics.track('statement_export_failed', {
          error: result.error,
        });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to generate PDF statement');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Get icon for transaction type
  const getTransactionIcon = (type: TransactionType) => {
    switch (type) {
      case 'receive':
        return 'arrow-down'; // Money coming in from external
      case 'send':
        return 'arrow-up'; // Money going out to external
      case 'deposit':
        return 'trending-up'; // Moving to savings (yield)
      case 'withdraw':
        return 'trending-down'; // Taking from savings
      default:
        return 'swap-horizontal';
    }
  };

  // Render a single transaction item
  const renderSingleTransaction = (tx: Transaction, index: number) => {
    const typeColor = getTransactionTypeColor(tx.type);
    const isMoneyIn = tx.type === 'receive' || tx.type === 'withdraw';

    return (
      <TouchableOpacity
        key={tx.id}
        style={[
          styles.transactionItem,
          index === 0 && styles.transactionItemFirst,
        ]}
        onPress={() => setSelectedItem({ ...tx, isGrouped: false })}
        activeOpacity={0.7}
      >
        <View style={styles.transactionLeft}>
          <View
            style={[
              styles.transactionIcon,
              { backgroundColor: typeColor + '20' },
            ]}
          >
            <Ionicons name={getTransactionIcon(tx.type)} size={16} color={typeColor} />
          </View>
          <View style={styles.transactionInfo}>
            <Text style={styles.transactionType}>
              {getTransactionTypeLabel(tx.type)}
            </Text>
            <Text style={styles.transactionDate}>{formatDate(tx.timestamp)}</Text>
            {tx.vaultName && (
              <Text style={styles.transactionVault}>{tx.vaultName}</Text>
            )}
          </View>
        </View>
        <View style={styles.transactionRight}>
          <Text style={[styles.transactionAmount, { color: typeColor }]}>
            {isMoneyIn ? '+' : '-'}
            {formatCurrency(tx.amount)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.grey} />
        </View>
      </TouchableOpacity>
    );
  };

  // Render a grouped transaction
  const renderGroupedTransaction = (group: GroupedTransaction, index: number) => {
    const typeColor = getTransactionTypeColor(group.type);
    const isMoneyIn = group.type === 'withdraw';

    return (
      <TouchableOpacity
        key={group.id}
        style={[
          styles.transactionItem,
          index === 0 && styles.transactionItemFirst,
        ]}
        onPress={() => setSelectedItem(group)}
        activeOpacity={0.7}
      >
        <View style={styles.transactionLeft}>
          <View
            style={[
              styles.transactionIcon,
              { backgroundColor: typeColor + '20' },
            ]}
          >
            <Ionicons
              name={group.type === 'deposit' ? 'layers' : 'layers-outline'}
              size={16}
              color={typeColor}
            />
          </View>
          <View style={styles.transactionInfo}>
            <Text style={styles.transactionType}>
              {getGroupedTransactionLabel(group.type)}
            </Text>
            <Text style={styles.transactionDate}>{formatDate(group.timestamp)}</Text>
            <Text style={styles.transactionVault}>
              {group.transactions.length} vaults
            </Text>
          </View>
        </View>
        <View style={styles.transactionRight}>
          <Text style={[styles.transactionAmount, { color: typeColor }]}>
            {isMoneyIn ? '+' : '-'}
            {formatCurrency(group.totalAmount)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.grey} />
        </View>
      </TouchableOpacity>
    );
  };

  // Render any transaction display item
  const renderTransactionItem = (item: TransactionDisplayItem, index: number) => {
    if (item.isGrouped) {
      return renderGroupedTransaction(item as GroupedTransaction, index);
    }
    return renderSingleTransaction(item as Transaction, index);
  };

  // Render compact summary bar at top (two columns: INVESTED and REALIZED)
  //
  // Tax-accounting perspective:
  // - INVESTED: net deposited to vaults (deposits - withdrawals) = cost basis
  // - REALIZED: net yield already withdrawn (taxable income)
  //
  // Unrealized yield (vault balance - invested) is NOT shown because:
  // - It's not yet taxable (no realization event)
  // - It's still compounding in the vaults
  const renderSummaryBar = () => {
    if (!historyData) return null;

    const { summary } = historyData;

    // Check if data is still loading (no transactions yet)
    const isDataLoading = summary.transactionCount === 0 && currentBalance === 0;

    // Use pre-calculated values from summary (ensures consistency with PDF export)
    // - INVESTED: summary.totalDeposited (net deposited to vaults)
    // - REALIZED: summary.realizedEarnings (gross yield - fees)

    // Format realized earnings with + sign if positive
    const formatRealized = (amount: number): string => {
      if (amount === 0) return '$0.00';
      return `+${formatCurrency(amount)}`;
    };

    // Get realized color: green if positive, neutral if zero
    const getRealizedStyle = () => {
      if (isDataLoading) return {}; // neutral while loading
      if (summary.realizedEarnings > 0) return styles.positive;
      return {}; // neutral color (default black) for $0
    };

    return (
      <View style={styles.summaryBar}>
        <View style={styles.summaryBarItem}>
          <Text style={styles.summaryBarLabel}>Invested</Text>
          <Text style={styles.summaryBarValue}>
            {isDataLoading ? '---' : formatCurrency(summary.totalDeposited)}
          </Text>
        </View>
        <View style={styles.summaryBarDivider} />
        <View style={styles.summaryBarItem}>
          <Text style={styles.summaryBarLabel}>Realized</Text>
          <Text style={[styles.summaryBarValue, getRealizedStyle()]}>
            {isDataLoading ? '---' : formatRealized(summary.realizedEarnings)}
          </Text>
        </View>
      </View>
    );
  };

  // Render export button at bottom
  const renderExportButton = () => {
    if (!historyData || historyData.transactions.length === 0) return null;

    const isDisabled = isGeneratingPdf || isPdfAvailable === false;

    return (
      <TouchableOpacity
        style={[
          styles.exportButtonBottom,
          isPdfAvailable === false && styles.exportButtonDisabled,
        ]}
        onPress={handleGeneratePdf}
        disabled={isGeneratingPdf}
      >
        {isGeneratingPdf ? (
          <ActivityIndicator size="small" color={COLORS.pureWhite} />
        ) : (
          <>
            <Ionicons
              name={isPdfAvailable === false ? 'cloud-offline-outline' : 'document-text-outline'}
              size={20}
              color={isPdfAvailable === false ? COLORS.grey : COLORS.pureWhite}
            />
            <Text
              style={[
                styles.exportButtonBottomText,
                isPdfAvailable === false && styles.exportButtonDisabledText,
              ]}
            >
              {isPdfAvailable === false ? 'PDF Export (Production Only)' : 'Export PDF Statement'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Statements</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Date Range Selector */}
      <View style={styles.dateSelector}>
        {(['this_year', 'last_year', 'all_time'] as DateRangePreset[]).map(
          (preset) => (
            <TouchableOpacity
              key={preset}
              style={[
                styles.dateOption,
                selectedPreset === preset && styles.dateOptionActive,
              ]}
              onPress={() => handlePresetChange(preset)}
            >
              <Text
                style={[
                  styles.dateOptionText,
                  selectedPreset === preset && styles.dateOptionTextActive,
                ]}
              >
                {preset === 'this_year'
                  ? 'This Year'
                  : preset === 'last_year'
                  ? 'Last Year'
                  : 'All Time'}
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading transactions...</Text>
          </View>
        ) : (
          <>
            {/* Compact Summary Bar */}
            {renderSummaryBar()}

            {/* Background refresh indicator */}
            {isBackgroundRefreshing && historyData && (
              <View style={styles.backgroundRefreshIndicator}>
                <ActivityIndicator size="small" color={COLORS.secondary} />
                <Text style={styles.backgroundRefreshText}>Updating...</Text>
              </View>
            )}

            {/* Transactions List */}
            <View style={styles.transactionsContainer}>
              {displayItems.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="receipt-outline"
                    size={48}
                    color={COLORS.grey}
                  />
                  <Text style={styles.emptyStateTitle}>No activity yet</Text>
                  <Text style={styles.emptyStateText}>
                    Your transactions will appear here once you make your first deposit.
                  </Text>
                </View>
              ) : (
                <View style={styles.transactionsList}>
                  {displayItems.map((item, index) =>
                    renderTransactionItem(item, index)
                  )}
                </View>
              )}
            </View>

            {/* Export Button at Bottom */}
            {renderExportButton()}

            {/* Disclaimer */}
            {historyData && historyData.transactions.length > 0 && (
              <View style={styles.disclaimer}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={COLORS.amber}
                />
                <Text style={styles.disclaimerText}>
                  DeFi yields may be taxed as interest income or capital gains depending on your jurisdiction.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Transaction Detail Modal (Bottom Sheet) */}
      <Modal
        visible={selectedItem !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedItem(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedItem(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <View style={styles.modalHandle} />

            {/* Close button */}
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setSelectedItem(null)}
            >
              <Ionicons name="close" size={24} color={COLORS.grey} />
            </TouchableOpacity>

            {selectedItem && (
              <>
                {/* Header with icon and amount */}
                <View style={styles.modalHeader}>
                  <View
                    style={[
                      styles.modalIcon,
                      {
                        backgroundColor:
                          getTransactionTypeColor(
                            selectedItem.isGrouped ? selectedItem.type : (selectedItem as Transaction).type
                          ) + '20',
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        selectedItem.isGrouped
                          ? selectedItem.type === 'deposit'
                            ? 'layers'
                            : 'layers-outline'
                          : getTransactionIcon((selectedItem as Transaction).type)
                      }
                      size={28}
                      color={getTransactionTypeColor(
                        selectedItem.isGrouped ? selectedItem.type : (selectedItem as Transaction).type
                      )}
                    />
                  </View>
                  <Text style={styles.modalTitle}>
                    {selectedItem.isGrouped
                      ? getGroupedTransactionLabel(selectedItem.type)
                      : getTransactionTypeLabel((selectedItem as Transaction).type)}
                  </Text>
                  <Text
                    style={[
                      styles.modalAmount,
                      {
                        color: getTransactionTypeColor(
                          selectedItem.isGrouped ? selectedItem.type : (selectedItem as Transaction).type
                        ),
                      },
                    ]}
                  >
                    {selectedItem.isGrouped
                      ? (selectedItem.type === 'withdraw' ? '+' : '-')
                      : ((selectedItem as Transaction).type === 'receive' ||
                         (selectedItem as Transaction).type === 'withdraw'
                          ? '+'
                          : '-')}
                    {formatCurrency(
                      selectedItem.isGrouped
                        ? selectedItem.totalAmount
                        : (selectedItem as Transaction).amount
                    )}
                  </Text>
                </View>

                {/* Details */}
                <View style={styles.modalDetails}>
                  {/* Date */}
                  <View style={styles.modalDetailRow}>
                    <Text style={styles.modalDetailLabel}>Date</Text>
                    <Text style={styles.modalDetailValue}>
                      {formatDate(
                        selectedItem.isGrouped
                          ? selectedItem.timestamp
                          : (selectedItem as Transaction).timestamp
                      )}
                    </Text>
                  </View>

                  {/* Vault breakdown for grouped, or From/To for single */}
                  {selectedItem.isGrouped ? (
                    <>
                      <View style={styles.modalDivider} />
                      <Text style={styles.modalSectionTitle}>Vault Breakdown</Text>
                      {selectedItem.transactions.map((tx) => (
                        <View key={tx.id} style={styles.modalVaultRow}>
                          <Text style={styles.modalVaultName}>{tx.vaultName}</Text>
                          <Text style={styles.modalVaultAmount}>
                            {formatCurrency(tx.amount)}
                          </Text>
                        </View>
                      ))}
                    </>
                  ) : (
                    <>
                      {/* From/To address */}
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>
                          {(selectedItem as Transaction).type === 'receive' ||
                           (selectedItem as Transaction).type === 'withdraw'
                            ? 'From'
                            : 'To'}
                        </Text>
                        <Text style={styles.modalDetailValue}>
                          {(selectedItem as Transaction).type === 'receive'
                            ? getAddressLabel((selectedItem as Transaction).fromAddress)
                            : (selectedItem as Transaction).type === 'send'
                            ? getAddressLabel((selectedItem as Transaction).toAddress)
                            : (selectedItem as Transaction).vaultName || 'Vault'}
                        </Text>
                      </View>
                    </>
                  )}

                  {/* Transaction hash */}
                  <View style={styles.modalDivider} />
                  <TouchableOpacity
                    style={styles.modalDetailRow}
                    onPress={() => {
                      const txHash = selectedItem.isGrouped
                        ? selectedItem.transactions[0]?.txHash
                        : (selectedItem as Transaction).txHash;
                      if (txHash) openInBaseScan(txHash);
                    }}
                  >
                    <Text style={styles.modalDetailLabel}>Transaction</Text>
                    <View style={styles.modalTxHashRow}>
                      <Text style={styles.modalTxHash}>
                        {shortenTxHash(
                          selectedItem.isGrouped
                            ? selectedItem.transactions[0]?.txHash || ''
                            : (selectedItem as Transaction).txHash
                        )}
                      </Text>
                      <Ionicons name="open-outline" size={14} color={COLORS.secondary} />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* View on BaseScan button */}
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => {
                    const txHash = selectedItem.isGrouped
                      ? selectedItem.transactions[0]?.txHash
                      : (selectedItem as Transaction).txHash;
                    if (txHash) openInBaseScan(txHash);
                  }}
                >
                  <Text style={styles.modalButtonText}>View on BaseScan</Text>
                  <Ionicons name="open-outline" size={16} color={COLORS.pureWhite} />
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: COLORS.pureWhite,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
  },
  headerRight: {
    width: 40,
  },
  dateSelector: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.pureWhite,
    gap: 8,
  },
  dateOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    alignItems: 'center',
  },
  dateOptionActive: {
    backgroundColor: COLORS.primary,
  },
  dateOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.grey,
  },
  dateOptionTextActive: {
    color: COLORS.pureWhite,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.grey,
  },
  // Summary Bar (compact)
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.pureWhite,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryBarItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryBarDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },
  summaryBarLabel: {
    fontSize: 11,
    color: COLORS.grey,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryBarValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.black,
  },
  positive: {
    color: COLORS.green,
  },
  negative: {
    color: COLORS.red,
  },
  // Background refresh indicator
  backgroundRefreshIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 8,
    gap: 8,
  },
  backgroundRefreshText: {
    fontSize: 12,
    color: COLORS.secondary,
  },
  // Export Button (bottom)
  exportButtonBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 16,
    gap: 8,
  },
  exportButtonBottomText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
  exportButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  exportButtonDisabledText: {
    color: COLORS.grey,
  },
  transactionsContainer: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 16,
  },
  transactionsList: {
    gap: 0,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  transactionItemFirst: {
    borderTopWidth: 0,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
  },
  transactionDate: {
    fontSize: 12,
    color: COLORS.grey,
    marginTop: 2,
  },
  transactionVault: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 2,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  transactionBalance: {
    fontSize: 11,
    color: COLORS.grey,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.grey,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  disclaimer: {
    flexDirection: 'row',
    backgroundColor: '#FFF8E6',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#996600',
    lineHeight: 18,
  },
  // Bottom Sheet Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.pureWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: Dimensions.get('window').height * 0.7,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  modalClose: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 4,
  },
  modalAmount: {
    fontSize: 28,
    fontWeight: '700',
  },
  modalDetails: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalDetailLabel: {
    fontSize: 14,
    color: COLORS.grey,
  },
  modalDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
  },
  modalDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.grey,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
  },
  modalVaultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  modalVaultName: {
    fontSize: 14,
    color: COLORS.black,
  },
  modalVaultAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
  },
  modalTxHashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalTxHash: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.pureWhite,
  },
});
