import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import {
  Briefcase,
  Check,
  ChefHat,
  ClipboardList,
  Flame,
  GlassWater,
  Store,
  UtensilsCrossed,
} from 'lucide-react-native';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import Haptic from '@/shared/utils/haptics';
import { AuthScreenHeader } from '../../components/auth/AuthScreenHeader';
import { AUTH_BRAND } from '../../components/auth/authScreenTheme';
import type { RestaurantRole } from '../../contexts/RestaurantRoleContext';
import type { RoleIntent } from '../../services/role-intent';

const ROLE_OPTIONS: Array<{
  id: RestaurantRole;
  intent: RoleIntent;
  label: string;
  description: string;
  Icon: typeof Store;
}> = [
  {
    id: 'owner',
    intent: 'owner',
    label: 'Dono do Restaurante',
    description: 'Cria e gerencia o estabelecimento no aplicativo',
    Icon: Store,
  },
  {
    id: 'manager',
    intent: 'staff',
    label: 'Gerente',
    description: 'Opera o turno, equipe e pedências do dia',
    Icon: Briefcase,
  },
  {
    id: 'maitre',
    intent: 'staff',
    label: 'Maître',
    description: 'Cuida da sala, reservas e fluxo de mesas',
    Icon: ClipboardList,
  },
  {
    id: 'chef',
    intent: 'staff',
    label: 'Chef',
    description: 'Cozinha, KDS e qualidade dos pratos',
    Icon: ChefHat,
  },
  {
    id: 'barman',
    intent: 'staff',
    label: 'Barman',
    description: 'Bar, drinks e estação de bebidas',
    Icon: GlassWater,
  },
  {
    id: 'cook',
    intent: 'staff',
    label: 'Cozinheiro',
    description: 'Prepara pedidos na sua praça',
    Icon: Flame,
  },
  {
    id: 'waiter',
    intent: 'staff',
    label: 'Garçom',
    description: 'Atende mesas e chamados dos clientes',
    Icon: UtensilsCrossed,
  },
];

interface PostSignupRoleScreenProps {
  onSelect: (intent: RoleIntent) => Promise<void> | void;
}

export default function PostSignupRoleScreen({ onSelect }: PostSignupRoleScreenProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedId, setSelectedId] = useState<RestaurantRole | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleContinue = async () => {
    const option = ROLE_OPTIONS.find((item) => item.id === selectedId);
    if (!option || submitting) return;

    setSubmitting(true);
    try {
      Haptic.mediumImpact();
      await onSelect(option.intent);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthScreenHeader
          title="Qual é o seu papel?"
          subtitle="Escolha como você vai utilizar o aplicativo. Isso define o próximo passo do seu acesso."
        />

        <View style={styles.list}>
          {ROLE_OPTIONS.map((option) => {
            const selected = selectedId === option.id;
            const Icon = option.Icon;
            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.option,
                  {
                    borderColor: selected ? colors.primary : AUTH_BRAND.inputBorder,
                    backgroundColor: selected ? `${colors.primary}12` : colors.background,
                  },
                ]}
                onPress={() => {
                  setSelectedId(option.id);
                  Haptic.selectionChanged();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}14` }]}>
                  <Icon size={22} color={colors.primary} />
                </View>
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, { color: colors.foreground }]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.optionDescription, { color: colors.foregroundSecondary }]}>
                    {option.description}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: selected ? colors.primary : AUTH_BRAND.inputBorder,
                      backgroundColor: selected ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  {selected ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: colors.primary },
            (!selectedId || submitting) && styles.buttonDisabled,
          ]}
          onPress={() => void handleContinue()}
          disabled={!selectedId || submitting}
          accessibilityRole="button"
          accessibilityLabel="Continuar"
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Continuar</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 40,
      paddingBottom: 32,
    },
    list: {
      gap: 12,
      marginBottom: 24,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderRadius: AUTH_BRAND.borderRadius,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionText: {
      flex: 1,
      gap: 2,
    },
    optionLabel: {
      fontSize: 16,
      fontWeight: '700',
    },
    optionDescription: {
      fontSize: 13,
      lineHeight: 18,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButton: {
      borderRadius: AUTH_BRAND.borderRadius,
      paddingVertical: 16,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.55,
    },
  });
