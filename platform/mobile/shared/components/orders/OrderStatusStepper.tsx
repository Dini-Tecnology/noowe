/**
 * OrderStatusStepper — Pipeline de status do pedido (header laranja).
 *
 * Espelha o design de referência (`OrderStatusScreenV2` / `DemoOrderStatus` no site):
 * - ícone semântico por etapa (check → chapéu de chef → talheres → check)
 * - etapa atual em destaque (círculo branco sólido, ampliado, com sombra)
 * - etapas concluídas com checkmark e fundo semitransparente
 * - conectores renderizados EM LINHA entre os círculos, garantindo alinhamento
 *   exato com o centro horizontal/vertical de cada círculo em qualquer largura
 *   (a versão anterior usava `position: absolute` com percentuais que não batiam
 *   com o padding do container).
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

const CIRCLE_SIZE = 44;
const CONNECTOR_HEIGHT = 2;

export type StepIconSet = 'ionicons' | 'material-community';

export interface OrderStatusStep {
  key: string;
  label: string;
  /** Nome do ícone dentro do set escolhido. */
  icon: string;
  /** Família do ícone. Padrão: `ionicons`. */
  iconSet?: StepIconSet;
}

export interface OrderStatusStepperProps {
  steps: OrderStatusStep[];
  /** Índice (0-based) da etapa atual. */
  currentStep: number;
}

function StepIcon({
  name,
  set,
  size,
  color,
}: {
  name: string;
  set: StepIconSet;
  size: number;
  color: string;
}) {
  if (set === 'material-community') {
    return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}

export default function OrderStatusStepper({ steps, currentStep }: OrderStatusStepperProps) {
  const colors = useColors();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          backgroundColor: 'rgba(255,255,255,0.15)',
          borderRadius: 20,
          paddingVertical: 18,
          paddingHorizontal: 16,
        },
        row: {
          flexDirection: 'row',
          // `flex-start` mantém todos os itens ancorados no topo da linha, então o
          // centro vertical do círculo é sempre CIRCLE_SIZE / 2.
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        },
        step: {
          width: 58,
          alignItems: 'center',
        },
        circle: {
          width: CIRCLE_SIZE,
          height: CIRCLE_SIZE,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
        },
        circleCurrent: {
          backgroundColor: '#FFFFFF',
          transform: [{ scale: 1.1 }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 8,
          elevation: 6,
        },
        circleDone: { backgroundColor: 'rgba(255,255,255,0.30)' },
        circleFuture: { backgroundColor: 'rgba(255,255,255,0.10)' },
        label: {
          fontSize: 10,
          lineHeight: 13,
          marginTop: 8,
          fontWeight: '500',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.6)',
        },
        labelCurrent: { color: '#FFFFFF', fontWeight: '700' },
        connector: {
          flex: 1,
          height: CONNECTOR_HEIGHT,
          borderRadius: 999,
          marginHorizontal: 4,
          // Alinha o traço exatamente no centro vertical dos círculos.
          marginTop: (CIRCLE_SIZE - CONNECTOR_HEIGHT) / 2,
        },
        connectorDone: { backgroundColor: 'rgba(255,255,255,0.5)' },
        connectorFuture: { backgroundColor: 'rgba(255,255,255,0.15)' },
      }),
    [],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {steps.map((step, index) => {
          const isDone = index < currentStep;
          const isCurrent = index === currentStep;
          return (
            <React.Fragment key={step.key}>
              <View style={styles.step}>
                <View
                  style={[
                    styles.circle,
                    isCurrent ? styles.circleCurrent : isDone ? styles.circleDone : styles.circleFuture,
                  ]}
                >
                  {isDone ? (
                    <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                  ) : (
                    <StepIcon
                      name={step.icon}
                      set={step.iconSet ?? 'ionicons'}
                      size={20}
                      color={isCurrent ? colors.primary : 'rgba(255,255,255,0.5)'}
                    />
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.label, isCurrent && styles.labelCurrent]}
                >
                  {step.label}
                </Text>
              </View>
              {index < steps.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    index < currentStep ? styles.connectorDone : styles.connectorFuture,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}
