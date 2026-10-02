import { pickRoleRow } from '../contexts/pickRestaurantRole';

describe('pickRoleRow', () => {
  const rows = [
    { role: 'manager', restaurant_id: 'A' },
    { role: 'waiter', restaurant_id: 'B' },
    { role: 'owner', restaurant_id: 'A' },
  ];

  it('quem é gerente e dono do mesmo restaurante entra como dono', () => {
    expect(pickRoleRow(rows, 'A')?.role).toBe('owner');
  });

  it('sem restaurante pedido, abre o do vínculo mais antigo, com o maior papel dele', () => {
    expect(pickRoleRow(rows)).toEqual({ role: 'owner', restaurant_id: 'A' });
  });

  it('respeita o restaurante pedido', () => {
    expect(pickRoleRow(rows, 'B')?.role).toBe('waiter');
  });

  it('sem vínculo, devolve null', () => {
    expect(pickRoleRow([], undefined)).toBeNull();
    expect(pickRoleRow(rows, 'C')).toBeNull();
  });
});
