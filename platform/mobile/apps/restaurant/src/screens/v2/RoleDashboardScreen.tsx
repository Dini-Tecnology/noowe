import { LayoutDashboard, ChefHat, Wine, Bell } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { V2ListScreen } from './shared/V2ListScreen';

export default function RoleDashboardScreen() {
  const navigation = useNavigation<any>();
  return (
    <V2ListScreen title="Dashboard por Cargo" subtitle="Acesso por função" showBack items={[
      { icon: LayoutDashboard, label: 'Dono / Gerente', subtitle: 'Visão executiva', onPress: () => navigation.navigate('Hub') },
      { icon: ChefHat, label: 'Chef', subtitle: 'KDS, cardápio e estoque', onPress: () => navigation.navigate('Kitchen') },
      { icon: ChefHat, label: 'Cozinheiro', subtitle: 'Minha estação e KDS', onPress: () => navigation.navigate('Kitchen') },
      { icon: Wine, label: 'Barman', subtitle: 'Bar KDS e receitas', onPress: () => navigation.navigate('BarKDS') },
      { icon: Bell, label: 'Garçom', subtitle: 'Mesas, chamados e cobrança', onPress: () => navigation.navigate('Waiter') },
      { icon: Bell, label: 'Maître', subtitle: 'Reservas e fluxo do salão', onPress: () => navigation.navigate('Maitre') },
    ]} />
  );
}
