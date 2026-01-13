/**
 * Analytics Service
 * Mixpanel for events + UXCam for session recording
 * Complete tracking for all user actions in Unflat
 */

import { Mixpanel } from 'mixpanel-react-native';
import RNUxcam from 'react-native-ux-cam';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';

// Debug mode - set to false for production
const DEBUG = __DEV__ ?? false;

// Simulator detection - UXCam doesn't work on simulators
const isSimulator = !Device.isDevice;

// Mixpanel Project Token
const MIXPANEL_TOKEN = 'b8d711cabf77f254b965383fa15f7302';

// Mixpanel EU Server (project is configured for EU data residency)
const MIXPANEL_SERVER_URL = 'https://api-eu.mixpanel.com';

// UXCam App Key (EU region)
const UXCAM_APP_KEY = 'ls3gxyg4a8lzkdj-eu';

// Debug logging helper
function debugLog(message: string, ...args: unknown[]): void {
  if (DEBUG) {
    console.log(message, ...args);
  }
}

// Singleton instances
let mixpanel: Mixpanel | null = null;
let isInitialized = false;
let uxcamInitialized = false;
let initializationError: string | null = null;
let initializationAttempted = false;

// Session tracking
let sessionId: string = '';
let sessionStartTime: number = 0;
let screensViewed: string[] = [];
let actionsCount = 0;
let lastActiveTime = Date.now();

// Screen timing
const screenEnterTimes: Map<string, number> = new Map();
let previousScreen: string = '';

// Generate unique session ID
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Initialize Mixpanel and UXCam
 */
export async function initializeAnalytics(): Promise<void> {
  if (isInitialized) {
    // Production log: already initialized
    console.log('[Analytics] Already initialized, skipping');
    return;
  }

  if (initializationAttempted) {
    // Production log: initialization already attempted but failed
    console.warn('[Analytics] Init already attempted, error was:', initializationError);
    return;
  }

  initializationAttempted = true;
  console.log('[Analytics] Starting initialization...');

  try {
    // Initialize Mixpanel with EU server
    console.log('[Analytics] Creating Mixpanel instance...');
    mixpanel = new Mixpanel(MIXPANEL_TOKEN, true);

    console.log('[Analytics] Calling mixpanel.init() with EU server...');
    await mixpanel.init(false, {}, MIXPANEL_SERVER_URL);
    console.log('[Analytics] Mixpanel initialized with EU server');

    isInitialized = true;
    sessionId = generateSessionId();
    sessionStartTime = Date.now();

    // Set super properties (sent with every event)
    const appVersion = Application.nativeApplicationVersion || '1.0.0';

    mixpanel.registerSuperProperties({
      session_id: sessionId,
      app_version: appVersion,
      platform: Platform.OS,
      wallet_connected: false,
      current_balance: 0,
    });

    console.log('[Analytics] Mixpanel initialized successfully, session:', sessionId); // Production log

    // Initialize UXCam
    await initializeUXCam();

    // Track session start
    trackSessionStarted();

    console.log('[Analytics] Full initialization complete'); // Production log
  } catch (error) {
    initializationError = (error as Error)?.message || 'Unknown error';
    console.error('[Analytics] FAILED to initialize Mixpanel:', error);
    console.error('[Analytics] Error details:', JSON.stringify(error, null, 2));
  }
}

/**
 * Initialize UXCam session recording
 * Note: UXCam is skipped on simulators as it requires a real device
 */
export async function initializeUXCam(): Promise<void> {
  if (uxcamInitialized) return;

  // Skip UXCam on simulator - it doesn't work and causes errors
  if (isSimulator) {
    console.log('[Analytics] UXCam skipped - running on simulator');
    return;
  }

  try {
    // Configure UXCam
    const configuration = {
      userAppKey: UXCAM_APP_KEY,
      enableAutomaticScreenNameTagging: true,
      enableAdvancedGestureRecognition: true,
      enableImprovedScreenCapture: true,
    };

    // Start UXCam with configuration
    RNUxcam.startWithConfiguration(configuration);

    // Enable schematic recordings for iOS (required for App Store)
    if (Platform.OS === 'ios') {
      RNUxcam.optIntoSchematicRecordings();
    }

    uxcamInitialized = true;

    // Privacy: Automatically occlude all text inputs (emails, amounts, codes)
    RNUxcam.occludeAllTextFields(true);

    debugLog('[Analytics] UXCam initialized with text field occlusion');
  } catch (error) {
    console.error('[Analytics] Failed to initialize UXCam:', error);
  }
}

