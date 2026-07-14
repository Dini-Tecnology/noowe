import { useNavigation } from '@react-navigation/native';
import { V2Shell } from './shared/V2Shell';
import { ConfigHubContent } from './config/ConfigHubContent';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();

  return (
    <V2Shell
      title="Central de Configuração"
      subtitle="Controle completo do restaurante"
      showBack
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Hub');
      }}
    >
      <ConfigHubContent />
    </V2Shell>
  );
}
