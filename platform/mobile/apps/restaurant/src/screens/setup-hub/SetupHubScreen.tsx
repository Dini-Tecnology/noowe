/**
 * SetupHubScreen
 * 
 * Central configuration hub for restaurant initial setup.
 * Guides restaurant owners through essential configuration steps
 * including menu, tables, reservations, and payment setup.
 * 
 * Migrated to semantic tokens using useColors() + useMemo pattern.
 * 
 * @module screens/setup-hub
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  Text,
  Card,
  Button,
  ProgressBar,
  List,
  IconButton,
  Chip,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '@/shared/services/api';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  completed: boolean;
  required: boolean;
  route?: string;
}

const setupSteps: SetupStep[] = [
  {
    id: '1',
    title: 'Informações Básicas',
    description: 'Nome, endereço, tipo de culinária e horário de funcionamento',
    icon: 'store',
    completed: false,
    required: true,
    route: 'RestaurantInfo',
  },
  {
    id: '2',
    title: 'Configurar Cardápio',
    description: 'Adicione categorias, pratos, preços e descrições',
    icon: 'silverware-fork-knife',
    completed: false,
    required: true,
    route: 'Menu',
  },
  {
    id: '3',
    title: 'Configurar Mesas',
    description: 'Defina o layout do salão e número de mesas',
    icon: 'table-furniture',
    completed: false,
    required: true,
    route: 'FloorPlan',
  },
  {
    id: '4',
    title: 'Sistema de Reservas',
    description: 'Configure capacidade, horários e políticas de reserva',
    icon: 'calendar-check',
    completed: false,
    required: true,
    route: 'ReservationSettings',
  },
  {
    id: '5',
    title: 'Métodos de Pagamento',
    description: 'Integre formas de pagamento e configure taxas',
    icon: 'credit-card',
    completed: false,
    required: true,
  },
  {
    id: '6',
    title: 'Equipe e Funções',
    description: 'Adicione membros da equipe e defina permissões',
    icon: 'account-group',
    completed: false,
    required: false,
    route: 'HR',
  },
  {
    id: '7',
    title: 'Configurações de Gorjetas',
    description: 'Defina porcentagens sugeridas e distribuição',
    icon: 'cash-multiple',
    completed: false,
    required: false,
    route: 'Tips',
  },
  {
    id: '8',
    title: 'Integrações',
    description: 'Conecte delivery apps e sistemas externos',
    icon: 'connection',
    completed: false,
    required: false,
  },
];

export default function SetupHubScreen() {
  const navigation = useNavigation();
  const colors = useColors();
  
  // Get restaurant ID from context instead of hardcoded value
  const { restaurantId, isLoading: contextLoading } = useRestaurant();
  
  const [steps, setSteps] = useState<SetupStep[]>(setupSteps);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  // Memoized styles based on theme colors
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    headerCard: {
      margin: 16,
      marginBottom: 20,
      backgroundColor: colors.card,
    },
    headerContent: {
      alignItems: 'center',
      marginBottom: 25,
    },
    headerIcon: {
      marginBottom: 15,
    },
    headerTitle: {
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 8,
      color: colors.foreground,
    },
    headerSubtitle: {
      textAlign: 'center',
      color: colors.mutedForeground,
    },
    progressContainer: {
      marginTop: 10,
    },
    progressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    progressTitle: {
      fontWeight: 'bold',
      color: colors.foreground,
    },
    chipText: {
      fontSize: 12,
    },
    progressBar: {
      height: 8,
      borderRadius: 4,
      marginBottom: 8,
    },
    progressText: {
      color: colors.mutedForeground,
      textAlign: 'center',
    },
    section: {
      marginBottom: 25,
      paddingHorizontal: 15,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    sectionTitle: {
      fontWeight: 'bold',
      marginLeft: 10,
      color: colors.foreground,
    },
    sectionSubtitle: {
      color: colors.mutedForeground,
      marginBottom: 15,
      marginLeft: 5,
    },
    stepCard: {
      marginBottom: 12,
      elevation: 2,
      backgroundColor: colors.card,
    },
    completedCard: {
      backgroundColor: colors.successBackground,
    },
    stepContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    stepIconContainer: {
      marginRight: 15,
    },
    stepIconCircle: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.errorBackground,
      justifyContent: 'center',
      alignItems: 'center',
    },
    optionalIconCircle: {
      backgroundColor: colors.warningBackground,
    },
    completedIconCircle: {
      backgroundColor: colors.successBackground,
    },
    stepInfo: {
      flex: 1,
    },
    stepTitle: {
      fontWeight: 'bold',
      marginBottom: 4,
      color: colors.foreground,
    },
    completedText: {
      textDecorationLine: 'line-through',
      color: colors.success,
    },
    stepDescription: {
      color: colors.mutedForeground,
      lineHeight: 18,
    },
    quickActionsCard: {
      margin: 16,
      backgroundColor: colors.backgroundSecondary,
    },
    quickActionsTitle: {
      fontWeight: 'bold',
      marginBottom: 8,
      color: colors.foreground,
    },
    quickActionsSubtitle: {
      color: colors.mutedForeground,
      marginBottom: 20,
    },
    quickActionsButtons: {
      gap: 10,
    },
    quickActionButton: {
      marginBottom: 8,
    },
    footer: {
      alignItems: 'center',
      paddingVertical: 30,
    },
    footerText: {
      color: colors.mutedForeground,
      marginBottom: 8,
    },
  }), [colors]);

  // Load setup progress when restaurant ID is available
  useEffect(() => {
    if (restaurantId) {
      loadSetupProgress();
    }
  }, [restaurantId]);

  useEffect(() => {
    calculateProgress();
  }, [steps]);

  const loadSetupProgress = async () => {
    try {
      const response = await ApiService.getSetupProgress(restaurantId!);
      if (response.setup_progress) {
        const completedSteps = response.setup_progress;
        setSteps(
          setupSteps.map((step) => ({
            ...step,
            completed: completedSteps.includes(step.id),
          }))
        );
      }
    } catch (error) {
      console.error('Error loading setup progress:', error);
      Alert.alert('Erro', 'Não foi possível carregar o progresso');
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = () => {
    const requiredSteps = steps.filter((s) => s.required);
    const completedRequired = requiredSteps.filter((s) => s.completed).length;
    const progressValue = completedRequired / requiredSteps.length;
    setProgress(progressValue);
  };

  const toggleStepComplete = async (stepId: string) => {
    const updatedSteps = steps.map((step) =>
      step.id === stepId ? { ...step, completed: !step.completed } : step
    );
    setSteps(updatedSteps);

    try {
      const completedSteps = updatedSteps.filter((s) => s.completed).map((s) => s.id);
      await ApiService.updateSetupProgress(restaurantId!, completedSteps);
    } catch (error) {
      console.error('Error saving setup progress:', error);
      Alert.alert('Erro', 'Não foi possível salvar o progresso');
    }
  };

  const handleStepPress = (step: SetupStep) => {
    if (step.route) {
      navigation.navigate(step.route as never);
    } else {
      Alert.alert('Em Breve', 'Esta funcionalidade está em desenvolvimento');
    }
  };

  /**
   * Gets the appropriate icon color based on step status
   */
  const getStepIconColor = useCallback((step: SetupStep, isOptional: boolean = false) => {
    if (step.completed) return colors.success;
    return isOptional ? colors.warning : colors.error;
  }, [colors]);

  /**
   * Gets the check icon color based on completion status
   */
  const getCheckIconColor = useCallback((completed: boolean) => {
    return completed ? colors.success : colors.muted;
  }, [colors]);

  const requiredSteps = steps.filter((s) => s.required);
  const optionalSteps = steps.filter((s) => !s.required);
  const completedRequired = requiredSteps.filter((s) => s.completed).length;
  const totalRequired = requiredSteps.length;
  const isSetupComplete = completedRequired === totalRequired;

  return (
    <ScreenContainer>
    <ScrollView style={styles.container}>
      {/* Header Card */}
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.headerContent}>
            <View style={styles.headerIcon}>
              <Icon name="rocket-launch" size={48} color={colors.primary} />
            </View>
            <Text variant="headlineSmall" style={styles.headerTitle}>
              Configuração do Restaurante
            </Text>
            <Text variant="bodyMedium" style={styles.headerSubtitle}>
              Complete os passos abaixo para começar a operar
            </Text>
          </View>

          {/* Progress */}
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text variant="titleMedium" style={styles.progressTitle}>
                Progresso da Configuração
              </Text>
              <Chip
                icon={isSetupComplete ? 'check-circle' : 'progress-clock'}
                textStyle={styles.chipText}
              >
                {completedRequired}/{totalRequired}
              </Chip>
            </View>
            <ProgressBar
              progress={progress}
              color={isSetupComplete ? colors.success : colors.primary}
              style={styles.progressBar}
            />
            <Text variant="bodySmall" style={styles.progressText}>
              {isSetupComplete
                ? 'Configuração básica completa! 🎉'
                : `Faltam ${totalRequired - completedRequired} passos obrigatórios`}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Required Steps */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="alert-circle" size={24} color={colors.error} />
          <Text variant="titleLarge" style={styles.sectionTitle}>
            Passos Obrigatórios
          </Text>
        </View>

        {requiredSteps.map((step) => (
          <Card
            key={step.id}
            style={[styles.stepCard, step.completed && styles.completedCard]}
            onPress={() => handleStepPress(step)}
          >
            <Card.Content>
              <View style={styles.stepContent}>
                <View style={styles.stepIconContainer}>
                  <View
                    style={[
                      styles.stepIconCircle,
                      step.completed && styles.completedIconCircle,
                    ]}
                  >
                    <Icon
                      name={step.completed ? 'check' : step.icon}
                      size={32}
                      color={getStepIconColor(step, false)}
                    />
                  </View>
                </View>

                <View style={styles.stepInfo}>
                  <Text
                    variant="titleMedium"
                    style={[
                      styles.stepTitle,
                      step.completed && styles.completedText,
                    ]}
                  >
                    {step.title}
                  </Text>
                  <Text variant="bodySmall" style={styles.stepDescription}>
                    {step.description}
                  </Text>
                </View>

                <IconButton
                  icon={step.completed ? 'check-circle' : 'circle-outline'}
                  iconColor={getCheckIconColor(step.completed)}
                  size={24}
                  onPress={() => toggleStepComplete(step.id)}
                  accessibilityRole="button"
                  accessibilityLabel={step.completed ? `Mark ${step.title} as incomplete` : `Mark ${step.title} as complete`}
                />
              </View>
            </Card.Content>
          </Card>
        ))}
      </View>

      {/* Optional Steps */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="star-outline" size={24} color={colors.warning} />
          <Text variant="titleLarge" style={styles.sectionTitle}>
            Passos Opcionais
          </Text>
        </View>
        <Text variant="bodySmall" style={styles.sectionSubtitle}>
          Melhore a experiência do seu restaurante
        </Text>

        {optionalSteps.map((step) => (
          <Card
            key={step.id}
            style={[styles.stepCard, step.completed && styles.completedCard]}
            onPress={() => handleStepPress(step)}
          >
            <Card.Content>
              <View style={styles.stepContent}>
                <View style={styles.stepIconContainer}>
                  <View
                    style={[
                      styles.stepIconCircle,
                      styles.optionalIconCircle,
                      step.completed && styles.completedIconCircle,
                    ]}
                  >
                    <Icon
                      name={step.completed ? 'check' : step.icon}
                      size={32}
                      color={getStepIconColor(step, true)}
                    />
                  </View>
                </View>

                <View style={styles.stepInfo}>
                  <Text
                    variant="titleMedium"
                    style={[
                      styles.stepTitle,
                      step.completed && styles.completedText,
                    ]}
                  >
                    {step.title}
                  </Text>
                  <Text variant="bodySmall" style={styles.stepDescription}>
                    {step.description}
                  </Text>
                </View>

                <IconButton
                  icon={step.completed ? 'check-circle' : 'circle-outline'}
                  iconColor={getCheckIconColor(step.completed)}
                  size={24}
                  onPress={() => toggleStepComplete(step.id)}
                  accessibilityRole="button"
                  accessibilityLabel={step.completed ? `Mark ${step.title} as incomplete` : `Mark ${step.title} as complete`}
                />
              </View>
            </Card.Content>
          </Card>
        ))}
      </View>

      {/* Quick Actions */}
      {isSetupComplete && (
        <Card style={styles.quickActionsCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.quickActionsTitle}>
              Próximos Passos
            </Text>
            <Text variant="bodyMedium" style={styles.quickActionsSubtitle}>
              Seu restaurante está configurado! Agora você pode:
            </Text>

            <View style={styles.quickActionsButtons}>
              <Button
                mode="contained"
                icon="rocket"
                onPress={() => navigation.navigate('Dashboard' as never)}
                style={styles.quickActionButton}
                accessibilityRole="button"
                accessibilityLabel="Ir para Dashboard"
              >
                Ir para Dashboard
              </Button>

              <Button
                mode="outlined"
                icon="qrcode"
                onPress={() => navigation.navigate('FloorPlan' as never)}
                style={styles.quickActionButton}
                accessibilityRole="button"
                accessibilityLabel="Gerar QR Codes"
              >
                Gerar QR Codes
              </Button>

              <Button
                mode="outlined"
                icon="account-plus"
                onPress={() => navigation.navigate('HR' as never)}
                style={styles.quickActionButton}
                accessibilityRole="button"
                accessibilityLabel="Adicionar Equipe"
              >
                Adicionar Equipe
              </Button>
            </View>
          </Card.Content>
        </Card>
      )}

      <View style={styles.footer}>
        <Text variant="bodySmall" style={styles.footerText}>
          Precisa de ajuda? Entre em contato com o suporte
        </Text>
        <Button
          mode="text"
          onPress={() => Alert.alert('Suporte', 'suporte@okinawa.app')}
          accessibilityRole="button"
          accessibilityLabel="Falar com Suporte"
        >
          Falar com Suporte
        </Button>
      </View>
    </ScrollView>
    </ScreenContainer>
  );
}
