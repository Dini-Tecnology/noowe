export type StaffOption = {
  /** `user_id` da pessoa: é o que `restaurant_create_shift` espera, não o id do vínculo (`user_roles.id`). */
  id: string;
  full_name?: string;
  role: string;
  /** Todas as funções da pessoa: só nelas ela pode ser escalada. */
  roles: string[];
};

type RawStaffRow = {
  id: string;
  user_id?: string | null;
  full_name?: string | null;
  role: string;
  is_active?: boolean;
};

/** Quem pode receber turno: pessoas ativas, uma vez só, pelo `user_id`. */
export function toShiftStaffOptions(rows: unknown): StaffOption[] {
  const list = Array.isArray(rows) ? (rows as RawStaffRow[]) : [];
  const byUser = new Map<string, StaffOption>();
  for (const row of list) {
    if (!row.is_active) continue;
    const userId = row.user_id ?? row.id;
    const existing = byUser.get(userId);
    if (existing) existing.roles.push(row.role);
    else byUser.set(userId, { id: userId, full_name: row.full_name ?? undefined, role: row.role, roles: [row.role] });
  }
  return [...byUser.values()];
}
