import type { StaffTask } from '@okinawa/shared/services/supabase-api';

/**
 * A função pela qual a tarefa chegou a esta pessoa. Vale a função primária da tarefa; Gerente e Dono entram
 * por último, porque recebem junto e não são os responsáveis diretos.
 */
export function taskRoleTag(task: StaffTask, myRoles: readonly string[]): string | null {
  const primary = task.primaryRoles.find((role) => myRoles.includes(role));
  if (primary) return primary;
  return myRoles.find((role) => task.audienceRoles.includes(role)) ?? null;
}

/** `null` mostra todas. */
export function filterTasksByRole(tasks: readonly StaffTask[], myRoles: readonly string[], role: string | null): StaffTask[] {
  if (!role) return [...tasks];
  return tasks.filter((task) => taskRoleTag(task, myRoles) === role);
}

/** Só as funções que têm alguma tarefa viram filtro. */
export function taskFilterRoles(tasks: readonly StaffTask[], myRoles: readonly string[]): string[] {
  const used = new Set(tasks.map((task) => taskRoleTag(task, myRoles)));
  return myRoles.filter((role) => used.has(role));
}
