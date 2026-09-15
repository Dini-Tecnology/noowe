import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Text, Chip, IconButton, Avatar } from 'react-native-paper';
import type { User } from '../../types';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

interface StaffCardProps {
  staff: User & {
    role?: string;
    shift?: string;
    status?: 'active' | 'inactive' | 'on_break';
  };
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  owner: '#6200ee',
  manager: '#0091EA',
  waiter: '#00C853',
  chef: '#FF6F00',
  cook: '#059669',
  barman: '#BE185D',
  maitre: '#0891B2',
  cashier: '#42A5F5',
  delivery: '#29B6F6',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietário',
  manager: 'Gerente',
  waiter: 'Garçom',
  chef: 'Chef',
  cook: 'Cozinheiro',
  barman: 'Barman',
  maitre: 'Maître',
  cashier: 'Caixa',
  delivery: 'Entregador',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#00C853',
  inactive: '#9E9E9E',
  on_break: '#FF6F00',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  on_break: 'Em Pausa',
};

export default function StaffCard({ staff, onPress, onEdit, onDelete, showActions = true }: StaffCardProps) {
  const colors = useColors();

  const styles = useMemo(() => StyleSheet.create({
    card: {
      marginBottom: 16,
      elevation: 2,
      backgroundColor: colors.card,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    staffInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    avatar: {
      marginRight: 12,
    },
    nameContainer: {
      flex: 1,
    },
    name: {
      color: colors.foreground,
    },
    email: {
      color: colors.foregroundMuted,
      marginTop: 2,
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    phoneIcon: {
      margin: 0,
      padding: 0,
      marginRight: 2,
    },
    phone: {
      color: colors.foregroundMuted,
    },
    headerActions: {
      flexDirection: 'row',
      marginLeft: 8,
    },
    actionIcon: {
      margin: 0,
      padding: 0,
    },
    details: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    roleChip: {
      height: 28,
    },
    statusChip: {
      height: 28,
    },
    chipText: {
      color: '#fff',
      fontSize: 12,
    },
    shiftChip: {
      height: 28,
      backgroundColor: colors.backgroundSecondary,
    },
    shiftChipText: {
      color: colors.foregroundMuted,
      fontSize: 12,
    },
  }), [colors]);

  const getRoleColor = (role?: string) => {
    if (!role) return colors.foregroundMuted;
    return ROLE_COLORS[role.toLowerCase()] || colors.foregroundMuted;
  };

  const getRoleLabel = (role?: string) => {
    if (!role) return 'Sem cargo';
    return ROLE_LABELS[role.toLowerCase()] || role;
  };

  const CardContent = () => (
    <Card.Content>
      <View style={styles.header}>
        <View style={styles.staffInfo}>
          {staff.avatar_url ? (
            <Avatar.Image size={48} source={{ uri: staff.avatar_url }} style={styles.avatar} />
          ) : (
            <Avatar.Text
              size={48}
              label={staff.full_name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
              style={[styles.avatar, { backgroundColor: getRoleColor(staff.role) }]}
            />
          )}
          <View style={styles.nameContainer}>
            <Text variant="titleMedium" style={styles.name}>{staff.full_name}</Text>
            <Text variant="bodySmall" style={styles.email}>
              {staff.email}
            </Text>
            {staff.phone && (
              <View style={styles.phoneRow}>
                <IconButton icon="phone" size={14} style={styles.phoneIcon} iconColor={colors.foregroundMuted} />
                <Text variant="bodySmall" style={styles.phone}>
                  {staff.phone}
                </Text>
              </View>
            )}
          </View>
        </View>
        {showActions && (
          <View style={styles.headerActions}>
            {onEdit && (
              <IconButton icon="pencil" size={20} onPress={onEdit} style={styles.actionIcon} iconColor="#0091EA" />
            )}
            {onDelete && (
              <IconButton icon="delete" size={20} onPress={onDelete} style={styles.actionIcon} iconColor="#d32f2f" />
            )}
          </View>
        )}
      </View>

      <View style={styles.details}>
        <Chip
          style={[styles.roleChip, { backgroundColor: getRoleColor(staff.role) }]}
          textStyle={styles.chipText}
          icon="shield-account"
        >
          {getRoleLabel(staff.role)}
        </Chip>
        {staff.status && (
          <Chip
            style={[styles.statusChip, { backgroundColor: STATUS_COLORS[staff.status] }]}
            textStyle={styles.chipText}
            icon="circle"
          >
            {STATUS_LABELS[staff.status]}
          </Chip>
        )}
        {staff.shift && (
          <Chip style={styles.shiftChip} textStyle={styles.shiftChipText} icon="clock-outline">
            {staff.shift}
          </Chip>
        )}
      </View>
    </Card.Content>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Card style={styles.card}>{CardContent()}</Card>
      </TouchableOpacity>
    );
  }

  return <Card style={styles.card}>{CardContent()}</Card>;
}
