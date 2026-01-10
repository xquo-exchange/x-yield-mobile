import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Animated,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePrivy } from '@privy-io/expo';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

const { width } = Dimensions.get('window');

// Color Palette - PayPal/Revolut Style
const COLORS = {
  primary: '#200191',
  secondary: '#6198FF',
  white: '#F5F6FF',
  grey: '#484848',
  black: '#00041B',
  pureWhite: '#FFFFFF',
};

type WelcomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Welcome'>;
};

interface SlideData {
  id: string;
  icon: 'orb' | 'lock' | 'clock';
  title: string;
  highlightText?: string;
  subtitle: string;
}

const SLIDES: SlideData[] = [
  {
    id: '1',
    icon: 'orb',
    title: 'Earn up to ',
    highlightText: '8.5%',
    subtitle: 'Secure your savings and earn interest every second.',
  },
  {
    id: '2',
    icon: 'lock',
    title: 'Your Savings. Protected.',
    subtitle: 'Industry leading protection on your savings.',
  },
  {
    id: '3',
    icon: 'clock',
    title: 'Your money. Your way.',
    subtitle: 'No deposit fees and no minimums. Withdraw anytime.',
  },
];

// Glowing Icon Wrapper Component
const GlowingIconWrapper = ({ children }: { children: React.ReactNode }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
      {/* Outer glow */}
      <View style={styles.outerGlow} />
      {/* Middle glow */}
      <View style={styles.middleGlow} />
      {/* Inner glow circle */}
      <LinearGradient
        colors={[COLORS.secondary, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconBackground}
      />
      {/* Icon */}
      <View style={styles.iconInner}>
        {children}
      </View>
    </Animated.View>
  );
};

// Slide 1: Logo Image
const GlowingOrb = () => {
  return (
    <View style={styles.logoImageContainer}>
      <Image
        source={require('../../assets/logo_full.png')}
        style={styles.logoImage}
        resizeMode="contain"
      />
    </View>
  );
};

// Slide 2: Lock Icon
const GlowingLock = () => {
  return (
    <GlowingIconWrapper>
      <Ionicons name="lock-closed-outline" size={56} color={COLORS.pureWhite} />
    </GlowingIconWrapper>
  );
};

// Slide 3: Clock Icon
const GlowingClock = () => {
  return (
    <GlowingIconWrapper>
      <Ionicons name="time-outline" size={56} color={COLORS.pureWhite} />
    </GlowingIconWrapper>
  );
};

const SlideItem = ({ item }: { item: SlideData }) => {
  const renderIcon = () => {
    switch (item.icon) {
      case 'orb':
        return <GlowingOrb />;
      case 'lock':
        return <GlowingLock />;
      case 'clock':
        return <GlowingClock />;
    }
  };

  const renderTitle = () => {
    if (item.highlightText) {
      return (
        <Text style={styles.title}>
          {item.title}
          <Text style={styles.titleHighlight}>{item.highlightText}</Text>
          {' on your cash with unflat.'}
        </Text>
      );
    }
    return <Text style={styles.title}>{item.title}</Text>;
  };

  return (
    <View style={styles.slide}>
      <View style={styles.iconWrapper}>{renderIcon()}</View>
      <View style={styles.textContainer}>
        {renderTitle()}
        <Text style={styles.subtitle}>{item.subtitle}</Text>
      </View>
    </View>
  );
};

export default function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const { user } = usePrivy();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (user) {
      navigation.replace('Dashboard');
    }
  }, [user, navigation]);

  const handleScroll = (event: any) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / width);
    setActiveIndex(index);
  };

  const renderPaginationDots = () => {
    return (
      <View style={styles.pagination}>
        {SLIDES.map((_, index) => (
          <View
            key={index}
            style={[
              styles.paginationDot,
              index === activeIndex ? styles.paginationDotActive : styles.paginationDotInactive,
            ]}
          />
        ))}
      </View>
    );
  };

  return (
    <LinearGradient
      colors={[COLORS.white, COLORS.pureWhite]}
      locations={[0, 0.6]}
      style={styles.container}
    >
      <StatusBar style="dark" />

      {/* Carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={({ item }) => <SlideItem item={item} />}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        style={styles.flatList}
      />

      {/* Pagination Dots */}
      {renderPaginationDots()}

      {/* Bottom Section */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={styles.getStartedButton}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.9}
        >
          <Text style={styles.getStartedButtonText}>Get Started</Text>
        </TouchableOpacity>

        <Text style={styles.termsText}>
          By using unflat, you agree to accept our{' '}
          <Text style={styles.termsLink}>Terms of Use</Text> and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoImageContainer: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 150,
    height: 50,
  },
  flatList: {
    flex: 1,
  },
  slide: {
    width: width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  iconWrapper: {
    marginBottom: 60,
  },
  // Icon Container & Glow Effects
  iconContainer: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.secondary,
    opacity: 0.15,
  },
  middleGlow: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: COLORS.secondary,
    opacity: 0.25,
  },
  iconBackground: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  iconInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Text Styles
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 16,
  },
  titleHighlight: {
    color: COLORS.secondary,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.grey,
    textAlign: 'center',
    lineHeight: 24,
  },
  // Pagination Styles
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 6,
  },
  paginationDotActive: {
    backgroundColor: COLORS.primary,
    width: 24,
  },
  paginationDotInactive: {
    backgroundColor: COLORS.grey,
    opacity: 0.4,
  },
  // Bottom Section
  bottomContainer: {
    paddingHorizontal: 24,
    paddingBottom: 50,
    alignItems: 'center',
  },
  getStartedButton: {
    width: '100%',
    height: 56,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  getStartedButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  termsText: {
    fontSize: 13,
    color: COLORS.grey,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  termsLink: {
    color: COLORS.secondary,
    textDecorationLine: 'underline',
  },
});