/**
 * Check if analytics is ready
 */
export function isAnalyticsReady(): boolean {
  return isInitialized && mixpanel !== null;
}

/**
 * Check if UXCam is available (initialized and not on simulator)
 */
export function isUXCamAvailable(): boolean {
  return uxcamInitialized && !isSimulator;
}

/**
 * Check if running on simulator
 */
export function isRunningOnSimulator(): boolean {
  return isSimulator;
}

/**
 * Get Mixpanel instance (for advanced usage)
 */
export function getMixpanel(): Mixpanel | null {
  return mixpanel;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE TRACKING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// Key events that should also be logged to UXCam
const UXCAM_KEY_EVENTS = [
  'login_success',
  'login_failed',
  'deposit_started',
  'deposit_success',
  'deposit_failed',
  'withdraw_started',
  'withdraw_completed',
  'withdraw_failed',
  'onramp_completed',
  'offramp_completed',
  'wallet_connected',
  'wallet_disconnected',
  'session_started',
  'app_opened',
  'error_displayed',
];

/**
 * Track any event with properties
 */
export function track(eventName: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsReady()) {
    console.warn(`[Analytics] DROPPED event "${eventName}" - not ready`);
    return;
  }

  actionsCount++;
  lastActiveTime = Date.now();

  const eventProps = {
    ...properties,
    timestamp: new Date().toISOString(),
  };

  try {
    mixpanel!.track(eventName, eventProps);

    // Log key events for debugging
    if (UXCAM_KEY_EVENTS.includes(eventName)) {
      console.log(`[Analytics] Tracked: ${eventName}`);
    }
  } catch (error) {
    console.error(`[Analytics] Failed to track "${eventName}":`, error);
  }

  // Also log key events to UXCam for session context
  if (uxcamInitialized && UXCAM_KEY_EVENTS.includes(eventName)) {
    // UXCam logEvent takes event name and optional properties object
    RNUxcam.logEvent(eventName, eventProps);
  }

  debugLog(`[Analytics] ${eventName}`, eventProps);
}

/**
 * Identify user by wallet address
 */
export function identifyUser(walletAddress: string): void {
  if (!isAnalyticsReady()) return;

  // Use last 10 chars of address for privacy (Mixpanel)
  const userId = walletAddress.slice(-10).toLowerCase();
  mixpanel!.identify(userId);

  // Update super property
  mixpanel!.registerSuperProperties({
    wallet_connected: true,
  });

  // Set user property
  mixpanel!.getPeople().set({
    wallet_address: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
    platform: Platform.OS,
    app_version: Application.nativeApplicationVersion || '1.0.0',
    last_active_date: new Date().toISOString(),
  });

  // Set UXCam user identity (last 6 chars only for privacy)
  if (uxcamInitialized) {
    const uxcamUserId = walletAddress.slice(-6).toLowerCase();
    RNUxcam.setUserIdentity(uxcamUserId);
    RNUxcam.setUserProperty('wallet_connected', 'true');
  }

  debugLog('[Analytics] User identified:', userId);
}

/**
 * Reset user identity (on logout)
 */
export function resetUser(): void {
  if (!isAnalyticsReady()) return;

  mixpanel!.reset();
  mixpanel!.registerSuperProperties({
    wallet_connected: false,
    current_balance: 0,
  });

  debugLog('[Analytics] User reset');
}

/**
 * Set user properties
 */
export function setUserProperties(properties: Record<string, unknown>): void {
  if (!isAnalyticsReady()) return;

  mixpanel!.getPeople().set(properties);
}

/**
 * Increment user property
 */
