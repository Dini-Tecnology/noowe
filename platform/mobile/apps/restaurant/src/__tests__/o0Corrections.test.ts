// Fatia O0 (docs/fatias/O0-correcoes-e-hold.md): correções imediatas e hold. Um teste por critério de aceite
// que vive no app; os critérios de receita, CRM, KDS e turno estão em platform/supabase/tests/45_*.
import { formatTableLabel } from '../screens/v2/shared/tableLabel';
import { cashRegisterStatus, isOpenCall, isTableInService, ACTIVE_CALL_STATUSES } from '../screens/v2/shared/liveStatus';
import { advanceItems, kdsCardStatus, mapBarQueueRow } from '../screens/v2/shared/kdsItems';
import { toShiftStaffOptions } from '../screens/v2/shared/shiftStaff';
import { flattenMenuRows } from '../screens/v2/shared/menuRows';
import { CONFIG_MODULES, VISIBLE_SERVICE_TYPES } from '../screens/v2/config/configTypes';
import { HOLD_NAV_IDS, visibleNavItems } from '../../../../shared/components/RestaurantLiquidGlassNav';

describe('critério 4: nenhum rótulo "Mesa Mesa N"', () => {
  it('acrescenta o prefixo uma vez só', () => {
    expect(formatTableLabel('6')).toBe('Mesa 6');
    expect(formatTableLabel(6)).toBe('Mesa 6');
    expect(formatTableLabel('Mesa 6')).toBe('Mesa 6');
    expect(formatTableLabel('mesa 6')).toBe('Mesa 6');
    expect(formatTableLabel('Varanda 2')).toBe('Mesa Varanda 2');
  });

  it('não deixa um rótulo vazio sem prefixo', () => {
    expect(formatTableLabel(null)).toBe('Mesa');
    expect(formatTableLabel('  ')).toBe('Mesa');
  });
});

describe('critério 2: um único status de caixa', () => {
  it('sem sessão (nunca aberto ou fechado) é fechado, em toda tela', () => {
    expect(cashRegisterStatus(null)).toBe('closed');
    expect(cashRegisterStatus(undefined)).toBe('closed');
    expect(cashRegisterStatus({ isOpen: false })).toBe('closed');
  });

  it('só a sessão aberta é aberto', () => {
    expect(cashRegisterStatus({ isOpen: true })).toBe('open');
  });
});

describe('critério 3: chamados e mesas do garçom', () => {
  it('chamado novo do servidor (`pending`) conta como aberto', () => {
    expect(isOpenCall('pending')).toBe(true);
    expect(isOpenCall('open')).toBe(true);
    expect(isOpenCall('acknowledged')).toBe(false);
  });

  it('a busca de chamados traz os que o servidor cria', () => {
    expect(ACTIVE_CALL_STATUSES).toEqual(expect.arrayContaining(['pending', 'acknowledged']));
  });

  it('mesa em cobrança conta como em atendimento, mesmo sem gente nem pedido', () => {
    expect(isTableInService({ status: 'payment', guestCount: 0, pendingOrders: 0 })).toBe(true);
    expect(isTableInService({ status: 'available', guestCount: 0, pendingOrders: 0 })).toBe(false);
    expect(isTableInService({ status: 'available', guestCount: 2, pendingOrders: 0 })).toBe(true);
  });
});

