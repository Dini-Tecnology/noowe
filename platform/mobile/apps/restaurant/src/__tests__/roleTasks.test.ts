import type { StaffTask } from '@okinawa/shared/services/supabase-api';
import { filterTasksByRole, taskFilterRoles, taskRoleTag } from '../screens/v2/shared/roleTasks';

const task = (id: string, primaryRoles: string[], audienceRoles: string[]): StaffTask => ({
  id, kind: 'x', type: 'action', title: id, detail: null, priority: 2, primaryRoles, audienceRoles,
});

describe('tarefas de quem acumula funções (O3, critério 1)', () => {
  const call = task('chamado', ['waiter'], ['waiter', 'manager', 'owner']);
  const drink = task('drink', ['barman'], ['barman', 'manager']);
  const late = task('atraso', ['chef'], ['chef', 'manager', 'owner']);

  it('a etiqueta é a função primária da tarefa', () => {
    expect(taskRoleTag(call, ['manager', 'waiter'])).toBe('waiter');
  });

  it('quem só recebe junto leva a etiqueta dessa função', () => {
    expect(taskRoleTag(late, ['manager', 'waiter'])).toBe('manager');
  });

  it('filtra pela etiqueta, e sem filtro mostra todas', () => {
    const mine = ['manager', 'waiter'];
    expect(filterTasksByRole([call, late], mine, 'waiter').map((item) => item.id)).toEqual(['chamado']);
    expect(filterTasksByRole([call, late], mine, 'manager').map((item) => item.id)).toEqual(['atraso']);
    expect(filterTasksByRole([call, late], mine, null)).toHaveLength(2);
  });

  it('só viram filtro as funções que têm tarefa', () => {
    expect(taskFilterRoles([call], ['manager', 'waiter', 'barman'])).toEqual(['waiter']);
    expect(taskFilterRoles([call, drink], ['waiter', 'barman'])).toEqual(['waiter', 'barman']);
  });
});
