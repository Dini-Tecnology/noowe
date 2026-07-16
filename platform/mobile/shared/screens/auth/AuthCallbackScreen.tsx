import React, { useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { authService } from '../../services/auth';
import logger from '../../utils/logger';

type NavigationLike = {
  reset?: (state: { index: number; routes: Array<{ name: string }> }) => void;
  navigate?: (screen: string) => void;
};

interface AuthCallbackScreenProps {
  navigation?: NavigationLike;
  route?: {
    params?: {
      code?: string;
      url?: string;
      token_hash?: string;
      type?: string;
    };
  };
  onComplete?: () => void;
}

async function resolveAuthSession(route?: AuthCallbackScreenProps['route']) {
  const tokenHash = route?.params?.token_hash;
  if (tokenHash) {
    return authService.verifyEmailTokenHash(tokenHash);
  }

  const code = route?.params?.code;
  if (code) {
    return authService.exchangeCodeForSession(code);
  }

  const url = route?.params?.url ?? (await Linking.getInitialURL());
  if (!url) {
    throw new Error('Link de autenticacao ausente.');
  }

  return authService.recoverSessionFromUrl(url);
}

function leaveCallback(navigation?: NavigationLike, onComplete?: () => void) {
  if (onComplete) {
    onComplete();
    return;
  }

  if (navigation?.reset) {
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    return;
  }

  router.replace('/');
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function AuthCallbackScreen({ navigation, route, onComplete }: AuthCallbackScreenProps) {
  const localParams = useLocalSearchParams<{
    code?: string | string[];
    url?: string | string[];
    token_hash?: string | string[];
    type?: string | string[];
  }>();
  const resolvedRoute = useMemo(
    () =>
      route ?? {
        params: {
          code: firstParam(localParams.code),
          url: firstParam(localParams.url),
          token_hash: firstParam(localParams.token_hash),
          type: firstParam(localParams.type),
        },
      },
    [localParams.code, localParams.token_hash, localParams.type, localParams.url, route]
  );
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Confirmando seu acesso...');

  useEffect(() => {
    let active = true;

    resolveAuthSession(resolvedRoute)
      .then(() => {
        if (!active) return;
        setStatus('success');
        setMessage('Acesso confirmado.');
        setTimeout(() => leaveCallback(navigation, onComplete), 700);
      })
      .catch((error) => {
        if (!active) return;
        logger.warn('[Auth] Auth callback failed:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Nao foi possivel confirmar este link.');
      });

    return () => {
      active = false;
    };
  }, [navigation, onComplete, resolvedRoute]);

  return (
    <View style={styles.container}>
      {status === 'loading' && <ActivityIndicator size="large" color="#FF6B35" />}
      <Text style={styles.title}>{status === 'error' ? 'Link invalido' : 'Autenticacao'}</Text>
      <Text style={styles.message}>{message}</Text>
      {status === 'error' && (
        <Pressable style={styles.button} onPress={() => leaveCallback(navigation, onComplete)}>
          <Text style={styles.buttonText}>Voltar para login</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  title: {
    marginTop: 18,
    color: '#1A1A1A',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    color: '#4B5563',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  button: {
    marginTop: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 22,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default AuthCallbackScreen;
