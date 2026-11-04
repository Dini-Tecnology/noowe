import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type StaffTask } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { filterTasksByRole, taskFilterRoles, taskRoleTag } from './roleTasks';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dono',
  manager: 'Gerente',
  maitre: 'Maître',
  chef: 'Chef',
  barman: 'Barman',
  cook: 'Cozinheiro',
  waiter: 'Garçom',
};

/**
 * Tarefas de todas as funções da pessoa, com etiqueta e filtro. Só aparece para quem acumula funções. A aba de
 * tarefas completa, com concluir e assumir na tela, é da fatia O4.
 */
export function MyRolesTasksPanel() {
  const colors = useColors();
  const { restaurantId, serverRoles } = useRestaurantRole();
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const multiRole = serverRoles.length > 1;

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setTasks(await supabaseApiAdapter.getTasks(restaurantId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (multiRole) void load();
  }, [load, multiRole]);

  const roles = useMemo(() => taskFilterRoles(tasks, serverRoles), [serverRoles, tasks]);
  const visible = useMemo(() => filterTasksByRole(tasks, serverRoles, filter), [filter, serverRoles, tasks]);

  if (!multiRole) return null;

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Tarefas das suas funções</Text>
      {roles.length > 1 ? (
        <View style={styles.filters}>
          {[null, ...roles].map((role) => {
            const active = filter === role;
            return (
              <Pressable
                key={role ?? 'todas'}
                accessibilityRole="button"
                onPress={() => setFilter(role)}
                style={[styles.chip, { backgroundColor: active ? colors.primary : colors.backgroundSecondary }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFF' : colors.foregroundSecondary }}>
                  {role ? ROLE_LABELS[role] ?? role : 'Todas'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {failed ? (
        <Pressable accessibilityRole="button" onPress={() => void load()}>
          <Text style={{ color: colors.foregroundSecondary }}>Não foi possível carregar as tarefas. Toque para tentar de novo.</Text>
        </Pressable>
      ) : visible.length === 0 ? (
        <Text style={{ color: colors.foregroundSecondary }}>Nenhuma tarefa aberta.</Text>
      ) : (
        visible.map((task) => {
          const tag = taskRoleTag(task, serverRoles);
          return (
            <View key={task.id} style={[styles.row, { borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.foreground }}>{task.title}</Text>
                {task.detail ? <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{task.detail}</Text> : null}
              </View>
              {tag ? (
                <View style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.foregroundSecondary }}>{ROLE_LABELS[tag] ?? tag}</Text>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16, gap: 10 },
  title: { fontSize: 15, fontWeight: '800' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
});
