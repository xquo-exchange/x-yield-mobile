/**
 * Settings Screen
 * Allows users to manage app settings including notifications
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePrivy } from '@privy-io/expo';
import { useSmartWallets } from '@privy-io/expo/smart-wallets';
import { useEmbeddedEthereumWallet } from '@privy-io/expo';

import { RootStackParamList } from '../navigation/AppNavigator';
import { useNotificationContext } from '../contexts/NotificationContext';

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

type SettingsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { logout } = usePrivy();
  const { wallets } = useEmbeddedEthereumWallet();
  const { client: smartWalletClient } = useSmartWallets();

  const embeddedWallet = wallets?.[0];
  const smartWalletAddress = smartWalletClient?.account?.address;
  const eoaAddress = embeddedWallet?.address;
  const walletAddress = smartWalletAddress || eoaAddress;

  const notifications = useNotificationContext();

  const [isUpdating, setIsUpdating] = useState(false);

  // Handle notification toggle
  const handleNotificationToggle = useCallback(async (enabled: boolean) => {
    if (!walletAddress) return;

    setIsUpdating(true);
    try {
      if (enabled) {
        // Enable notifications - request permissions and register
        const success = await notifications.registerForPushNotifications(walletAddress);
        if (!success && notifications.permissionStatus === 'denied') {
          Alert.alert(
            'Permissions Required',
            'Please enable notifications in your device settings to receive updates about your transactions.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => notifications.openSettings() },
            ]
          );
        }
      } else {
        // Disable notifications
        await notifications.updatePreferences(walletAddress, {
          ...notifications.preferences,
          enabled: false,
        });
      }
    } finally {
      setIsUpdating(false);
    }
  }, [walletAddress, notifications]);

  // Handle deposit notifications toggle
  const handleDepositToggle = useCallback(async (enabled: boolean) => {
    if (!walletAddress) return;

    setIsUpdating(true);
    try {
      await notifications.updatePreferences(walletAddress, {
        ...notifications.preferences,
        deposits: enabled,
      });
    } finally {
      setIsUpdating(false);
    }
  }, [walletAddress, notifications]);

  // Handle withdrawal notifications toggle
  const handleWithdrawalToggle = useCallback(async (enabled: boolean) => {
    if (!walletAddress) return;

    setIsUpdating(true);
    try {
      await notifications.updatePreferences(walletAddress, {
        ...notifications.preferences,
        withdrawals: enabled,
      });
    } finally {
      setIsUpdating(false);
    }
  }, [walletAddress, notifications]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            // Unregister from notifications before logout
            if (walletAddress && notifications.isRegistered) {
              await notifications.unregisterFromPushNotifications(walletAddress);
            }
            await logout();
          },
        },
      ]
    );
  }, [logout, walletAddress, notifications]);

  // Get permission status text
  const getPermissionStatusText = (): string => {
    switch (notifications.permissionStatus) {
      case 'granted':
        return 'Enabled';
      case 'denied':
        return 'Denied - Tap to open settings';
      case 'undetermined':
        return 'Not requested';
      default:
        return 'Unknown';
    }
  };

  // Check if notifications are effectively enabled
  const areNotificationsEnabled =
    notifications.permissionStatus === 'granted' &&
    notifications.preferences.enabled &&
    notifications.isRegistered;

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
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.card}>
            {/* Main notification toggle */}
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: COLORS.primary + '20' }]}>
                  <Ionicons name="notifications-outline" size={20} color={COLORS.primary} />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Push Notifications</Text>
                  <Text style={styles.settingDescription}>
                    {getPermissionStatusText()}
                  </Text>
                </View>
              </View>
              <View style={styles.settingRight}>
                {isUpdating || notifications.isLoading ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : notifications.permissionStatus === 'denied' ? (
                  <TouchableOpacity
                    style={styles.openSettingsButton}
                    onPress={() => notifications.openSettings()}
                  >
                    <Text style={styles.openSettingsText}>Open</Text>
                  </TouchableOpacity>
                ) : (
                  <Switch
                    value={areNotificationsEnabled}
                    onValueChange={handleNotificationToggle}
                    trackColor={{ false: COLORS.border, true: COLORS.primary + '80' }}
                    thumbColor={areNotificationsEnabled ? COLORS.primary : COLORS.grey}
                    ios_backgroundColor={COLORS.border}
                  />
                )}
              </View>
            </View>

            {/* Sub-settings (only show if main toggle is on) */}
            {areNotificationsEnabled && (
              <>
                <View style={styles.divider} />

                {/* Deposit notifications */}
                <View style={styles.settingRow}>
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIcon, { backgroundColor: COLORS.green + '20' }]}>
                      <Ionicons name="arrow-down" size={20} color={COLORS.green} />
                    </View>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingTitle}>Deposit Alerts</Text>
                      <Text style={styles.settingDescription}>
                        Get notified when deposits complete
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={notifications.preferences.deposits}
                    onValueChange={handleDepositToggle}
                    trackColor={{ false: COLORS.border, true: COLORS.green + '80' }}
                    thumbColor={notifications.preferences.deposits ? COLORS.green : COLORS.grey}
                    ios_backgroundColor={COLORS.border}
                    disabled={isUpdating}
                  />
                </View>

                <View style={styles.divider} />

                {/* Withdrawal notifications */}
                <View style={styles.settingRow}>
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIcon, { backgroundColor: COLORS.secondary + '20' }]}>
                      <Ionicons name="arrow-up" size={20} color={COLORS.secondary} />
                    </View>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingTitle}>Withdrawal Alerts</Text>
                      <Text style={styles.settingDescription}>
                        Get notified when withdrawals complete
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={notifications.preferences.withdrawals}
                    onValueChange={handleWithdrawalToggle}
                    trackColor={{ false: COLORS.border, true: COLORS.secondary + '80' }}
                    thumbColor={notifications.preferences.withdrawals ? COLORS.secondary : COLORS.grey}
                    ios_backgroundColor={COLORS.border}
                    disabled={isUpdating}
                  />
                </View>
              </>
            )}
          </View>

          {/* Info banner if notifications are disabled system-wide */}
          {notifications.permissionStatus === 'denied' && (
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle" size={20} color={COLORS.amber} />
              <Text style={styles.infoBannerText}>
                Notifications are disabled in your device settings. Tap "Open" to enable them.
              </Text>
            </View>
          )}
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.card}>
            {/* Achievements */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => navigation.navigate('Dashboard')}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: COLORS.amber + '20' }]}>
                  <Ionicons name="trophy-outline" size={20} color={COLORS.amber} />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Achievements</Text>
                  <Text style={styles.settingDescription}>View your badges and progress</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Statements */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => navigation.navigate('TransactionHistory')}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: COLORS.secondary + '20' }]}>
                  <Ionicons name="document-text-outline" size={20} color={COLORS.secondary} />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Statements</Text>
                  <Text style={styles.settingDescription}>View transaction history and reports</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.grey} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Version info */}
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.grey,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
  },
  settingDescription: {
    fontSize: 13,
    color: COLORS.grey,
    marginTop: 2,
  },
  settingRight: {
    marginLeft: 12,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 68,
  },
  openSettingsButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openSettingsText: {
    color: COLORS.pureWhite,
    fontSize: 14,
    fontWeight: '600',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E6',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    gap: 12,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#996600',
    lineHeight: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.pureWhite,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.red,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.grey,
    marginTop: 24,
  },
});
