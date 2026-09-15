import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const navigation = useNavigation();
  const colors = useColors();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Fade in and slide up animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleGetStarted = () => {
    navigation.navigate('Onboarding' as never);
  };

  const handleSignIn = () => {
    navigation.navigate('Login' as never);
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'space-between',
      paddingVertical: 60,
      paddingHorizontal: 30,
    },
    gradientTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: height * 0.4,
      backgroundColor: colors.primary,
      opacity: 0.1,
      borderBottomRightRadius: 100,
    },
    gradientBottom: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: height * 0.3,
      backgroundColor: colors.secondary,
      opacity: 0.1,
      borderTopLeftRadius: 100,
    },
    decorCircle1: {
      position: 'absolute',
      top: 100,
      right: -50,
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: colors.primary,
      opacity: 0.05,
    },
    decorCircle2: {
      position: 'absolute',
      bottom: 200,
      left: -60,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: colors.secondary,
      opacity: 0.05,
    },
    logoContainer: {
      alignItems: 'center',
      marginTop: 40,
    },
    logoCircle: {
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 10,
    },
    appName: {
      color: colors.foreground,
      fontWeight: 'bold',
      marginTop: 25,
      letterSpacing: 2,
    },
    tagline: {
      color: colors.foregroundSecondary,
      marginTop: 10,
      textAlign: 'center',
    },
    featuresContainer: {
      marginVertical: 20,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
      paddingHorizontal: 10,
    },
    featureText: {
      color: colors.foregroundSecondary,
      marginLeft: 15,
      flex: 1,
    },
    actionsContainer: {
      alignItems: 'center',
    },
    getStartedButton: {
      width: '100%',
      marginBottom: 15,
      backgroundColor: colors.primary,
      borderRadius: 12,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 5,
    },
    signInButton: {
      width: '100%',
      marginBottom: 20,
      borderColor: colors.foreground,
      borderWidth: 1.5,
      borderRadius: 12,
    },
    buttonContent: {
      paddingVertical: 8,
    },
    buttonLabel: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    signInButtonLabel: {
      fontSize: 16,
      fontWeight: '600',
    },
    termsText: {
      color: colors.foregroundMuted,
      textAlign: 'center',
      marginTop: 10,
      lineHeight: 20,
    },
    termsLink: {
      color: colors.primary,
      textDecorationLine: 'underline',
    },
  });

  return (
    <ScreenContainer>
    <View style={styles.container} accessibilityLabel="Welcome to Noowe">
      {/* Background gradient effect */}
      <View style={styles.gradientTop} />
      <View style={styles.gradientBottom} />

      {/* Logo/Brand Section */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.logoCircle}>
          <Icon name="silverware-fork-knife" size={80} color={colors.primaryForeground} />
        </View>
        <Text variant="displaySmall" style={styles.appName}>
          Noowe
        </Text>
        <Text variant="titleMedium" style={styles.tagline}>
          Sua experiência gastronômica começa aqui
        </Text>
      </Animated.View>

      {/* Features Section */}
      <Animated.View
        style={[
          styles.featuresContainer,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <View style={styles.featureRow}>
          <Icon name="map-marker-radius" size={24} color={colors.primary} />
          <Text variant="bodyLarge" style={styles.featureText}>
            Descubra restaurantes próximos
          </Text>
        </View>

        <View style={styles.featureRow}>
          <Icon name="qrcode-scan" size={24} color={colors.primary} />
          <Text variant="bodyLarge" style={styles.featureText}>
            Escaneie QR codes para pedidos rápidos
          </Text>
        </View>

        <View style={styles.featureRow}>
          <Icon name="calendar-check" size={24} color={colors.primary} />
          <Text variant="bodyLarge" style={styles.featureText}>
            Reserve mesas com facilidade
          </Text>
        </View>

        <View style={styles.featureRow}>
          <Icon name="wallet" size={24} color={colors.primary} />
          <Text variant="bodyLarge" style={styles.featureText}>
            Pagamentos seguros e gorjetas digitais
          </Text>
        </View>
      </Animated.View>

      {/* Action Buttons */}
      <Animated.View
        style={[
          styles.actionsContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: Animated.multiply(slideAnim, -1) }],
          },
        ]}
      >
        <Button
          mode="contained"
          onPress={handleGetStarted}
          style={styles.getStartedButton}
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
          buttonColor={colors.primary}
        >
          Começar
        </Button>

        <Button
          mode="outlined"
          onPress={handleSignIn}
          style={styles.signInButton}
          contentStyle={styles.buttonContent}
          labelStyle={styles.signInButtonLabel}
          textColor={colors.foreground}
        >
          Já tenho uma conta
        </Button>

        <Text variant="bodySmall" style={styles.termsText}>
          Ao continuar, você concorda com nossos{'\n'}
          <Text style={styles.termsLink}>Termos de Serviço</Text> e{' '}
          <Text style={styles.termsLink}>Política de Privacidade</Text>
        </Text>
      </Animated.View>

      {/* Decorative elements */}
      <View style={styles.decorCircle1} />
      <View style={styles.decorCircle2} />
    </View>
  
    </ScreenContainer>
  );
}
