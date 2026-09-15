import React, { ReactNode } from 'react';
import { Modal, View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { X } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { V2StatusBadge } from './V2StatusBadge';
import { rawOrderStatusLabel, rawOrderStatusTone, kdsStatusLabel, kdsStatusTone } from './v2Types';
import type { TabOrder, KdsOrder } from './v2Types';

type DetailOrder = TabOrder | KdsOrder;

interface V2DetailDialogProps {
  visible: boolean;
  onClose: () => void;
  order: DetailOrder | null;
  footerAction?: ReactNode;
}

function isKdsOrder(order: DetailOrder): order is KdsOrder {
  return 'meta' in order;
}

function isTabOrder(order: DetailOrder): order is TabOrder {
  return !('meta' in order);
}

export function V2DetailDialog({ visible, onClose, order, footerAction }: V2DetailDialogProps) {
  const colors = useColors();

  if (!order) return null;

  const statusLabel = isTabOrder(order)
    ? rawOrderStatusLabel(order.rawStatus)
    : kdsStatusLabel(order.status);
  const statusTone = isTabOrder(order)
    ? rawOrderStatusTone(order.rawStatus)
    : kdsStatusTone(order.status);

  const items = isTabOrder(order)
    ? order.items.map((item) => ({ name: item, time: undefined as string | undefined }))
    : isKdsOrder(order)
      ? order.items.map(([name, time]) => ({ name, time }))
      : [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {isTabOrder(order) ? (order.customerName?.trim() || 'Cliente') : order.table}
              </Text>
              <Text style={{ color: colors.foregroundSecondary, fontSize: 13 }}>
                {isTabOrder(order) ? order.table : order.meta}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.foregroundSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.foregroundSecondary }]}>Status</Text>
              <V2StatusBadge label={statusLabel} tone={statusTone} />
            </View>

            {order.customerName ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.foregroundSecondary }]}>Cliente</Text>
                <Text style={{ color: colors.foreground, fontWeight: '600' }}>{order.customerName}</Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.foregroundSecondary }]}>Itens</Text>
              {items.map((item) => (
                <View key={item.name} style={styles.itemRow}>
                  <Text style={{ color: colors.foreground, flex: 1 }}>{item.name}</Text>
                  {item.time ? (
                    <Text style={{ color: colors.foregroundSecondary, fontSize: 12 }}>{item.time}</Text>
                  ) : null}
                </View>
              ))}
            </View>

            {isTabOrder(order) ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.foregroundSecondary }]}>Total</Text>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 18 }}>
                  R$ {order.total.toFixed(2)}
                </Text>
              </View>
            ) : null}

            {(isTabOrder(order) && order.time) || (isKdsOrder(order) && order.time) ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.foregroundSecondary }]}>Horário</Text>
                <Text style={{ color: colors.foreground }}>
                  {isTabOrder(order) ? order.time : order.time}
                </Text>
              </View>
            ) : null}

            {isTabOrder(order) && order.notes ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.foregroundSecondary }]}>Observações</Text>
                <Text style={{ color: colors.foreground }}>{order.notes}</Text>
              </View>
            ) : null}
          </ScrollView>

          {footerAction ? <View style={styles.footer}>{footerAction}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    maxHeight: 400,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  footer: {
    marginTop: 8,
    paddingTop: 12,
  },
});
