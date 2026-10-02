import { assignableRoles, canManageMember } from '../screens/v2/shared/staffRoles';

describe('assignableRoles', () => {
  it('dono pode vincular outro dono', () => {
    expect(assignableRoles({ viewerRole: 'owner', creatingAccount: false })[0]).toBe('owner');
  });

  it('gerente nunca vê "Dono"', () => {
    expect(assignableRoles({ viewerRole: 'manager', creatingAccount: false })).not.toContain('owner');
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

  it('quem não é dono nem gerente não gerencia ninguém', () => {
    expect(canManageMember({ viewerRole: 'waiter', viewerUserId: 'u-w', member: waiter })).toBe(false);
    expect(canManageMember({ viewerRole: null, viewerUserId: null, member: waiter })).toBe(false);
  });
});
