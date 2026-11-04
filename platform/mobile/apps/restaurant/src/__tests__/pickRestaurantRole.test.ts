import { parseMyRoles, pickRestaurantRoles, pickRoleRow } from '../contexts/pickRestaurantRole';

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

describe('todas as funções da pessoa (O3, critério 2)', () => {
  const rows = [
    { role: 'waiter', restaurant_id: 'A' },
    { role: 'manager', restaurant_id: 'A' },
    { role: 'owner', restaurant_id: 'B' },
    { role: 'customer', restaurant_id: 'A' },
  ];

  it('pega as funções do restaurante, da mais para a menos poderosa, sem as que o app não conhece', () => {
    expect(pickRestaurantRoles(rows, 'A')).toEqual({ roles: ['manager', 'waiter'], primary: 'manager' });
  });

  it('usa a função principal que o servidor devolve', () => {
    expect(parseMyRoles({ roles: ['manager', 'waiter'], primary: 'waiter' })).toEqual({ roles: ['manager', 'waiter'], primary: 'waiter' });
  });

  it('principal desconhecida cai na mais poderosa', () => {
    expect(parseMyRoles({ roles: ['waiter', 'barman'], primary: 'host' })).toEqual({ roles: ['barman', 'waiter'], primary: 'barman' });
  });

  it('resposta vazia ou inválida não vale', () => {
    expect(parseMyRoles(null)).toBeNull();
    expect(parseMyRoles({ roles: ['customer'] })).toBeNull();
  });
});
