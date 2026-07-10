import { Alert, Share } from 'react-native';
import { Store, Clock, Bell, CreditCard, LogOut, Download, Trash2 } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { V2ListScreen } from './shared/V2ListScreen';
import { authService } from '@/shared/services/auth';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();

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
                    Alert.alert('Falha ao excluir conta', err instanceof Error ? err.message : 'Tente novamente.');
                  }
                },
              },
            ]);
          },
        },
      ]
    );
  };

  return (
    <V2ListScreen
      title="Configurações"
      items={[
        {
          icon: Store,
          label: 'Dados do Restaurante',
          subtitle: 'Nome, endereço, CNPJ',
          onPress: () => navigation.navigate('RestaurantProfile'),
        },
        {
          icon: Clock,
          label: 'Horário de Funcionamento',
          subtitle: 'Seg-Dom, 11h-23h',
          onPress: () => navigation.navigate('BusinessHours'),
        },
        {
          icon: Bell,
          label: 'Notificações',
          subtitle: 'Alertas e avisos',
          onPress: () => navigation.navigate('NotificationSettings'),
        },
        {
          icon: CreditCard,
          label: 'Pagamentos',
          subtitle: 'Métodos aceitos',
          onPress: () => navigation.navigate('PaymentSettings'),
        },
        {
          icon: Download,
          label: 'Exportar meus dados',
          subtitle: 'Baixe uma cópia dos seus dados (LGPD)',
          onPress: () => void handleExportData(),
        },
        {
          icon: Trash2,
          label: 'Excluir minha conta',
          subtitle: 'Solicitar exclusão dos seus dados',
          onPress: handleDeleteAccount,
        },
        {
          icon: LogOut,
          label: 'Sair da conta',
          subtitle: 'Encerrar sessão neste dispositivo',
          onPress: handleSignOut,
        },
      ]}
    />
  );
}
