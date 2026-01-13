import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { usePrivy, useLoginWithEmail } from '@privy-io/expo';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import * as Analytics from '../services/analytics';

// Color Palette - PayPal/Revolut Style
const COLORS = {
  primary: '#200191',
  secondary: '#6198FF',
  white: '#F5F6FF',
  grey: '#484848',
  black: '#00041B',
  pureWhite: '#FFFFFF',
  border: '#E5E5E5',
};

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { user } = usePrivy();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Analytics: Track screen view on mount
  useEffect(() => {
    Analytics.trackScreenView('Login');
    Analytics.trackLoginScreenOpened();
    return () => Analytics.trackScreenExit('Login');
  }, []);

  useEffect(() => {
    if (user) {
      navigation.replace('Dashboard');
    }
  }, [user, navigation]);

  const { sendCode, loginWithCode, state } = useLoginWithEmail({
    onSendCodeSuccess: () => {
      Analytics.trackLoginOtpRequested();
      setShowCodeInput(true);
    },
    onLoginSuccess: () => {
      Analytics.trackLoginSuccess('email');
      navigation.replace('Dashboard');
    },
    onError: (error) => {
      Analytics.trackLoginFailed('email', error.message || 'Unknown error');
      Alert.alert('Error', error.message || 'Something went wrong');
    },
  });

  const isLoading = state.status === 'sending-code' || state.status === 'submitting-code';

  const handleSendCode = async () => {
    Analytics.trackButtonTap('Continue', 'Login', { step: 'email_entry' });
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    // Track email domain for analytics
    const emailDomain = email.split('@')[1]?.toLowerCase() || 'unknown';
    Analytics.track('Login Email Submitted', { email_domain: emailDomain });
    await sendCode({ email: email.trim() });
  };

  const handleVerifyCode = async () => {
    Analytics.trackButtonTap('Verify', 'Login', { step: 'code_verification' });
    if (!code.trim()) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }
    Analytics.trackLoginOtpEntered();
    await loginWithCode({ code: code.trim() });
  };

  const handleBack = () => {
    Analytics.trackButtonTap('Back', 'Login', {
      step: showCodeInput ? 'code_verification' : 'email_entry'
    });
    if (showCodeInput) {
      setShowCodeInput(false);
      setCode('');
    } else {
      navigation.goBack();
    }
  };

  const handleHelp = () => {
    Analytics.trackButtonTap('Help', 'Login', {
      step: showCodeInput ? 'code_verification' : 'email_entry'
    });
    Alert.alert(
      'Need Help?',
      'Enter your email address to receive a one-time verification code. Use this code to securely sign in to your account.',
      [{ text: 'Got it' }]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />

      {/* Header with Back and Help buttons */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={24} color={COLORS.black} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerButton} onPress={handleHelp}>
          <Ionicons name="help" size={20} color={COLORS.black} />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {!showCodeInput ? (
          <>
            {/* Email Entry Screen */}
            <Text style={styles.title}>Enter your email address</Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, isInputFocused && styles.inputFocused]}
                placeholder="Email Address"
                placeholderTextColor={COLORS.grey}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!isLoading}
                onFocus={() => {
                  setIsInputFocused(true);
                  Analytics.trackInputFocus('Email', 'Login');
                }}
                onBlur={() => setIsInputFocused(false)}
              />
              <View style={styles.hintContainer}>
                <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.secondary} />
                <Text style={styles.hintText}>
                  We'll send a 6-digit code to verify it's you. No password needed.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.continueButton, isLoading && styles.continueButtonDisabled]}
              onPress={handleSendCode}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.continueButtonText}>Continue</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Code Verification Screen */}
            <Text style={styles.title}>Enter verification code</Text>
            <Text style={styles.subtitle}>
              We sent a code to {email}
            </Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, isInputFocused && styles.inputFocused]}
                placeholder="6-digit code"
                placeholderTextColor={COLORS.grey}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                editable={!isLoading}
                autoFocus
                onFocus={() => {
                  setIsInputFocused(true);
                  Analytics.trackInputFocus('Verification Code', 'Login');
                }}
                onBlur={() => setIsInputFocused(false)}
              />
            </View>

            <TouchableOpacity
              style={[styles.continueButton, isLoading && styles.continueButtonDisabled]}
              onPress={handleVerifyCode}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.continueButtonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendButton}
              onPress={() => {
                Analytics.trackButtonTap('Resend Code', 'Login', { step: 'code_verification' });
                sendCode({ email: email.trim() });
              }}
              disabled={isLoading}
            >
              <Text style={styles.resendButtonText}>Resend code</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Secured by Privy</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.pureWhite,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.grey,
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 24,
    marginTop: 20,
  },
  hintContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 4,
    gap: 8,
  },
  hintText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.grey,
    lineHeight: 20,
  },
  input: {
    height: 56,
    backgroundColor: COLORS.pureWhite,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 17,
    color: COLORS.black,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputFocused: {
    borderColor: COLORS.secondary,
    borderWidth: 2,
  },
  continueButton: {
    height: 56,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.white,
  },
  resendButton: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 12,
  },
  resendButtonText: {
    fontSize: 15,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  footer: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: COLORS.grey,
  },
});
