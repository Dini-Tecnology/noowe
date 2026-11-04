import { assignableRoles, canManageMember } from '../screens/v2/shared/staffRoles';

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

  it('quem não é dono nem gerente não gerencia ninguém', () => {
    expect(canManageMember({ viewerRole: 'waiter', viewerUserId: 'u-w', member: waiter })).toBe(false);
    expect(canManageMember({ viewerRole: null, viewerUserId: null, member: waiter })).toBe(false);
  });
});
