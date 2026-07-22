import { Alert, Share } from 'react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { authService } from '@/shared/services/auth';

/**
 * Personal-account actions shared by every settings surface (owner/manager
 * config hub and the per-role personal settings). Keeping the LGPD export and
 * the account-deletion flow in one place avoids drift on legally sensitive
 * behaviour.
 */
export function useAccountActions() {
  const handleSignOut = () => {
    Alert.alert('Sair da conta', 'Deseja encerrar sua sessão neste dispositivo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          void authService.logout();
        },
      },
    ]);
  };

  const handleExportData = async () => {
    try {
      const data = await supabaseApiAdapter.exportUserData();
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'Meus dados' });
    } catch (err) {
      Alert.alert('Falha ao exportar', err instanceof Error ? err.message : 'Tente novamente.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Excluir minha conta',
      'Seus dados pessoais serão anonimizados imediatamente e a exclusão definitiva ocorre em 30 dias. Pedidos e pagamentos são mantidos por obrigação legal. Esta ação não pode ser desfeita. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir conta',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Confirmar exclusão', 'Tem certeza? Você será desconectado.', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Sim, excluir',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await supabaseApiAdapter.requestAccountDeletion();
                    await authService.logout();
                  } catch (err) {
                    Alert.alert(
                      'Falha ao excluir conta',
                      err instanceof Error ? err.message : 'Tente novamente.',
                    );
                  }
                },
              },
            ]);
          },
        },
      ],
    );
  };

  return { handleSignOut, handleExportData, handleDeleteAccount };
}
