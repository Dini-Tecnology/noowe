import { assignableRoles, canApproveRequest, canManageMember, keepPrimary, toggleRole } from '../screens/v2/shared/staffRoles';

describe('assignableRoles', () => {
  it('dono pode vincular outro dono', () => {
    expect(assignableRoles({ viewerRole: 'owner', creatingAccount: false })[0]).toBe('owner');
  });

  it('gerente nunca vê "Dono" nem "Gerente"', () => {
    const roles = assignableRoles({ viewerRole: 'manager', creatingAccount: false });
    expect(roles).not.toContain('owner');
    expect(roles).not.toContain('manager');
    expect(roles).toContain('waiter');
  });

  it('dono concede gerente, inclusive ao criar conta', () => {
    expect(assignableRoles({ viewerRole: 'owner', creatingAccount: true })).toContain('manager');
  });

  it('criar conta nova não oferece "Dono", nem para o dono', () => {
    expect(assignableRoles({ viewerRole: 'owner', creatingAccount: true })).not.toContain('owner');
  });
});

describe('canManageMember', () => {
  const owner = { role: 'owner', user_id: 'u-owner' };
  const other = { role: 'owner', user_id: 'u-other' };
  const waiter = { role: 'waiter', user_id: 'u-waiter' };

  it('dono gerencia outro dono, mas não o próprio vínculo', () => {
    expect(canManageMember({ viewerRole: 'owner', viewerUserId: 'u-owner', member: other })).toBe(true);
    expect(canManageMember({ viewerRole: 'owner', viewerUserId: 'u-owner', member: owner })).toBe(false);
  });

  it('gerente não mexe em dono, mas gerencia o resto da equipe', () => {
    expect(canManageMember({ viewerRole: 'manager', viewerUserId: 'u-m', member: owner })).toBe(false);
    expect(canManageMember({ viewerRole: 'manager', viewerUserId: 'u-m', member: waiter })).toBe(true);
  });

  it('só o dono mexe em gerente', () => {
    const manager = { role: 'manager', user_id: 'u-m2' };
    expect(canManageMember({ viewerRole: 'manager', viewerUserId: 'u-m', member: manager })).toBe(false);
    expect(canManageMember({ viewerRole: 'manager', viewerUserId: 'u-m2', member: manager })).toBe(false);
    expect(canManageMember({ viewerRole: 'owner', viewerUserId: 'u-owner', member: manager })).toBe(true);
  });

  it('gerente não mexe na função de garçom de quem também é gerente', () => {
    expect(canManageMember({ viewerRole: 'manager', viewerUserId: 'u-m', member: waiter, memberRoles: ['waiter', 'manager'] })).toBe(false);
    expect(canManageMember({ viewerRole: 'manager', viewerUserId: 'u-m', member: waiter, memberRoles: ['waiter', 'barman'] })).toBe(true);
    expect(canManageMember({ viewerRole: 'owner', viewerUserId: 'u-o', member: waiter, memberRoles: ['waiter', 'manager'] })).toBe(true);
  });

  it('quem não é dono nem gerente não gerencia ninguém', () => {
    expect(canManageMember({ viewerRole: 'waiter', viewerUserId: 'u-w', member: waiter })).toBe(false);
    expect(canManageMember({ viewerRole: null, viewerUserId: null, member: waiter })).toBe(false);
  });
});

describe('várias funções (O3)', () => {
  it('marca e desmarca, sem deixar a pessoa sem função', () => {
    expect(toggleRole(['waiter'], 'barman')).toEqual(['waiter', 'barman']);
    expect(toggleRole(['waiter', 'barman'], 'waiter')).toEqual(['barman']);
    expect(toggleRole(['waiter'], 'waiter')).toEqual(['waiter']);
  });

  it('a principal acompanha as funções marcadas', () => {
    expect(keepPrimary(['waiter', 'barman'], 'barman')).toBe('barman');
    expect(keepPrimary(['waiter'], 'barman')).toBe('waiter');
  });
});

describe('aprovar o próprio pedido (O3, critério 3)', () => {
  it('o Gerente não vê Aprovar no pedido dele, mas vê no dos outros', () => {
    expect(canApproveRequest({ viewerRole: 'manager', viewerUserId: 'm', requesterId: 'm' })).toBe(false);
    expect(canApproveRequest({ viewerRole: 'manager', viewerUserId: 'm', requesterId: 'w' })).toBe(true);
  });

  it('o Dono vê sempre', () => {
    expect(canApproveRequest({ viewerRole: 'owner', viewerUserId: 'o', requesterId: 'o' })).toBe(true);
  });
});
