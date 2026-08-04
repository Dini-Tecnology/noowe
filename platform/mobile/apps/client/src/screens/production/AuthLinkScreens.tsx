import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { getSupabaseClient } from '@/shared/services/supabase';

export function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; token_hash?: string; type?: string }>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const complete = async () => {
      const supabase = getSupabaseClient();
      if (params.code) { const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code); if (exchangeError) throw exchangeError; }
      else if (params.token_hash) { const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: params.token_hash, type: (params.type ?? 'email') as 'email' | 'recovery' | 'signup' | 'invite' | 'magiclink' | 'email_change' }); if (verifyError) throw verifyError; }
      router.replace('/');
    };
    complete().catch((reason) => setError(reason instanceof Error ? reason.message : 'Link inválido ou expirado.'));
  }, [params.code, params.token_hash, params.type]);
  return <View style={styles.page}>{error ? <><Text variant="titleMedium">Não foi possível confirmar</Text><Text>{error}</Text><Button onPress={() => router.replace('/')}>Voltar</Button></> : <><ActivityIndicator /><Text>Confirmando sua conta…</Text></>}</View>;
}

export function ResetPasswordScreen() {
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { if (password.length < 8 || password !== confirmation) throw new Error('Use ao menos 8 caracteres e confirme a mesma senha.'); const { error } = await getSupabaseClient().auth.updateUser({ password }); if (error) throw error; Alert.alert('Senha atualizada'); router.replace('/'); } catch (error) { Alert.alert('Não foi possível atualizar', error instanceof Error ? error.message : 'Tente novamente.'); } finally { setBusy(false); } };
  return <View style={styles.page}><Text variant="headlineSmall">Definir nova senha</Text><TextInput secureTextEntry label="Nova senha" value={password} onChangeText={setPassword} /><TextInput secureTextEntry label="Confirmar senha" value={confirmation} onChangeText={setConfirmation} /><Button mode="contained" loading={busy} onPress={save}>Salvar senha</Button></View>;
}

const styles = StyleSheet.create({ page: { flex: 1, justifyContent: 'center', padding: 28, gap: 16, backgroundColor: '#fff' } });