describe('critério 9: marcar pronto vai pelo item e mostra o erro', () => {
  it('avança todos os itens do card', async () => {
    const calls: Array<[string, string]> = [];
    const api = { updateOrderItemStatus: async (id: string, status: string) => { calls.push([id, status]); } };
    await advanceItems(api, [{ id: 'a', status: 'preparing' }, { id: 'b', status: 'preparing' }], 'ready');
    expect(calls).toEqual([['a', 'ready'], ['b', 'ready']]);
  });

  it('num card misto, cada item anda só o que falta (O1: Pronto vale também para quem está Recebido)', async () => {
    const calls: Array<[string, string]> = [];
    const api = { updateOrderItemStatus: async (id: string, status: string) => { calls.push([id, status]); } };
    await advanceItems(api, [
      { id: 'novo', status: 'pending' },
      { id: 'fazendo', status: 'preparing' },
      { id: 'pronto', status: 'ready' },
    ], 'ready');
    expect(calls.filter(([id]) => id === 'novo').map(([, s]) => s)).toEqual(['ready']);
    expect(calls.filter(([id]) => id === 'fazendo').map(([, s]) => s)).toEqual(['ready']);
    expect(calls.filter(([id]) => id === 'pronto')).toEqual([]);
  });

  it('o card só fica pronto com todos os itens prontos', () => {
    expect(kdsCardStatus([{ id: 'a', status: 'ready' }, { id: 'b', status: 'pending' }])).toBe('preparing');
    expect(kdsCardStatus([{ id: 'a', status: 'ready' }, { id: 'b', status: 'ready' }])).toBe('ready');
    expect(kdsCardStatus([{ id: 'a', status: 'pending' }])).toBe('queue');
  });

  it('propaga a falha em vez de engolir', async () => {
    const api = {
      updateOrderItemStatus: async (id: string) => {
        if (id === 'b') throw new Error('recusado');
      },
    };
    await expect(advanceItems(api, [{ id: 'a', status: 'preparing' }, { id: 'b', status: 'preparing' }], 'ready')).rejects.toThrow('recusado');
  });

  it('a fila do bar usa os campos que a RPC devolve', () => {
    const now = new Date('2026-11-01T20:30:00Z').getTime();
    const item = mapBarQueueRow(
      { id: 'i1', table_number: '6', name: 'Caipirinha', quantity: 2, status: 'pending', order_created_at: '2026-11-01T20:12:00Z' },
      now,
    );
    expect(item).toMatchObject({ tableLabel: 'Mesa 6', name: 'Caipirinha', quantity: 2, elapsedMinutes: 18 });
  });

  it('pedido de retirada mostra o cliente quando não há mesa', () => {
    expect(mapBarQueueRow({ id: 'i2', customer_name: 'Ana', status: 'pending' }).tableLabel).toBe('Sem mesa · Ana');
  });
});

describe('critério 7: criar turno usa o user_id', () => {
  it('manda user_id, não o id do vínculo, e não repete a pessoa', () => {
    const options = toShiftStaffOptions([
      { id: 'role-1', user_id: 'user-1', full_name: 'Bia', role: 'waiter', is_active: true },
      { id: 'role-2', user_id: 'user-1', full_name: 'Bia', role: 'barman', is_active: true },
      { id: 'role-3', user_id: 'user-2', full_name: 'Caio', role: 'cook', is_active: false },
    ]);
    expect(options).toEqual([{ id: 'user-1', full_name: 'Bia', role: 'waiter' }]);
  });
});

describe('cardápio do Chef', () => {
  it('lista os itens, não as categorias', () => {
    const items = flattenMenuRows([
      { id: 'c1', name: 'Entradas', items: [{ id: 'm1', name: 'Bruschetta', price: 28 }, { id: 'm2', name: 'Carpaccio', price: 42 }] },
      { id: 'c2', name: 'Vazia', items: [] },
    ]);
    expect(items.map((item) => item.name)).toEqual(['Bruschetta', 'Carpaccio']);
  });
});

describe('critério 10: itens em hold não aparecem', () => {
  const allVariants = ['default', 'manager', 'maitre', 'chef', 'barman', 'cook', 'waiter'];

  it('nenhum perfil mostra Estoque, Custo, Receitas ou Aprovações de Chef\'s Table', () => {
    for (const variant of allVariants) {
      const ids = visibleNavItems(variant).map((item) => item.id);
      for (const held of HOLD_NAV_IDS) expect(ids).not.toContain(held);
    }
    expect(HOLD_NAV_IDS).toEqual(
      expect.arrayContaining(['manager-stock', 'chef-stock', 'bar-stock', 'chef-cost', 'bar-recipes', 'chef-approvals']),
    );
  });

  it('o hold não esvazia nenhum perfil', () => {
    for (const variant of allVariants) expect(visibleNavItems(variant).length).toBeGreaterThanOrEqual(3);
  });

  it('só Fine, Casual e Quick aparecem em Tipos de Serviço', () => {
    expect(VISIBLE_SERVICE_TYPES.map((type) => type.id).sort()).toEqual(['casual_dining', 'fine_dining', 'quick_service']);
  });

  it('o Marketplace sai da Central e do progresso', () => {
    expect(CONFIG_MODULES.map((module) => module.id)).not.toContain('config-marketplace');
  });
});
