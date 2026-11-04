import { mergedActiveTab, mergedNavItems, visibleNavItems } from '../../../../shared/components/RestaurantLiquidGlassNav';

describe('barra de quem tem várias funções (O3, critério 1)', () => {
  const ids = (variants: string[], hidden: string[] = []) => mergedNavItems(variants, hidden).map((item) => item.id);

  it('a principal vem primeiro', () => {
    expect(ids(['waiter', 'barman'])[0]).toBe('waiter');
    expect(ids(['barman', 'waiter'])[0]).toBe('barman-station');
  });

  it('não repete Config, Mesas, Pedidos nem KDS', () => {
    const merged = mergedNavItems(['manager', 'waiter']);
    const labels = merged.map((item) => item.label);
    expect(labels.filter((label) => label === 'Config')).toHaveLength(1);
    expect(labels.filter((label) => label === 'Mesas')).toHaveLength(1);
    expect(labels.filter((label) => label === 'Pedidos')).toHaveLength(1);
    expect(ids(['chef', 'waiter'])).toContain('chef-kds');
    expect(ids(['chef', 'waiter'])).not.toContain('waiter-kitchen');
  });

  it('mantém o que só uma função tem, e diz de qual perfil é', () => {
    const merged = mergedNavItems(['waiter', 'manager']);
    expect(merged.find((item) => item.id === 'waiter')?.ownerVariant).toBe('waiter');
    expect(merged.find((item) => item.id === 'manager-cash')?.ownerVariant).toBe('manager');
  });

  it('respeita o que está em hold e o que a capability esconde', () => {
    expect(ids(['manager', 'chef'])).not.toContain('manager-stock');
    expect(ids(['manager', 'chef'])).not.toContain('chef-approvals');
    expect(ids(['waiter', 'maitre'], ['waiter-table-actions', 'maitre-tables'])).not.toContain('maitre-tables');
  });

  it('com a tela de uma aba deixada de fora, acende a aba equivalente', () => {
    const items = mergedNavItems(['manager', 'waiter']);
    expect(mergedActiveTab('waiter-settings', items)).toBe('manager-settings');
    expect(mergedActiveTab('manager-cash', items)).toBe('manager-cash');
    expect(mergedActiveTab('waiter', visibleNavItems('waiter'))).toBe('waiter');
  });
});