export function incrementUserProperty(property: string, value: number = 1): void {
  if (!isAnalyticsReady()) return;

  mixpanel!.getPeople().increment(property, value);
}

/**
 * Update super properties
 */
export function setSuperProperties(properties: Record<string, unknown>): void {
  if (!isAnalyticsReady()) return;

  mixpanel!.registerSuperProperties(properties);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SCREEN VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

export function trackScreenView(screenName: string): void {
  const now = Date.now();

  // Calculate time spent on previous screen
  if (previousScreen && screenEnterTimes.has(previousScreen)) {
    const enterTime = screenEnterTimes.get(previousScreen)!;
    const timeSpent = Math.round((now - enterTime) / 1000);

    track('screen_exit', {
      screen_name: previousScreen,
      time_spent_seconds: timeSpent,
    });
  }

  // Track new screen view
  screenEnterTimes.set(screenName, now);
  screensViewed.push(screenName);

  track('screen_view', {
    screen_name: screenName,
    previous_screen: previousScreen || 'none',
  });

  // Tag screen in UXCam for session recording
  if (uxcamInitialized) {
    RNUxcam.tagScreenName(screenName);
  }

  previousScreen = screenName;
}

export function trackScreenExit(screenName: string): void {
  if (!screenEnterTimes.has(screenName)) return;

  const enterTime = screenEnterTimes.get(screenName)!;
  const timeSpent = Math.round((Date.now() - enterTime) / 1000);

  track('time_on_screen', {
    screen_name: screenName,
    duration_seconds: timeSpent,
  });

  screenEnterTimes.delete(screenName);
}

export function trackScreenLoadTime(screenName: string, durationMs: number): void {
  track('screen_load_time', {
    screen_name: screenName,
    duration_ms: durationMs,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. BUTTON TAPS
// ═══════════════════════════════════════════════════════════════════════════════

export function trackButtonTap(buttonName: string, screen: string, extraProps?: Record<string, unknown>): void {
  track('button_tap', {
    button_name: buttonName,
    screen,
    ...extraProps,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. INPUT INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function trackInputFocused(fieldName: string, screen: string): void {
  track('input_focused', {
    field_name: fieldName,
    screen,
  });
}

// Alias for convenience
export const trackInputFocus = trackInputFocused;

export function trackInputChanged(fieldName: string, valueLength: number, screen: string): void {
  track('input_changed', {
    field_name: fieldName,
    value_length: valueLength,
    screen,
  });
}

export function trackInputSubmitted(fieldName: string, screen: string): void {
  track('input_submitted', {
    field_name: fieldName,
    screen,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. WALLET EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

export function trackWalletConnected(address: string, method: string): void {
  track('wallet_connected', {
    address_short: `${address.slice(0, 6)}...${address.slice(-4)}`,
    method,
  });

  identifyUser(address);

  setUserProperties({
    first_wallet_connect: new Date().toISOString(),
  });
}

export function trackWalletDisconnected(reason: string): void {
  track('wallet_disconnected', {
    reason,
  });

  resetUser();
}

export function trackWalletError(errorType: string, message: string): void {
  track('wallet_error', {
    error_type: errorType,
    message: message.substring(0, 200),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DEPOSITS - FULL FUNNEL
// ═══════════════════════════════════════════════════════════════════════════════

export function trackDepositScreenOpened(): void {
  track('deposit_screen_opened', {});
}

export function trackDepositAmountEntered(amount: string): void {
  track('deposit_amount_entered', {
    amount: parseFloat(amount) || 0,
  });
}

export function trackDepositMaxTapped(maxAmount: string): void {
  track('deposit_max_tapped', {
    max_amount: parseFloat(maxAmount) || 0,
  });
}

export function trackDepositButtonTapped(amount: string): void {
  track('deposit_button_tapped', {
    amount: parseFloat(amount) || 0,
  });
}

export function trackDepositConfirmationShown(amount: string): void {
  track('deposit_confirmation_shown', {
    amount: parseFloat(amount) || 0,
  });
}

export function trackDepositConfirmed(amount: string): void {
  track('deposit_confirmed', {
    amount: parseFloat(amount) || 0,
  });
}

export function trackDepositTxPending(txHash: string, amount: string): void {
  track('deposit_tx_pending', {
    tx_hash: txHash,
    amount: parseFloat(amount) || 0,
  });
}

export function trackDepositTxSuccess(txHash: string, amount: string, gasUsed?: string): void {
  track('deposit_tx_success', {
    tx_hash: txHash,
    amount: parseFloat(amount) || 0,
    gas_used: gasUsed,
  });

  // Update user properties
  incrementUserProperty('total_deposits', parseFloat(amount) || 0);
  incrementUserProperty('deposit_count', 1);

  setUserProperties({
    last_deposit_date: new Date().toISOString(),
  });
}

export function trackDepositTxFailed(txHash: string, amount: string, error: string): void {
  track('deposit_tx_failed', {
    tx_hash: txHash,
    amount: parseFloat(amount) || 0,
    error: error.substring(0, 200),
  });
}

// Additional deposit funnel helpers
export function trackDepositStarted(amount: number, strategyName: string): void {
  track('deposit_started', {
    amount,
    strategy_name: strategyName,
  });
}

export function trackDepositFailed(amount: number, strategyName: string, error: string): void {
  track('deposit_failed', {
    amount,
    strategy_name: strategyName,
    error: error.substring(0, 200),
  });
}

export function trackDepositSuccess(amount: number, strategyName: string, txHash: string, durationMs: number): void {
  track('deposit_success', {
    amount,
    strategy_name: strategyName,
    tx_hash: txHash,
    duration_ms: durationMs,
  });

  incrementUserProperty('total_deposits', amount);
  incrementUserProperty('deposit_count', 1);
  setUserProperties({
    last_deposit_date: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. WITHDRAWALS - FULL FUNNEL
// ═══════════════════════════════════════════════════════════════════════════════

export function trackWithdrawScreenOpened(): void {
  track('withdraw_screen_opened', {});
}

export function trackWithdrawAmountEntered(amount: string): void {
  track('withdraw_amount_entered', {
    amount: parseFloat(amount) || 0,
  });
}

export function trackWithdrawMaxTapped(maxAmount: string): void {
  track('withdraw_max_tapped', {
    max_amount: parseFloat(maxAmount) || 0,
  });
}

export function trackWithdrawButtonTapped(amount: string): void {
  track('withdraw_button_tapped', {
    amount: parseFloat(amount) || 0,
  });
}

export function trackWithdrawConfirmationShown(amount: string, feeAmount: string, feePercent: number): void {
  track('withdraw_confirmation_shown', {
    amount: parseFloat(amount) || 0,
    fee_amount: parseFloat(feeAmount) || 0,
    fee_percent: feePercent,
  });
}

export function trackWithdrawConfirmed(amount: string, feeAmount: string): void {
  track('withdraw_confirmed', {
    amount: parseFloat(amount) || 0,
    fee_amount: parseFloat(feeAmount) || 0,
  });
}

export function trackWithdrawTxPending(txHash: string, amount: string): void {
  track('withdraw_tx_pending', {
    tx_hash: txHash,
    amount: parseFloat(amount) || 0,
  });
}

export function trackWithdrawTxSuccess(txHash: string, amount: string, feeSent: string): void {
  track('withdraw_tx_success', {
    tx_hash: txHash,
    amount: parseFloat(amount) || 0,
    fee_sent: parseFloat(feeSent) || 0,
  });

  // Update user properties
  incrementUserProperty('total_withdrawn', parseFloat(amount) || 0);
  incrementUserProperty('total_fees_paid', parseFloat(feeSent) || 0);
  incrementUserProperty('withdraw_count', 1);

  setUserProperties({
    last_withdraw_date: new Date().toISOString(),
  });
}

export function trackWithdrawTxFailed(txHash: string, amount: string, error: string): void {
  track('withdraw_tx_failed', {
    tx_hash: txHash,
    amount: parseFloat(amount) || 0,
    error: error.substring(0, 200),
  });
}

// Additional withdraw funnel helpers
export function trackWithdrawStarted(amount: number): void {
  track('withdraw_started', {
    amount,
  });
}

export function trackWithdrawCancelled(amount: number, reason: string): void {
  track('withdraw_cancelled', {
    amount,
    reason,
  });
}

export function trackWithdrawConfirmation(amount: number): void {
  track('withdraw_confirmation_tapped', {
    amount,
  });
}

export function trackWithdrawCompleted(amount: number, receivedAmount: number, txHash: string, durationMs: number): void {
  track('withdraw_completed', {
    amount,
    received_amount: receivedAmount,
    tx_hash: txHash,
    duration_ms: durationMs,
  });

  incrementUserProperty('total_withdrawn', receivedAmount);
  incrementUserProperty('withdraw_count', 1);
  setUserProperties({
    last_withdraw_date: new Date().toISOString(),
  });
}

export function trackWithdrawFailed(amount: number, error: string): void {
  track('withdraw_failed', {
    amount,
    error: error.substring(0, 200),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ONRAMP - FULL FUNNEL
// ═══════════════════════════════════════════════════════════════════════════════

export function trackOnrampButtonTapped(): void {
  track('onramp_button_tapped', {});
}

export function trackOnrampAmountSelected(amount: string): void {
  track('onramp_amount_selected', {
    amount: parseFloat(amount) || 0,
  });
}

export function trackOnrampProviderOpened(provider: string): void {
  track('onramp_provider_opened', {
    provider,
  });
}

export function trackOnrampCompleted(amount: string, provider: string): void {
  track('onramp_completed', {
    amount: parseFloat(amount) || 0,
    provider,
  });

  incrementUserProperty('total_onramp_amount', parseFloat(amount) || 0);
  incrementUserProperty('onramp_count', 1);
}

export function trackOnrampCancelled(step: string, reason?: string): void {
  track('onramp_cancelled', {
    step,
    reason: reason || 'user_cancelled',
  });
}

export function trackOnrampError(error: string): void {
  track('onramp_error', {
    error: error.substring(0, 200),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. OFFRAMP - FULL FUNNEL
// ═══════════════════════════════════════════════════════════════════════════════

export function trackOfframpButtonTapped(): void {
  track('offramp_button_tapped', {});
}

export function trackOfframpAmountEntered(amount: string): void {
  track('offramp_amount_entered', {
    amount: parseFloat(amount) || 0,
  });
}

export function trackOfframpProviderOpened(provider: string): void {
  track('offramp_provider_opened', {
    provider,
  });
}

export function trackOfframpCompleted(amount: string, provider: string): void {
  track('offramp_completed', {
    amount: parseFloat(amount) || 0,
    provider,
  });

  incrementUserProperty('total_offramp_amount', parseFloat(amount) || 0);
  incrementUserProperty('offramp_count', 1);
}

export function trackOfframpCancelled(step: string, reason?: string): void {
  track('offramp_cancelled', {
    step,
    reason: reason || 'user_cancelled',
  });
}

export function trackOfframpError(error: string): void {
  track('offramp_error', {
    error: error.substring(0, 200),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. BALANCE INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function trackBalanceRefreshed(cashBalance: number, savingsBalance: number, totalEarned: number): void {
  track('balance_refreshed', {
    cash_balance: cashBalance,
    savings_balance: savingsBalance,
    total_earned: totalEarned,
  });

  // Update super property
  setSuperProperties({
    current_balance: cashBalance + savingsBalance,
  });

  // Update user properties
  setUserProperties({
    current_cash_balance: cashBalance,
    current_savings_balance: savingsBalance,
    total_earned: totalEarned,
  });
}

export function trackBalanceTap(whichBalance: 'cash' | 'savings' | 'earned'): void {
  track('balance_tap', {
    which_balance: whichBalance,
  });
}

export function trackEarningsAnimationViewed(currentEarnings: number): void {
  track('earnings_animation_viewed', {
    current_earnings: currentEarnings,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════════

export function trackTabSwitched(fromTab: string, toTab: string): void {
  track('tab_switched', {
    from_tab: fromTab,
    to_tab: toTab,
  });
}

export function trackBackButtonTapped(fromScreen: string): void {
  track('back_button_tapped', {
    from_screen: fromScreen,
  });
}

export function trackModalOpened(modalName: string): void {
  track('modal_opened', {
    modal_name: modalName,
  });
}

export function trackModalClosed(modalName: string, dismissMethod: 'button' | 'swipe' | 'backdrop' | 'back'): void {
  track('modal_closed', {
    modal_name: modalName,
    dismiss_method: dismissMethod,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

export function trackAppOpened(source: 'cold' | 'warm', timeSinceLastOpen?: number): void {
  track('app_opened', {
    source,
    time_since_last_open_seconds: timeSinceLastOpen,
  });

  incrementUserProperty('app_open_count', 1);
}

export function trackAppBackgrounded(lastScreen: string): void {
  const timeInApp = Math.round((Date.now() - sessionStartTime) / 1000);

  track('app_backgrounded', {
    time_in_app_seconds: timeInApp,
    last_screen: lastScreen,
  });
}

export function trackAppCrashed(error: string, stackTrace?: string): void {
  track('app_crashed', {
    error: error.substring(0, 500),
    stack_trace: stackTrace?.substring(0, 1000),
  });
}

export function trackSessionStarted(): void {
  track('session_started', {
    session_id: sessionId,
  });

  incrementUserProperty('session_count', 1);
  setUserProperties({
    last_session_start: new Date().toISOString(),
  });
}

export function trackSessionEnded(): void {
  const duration = Math.round((Date.now() - sessionStartTime) / 1000);

  track('session_ended', {
    session_id: sessionId,
    duration_seconds: duration,
    screens_viewed: screensViewed.length,
    unique_screens: [...new Set(screensViewed)].length,
    actions_count: actionsCount,
  });

  // Reset session tracking
  screensViewed = [];
  actionsCount = 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. ERRORS & EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

export function trackErrorDisplayed(errorType: string, message: string, screen: string): void {
  track('error_displayed', {
    error_type: errorType,
    message: message.substring(0, 200),
    screen,
  });
}

export function trackNetworkError(endpoint: string, statusCode: number): void {
  track('network_error', {
    endpoint,
    status_code: statusCode,
  });
}

export function trackTxError(txType: 'deposit' | 'withdraw' | 'approve' | 'transfer', errorCode: string, message: string): void {
  track('tx_error', {
    tx_type: txType,
    error_code: errorCode,
    message: message.substring(0, 200),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13. PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════

export function trackApiCallDuration(endpoint: string, durationMs: number, success: boolean): void {
  track('api_call_duration', {
    endpoint,
    duration_ms: durationMs,
    success,
  });
}

export function trackBalanceFetchDuration(durationMs: number): void {
  track('balance_fetch_duration', {
    duration_ms: durationMs,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 14. SCROLL & ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export function trackScrollDepth(screen: string, percent: number): void {
  track('scroll_depth', {
    screen,
    percent: Math.round(percent),
  });
}

export function trackTimeOnScreen(screen: string, durationSeconds: number): void {
  track('time_on_screen', {
    screen,
    duration_seconds: durationSeconds,
  });
}

export function trackIdleDetected(screen: string, idleDurationSeconds: number): void {
  track('idle_detected', {
    screen,
    idle_duration_seconds: idleDurationSeconds,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 15. AUTH EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

export function trackLoginScreenOpened(): void {
  track('login_screen_opened', {});
}

export function trackLoginEmailEntered(emailDomain: string): void {
  // Only track domain for privacy
  track('login_email_entered', {
    email_domain: emailDomain,
  });
}

export function trackLoginOtpRequested(): void {
  track('login_otp_requested', {});
}

export function trackLoginOtpEntered(): void {
  track('login_otp_entered', {});
}

export function trackLoginSuccess(method: string): void {
  track('login_success', {
    method,
  });
}

export function trackLoginFailed(method: string, error: string): void {
  track('login_failed', {
    method,
    error: error.substring(0, 200),
  });
}

export function trackLogout(): void {
  track('logout', {});
  resetUser();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 16. VAULT/STRATEGY EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

export function trackVaultViewed(vaultId: string, vaultName: string, apy: number): void {
  track('vault_viewed', {
    vault_id: vaultId,
    vault_name: vaultName,
    apy,
  });
}

export function trackStrategySelected(strategyId: string, strategyName: string): void {
  track('strategy_selected', {
    strategy_id: strategyId,
    strategy_name: strategyName,
  });
}

export function trackPositionViewed(vaultId: string, balance: number): void {
  track('position_viewed', {
    vault_id: vaultId,
    balance,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 17. CLIPBOARD EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

export function trackAddressCopied(context: string): void {
  track('address_copied', {
    context,
  });
}

export function trackQrCodeShown(): void {
  track('qr_code_shown', {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Create performance timer
// ═══════════════════════════════════════════════════════════════════════════════

export function createTimer(): { stop: () => number } {
  const startTime = Date.now();
  return {
    stop: () => Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLUSH (ensure events are sent before app closes)
// ═══════════════════════════════════════════════════════════════════════════════

export async function flushAnalytics(): Promise<void> {
  if (!isAnalyticsReady()) return;

  try {
    await mixpanel!.flush();
    debugLog('[Analytics] Events flushed');
  } catch (error) {
    console.error('[Analytics] Flush failed:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 18. UXCAM SESSION RECORDING - PRIVACY & OCCLUSION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Occlude a sensitive view from UXCam recordings
 * Use this for wallet addresses, balances, amounts, etc.
 * @param viewRef - React ref to the view to occlude
 */
export function occludeSensitiveView(viewRef: any): void {
  if (!uxcamInitialized || !viewRef?.current) return;

  try {
    RNUxcam.occludeSensitiveView(viewRef.current);
    debugLog('[Analytics] View occluded from UXCam');
  } catch (error) {
    console.error('[Analytics] Failed to occlude view:', error);
  }
}

/**
 * Occlude all text inputs from UXCam recordings
 * Call this once on app startup for global input protection
 */
export function occludeAllTextInputs(): void {
  if (!uxcamInitialized) return;

  try {
    RNUxcam.occludeAllTextFields(true);
    debugLog('[Analytics] All text inputs occluded from UXCam');
  } catch (error) {
    console.error('[Analytics] Failed to occlude text inputs:', error);
  }
}

/**
 * Mark a specific view as sensitive (alternative to occlude)
 * @param viewRef - React ref to the view to hide
 */
export function hideSensitiveView(viewRef: any): void {
  if (!uxcamInitialized || !viewRef?.current) return;

  try {
    RNUxcam.occludeSensitiveView(viewRef.current);
  } catch (error) {
    console.error('[Analytics] Failed to hide view:', error);
  }
}

/**
 * Stop session recording (e.g., for sensitive screens)
 */
export function pauseRecording(): void {
  if (!uxcamInitialized) return;

  try {
    RNUxcam.pauseScreenRecording();
    debugLog('[Analytics] UXCam recording paused');
  } catch (error) {
    console.error('[Analytics] Failed to pause recording:', error);
  }
}

/**
 * Resume session recording
 */
export function resumeRecording(): void {
  if (!uxcamInitialized) return;

  try {
    RNUxcam.resumeScreenRecording();
    debugLog('[Analytics] UXCam recording resumed');
  } catch (error) {
    console.error('[Analytics] Failed to resume recording:', error);
  }
}

/**
 * Get the current UXCam session URL (for debugging/support)
 */
export async function getSessionUrl(): Promise<string | null> {
  if (!uxcamInitialized) return null;

  try {
    const url = await RNUxcam.urlForCurrentSession();
    return url ?? null;
  } catch (error) {
    console.error('[Analytics] Failed to get session URL:', error);
    return null;
  }
}

/**
 * Add a note to the current session (for debugging)
 */
export function addSessionNote(note: string): void {
  if (!uxcamInitialized) return;

  try {
    RNUxcam.logEvent('session_note', { note });
  } catch (error) {
    console.error('[Analytics] Failed to add session note:', error);
  }
}
