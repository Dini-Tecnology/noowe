// Fatia O1, critério 3: todos os perfis exibem os mesmos rótulos para o mesmo estado (ADR-024).
import * as fs from 'fs';
import * as path from 'path';
import {
  itemStatusLabel,
  orderStatusLabel,
  sessionStatusLabel,
  tableStatusLabel,
} from '@okinawa/shared/utils/status-label';
import { kdsStatusLabel, rawOrderStatusLabel } from '../screens/v2/shared/v2Types';
import { advanceItems } from '../screens/v2/shared/kdsItems';

const MOBILE = path.resolve(__dirname, '../../../..');
const ACTIVE_SCREENS = [
  'apps/restaurant/src/screens/v2/OwnerHubScreen.tsx',
  'apps/restaurant/src/screens/v2/KitchenDisplayScreen.tsx',
  'apps/restaurant/src/screens/v2/BarKDSScreen.tsx',
  'apps/restaurant/src/screens/v2/OrdersScreen.tsx',
  'apps/restaurant/src/screens/v2/WaiterScreen.tsx',
  'apps/restaurant/src/screens/v2/TablesScreen.tsx',
  'apps/restaurant/src/screens/v2/shared/v2Types.ts',
  'apps/client/src/screens/production/order-status-ui.ts',
  'apps/client/src/screens/production/OrderDetailScreen.tsx',
];
const read = (file: string) => fs.readFileSync(path.join(MOBILE, file), 'utf8');

describe('critério 3: um só conjunto de rótulos', () => {
  it('cobre os estados do ADR-024', () => {
    expect(['awaiting_payment', 'pending', 'on_hold', 'fired', 'preparing', 'ready', 'delivered', 'cancelled'].map(itemStatusLabel))
      .toEqual(['Aguardando pagamento', 'Recebido', 'Em espera', 'Disparado', 'Em preparo', 'Pronto', 'Entregue', 'Cancelado']);
    expect(['available', 'reserved', 'occupied', 'payment', 'partial_payment', 'cleaning', 'blocked'].map(tableStatusLabel))
      .toEqual(['Livre', 'Reservada', 'Ocupada', 'Conta pedida', 'Pagamento parcial', 'Limpeza', 'Bloqueada']);
    expect(orderStatusLabel('preparing')).toBe('Em preparo');
  });

  it('a comanda vai de Aberta a Encerrada', () => {
    expect(sessionStatusLabel({ status: 'active' })).toBe('Aberta');
    expect(sessionStatusLabel({ status: 'active', billingStatus: 'billing' })).toBe('Conta pedida');
    expect(sessionStatusLabel({ status: 'active', billingStatus: 'billing', paidCents: 100, totalCents: 300 })).toBe('Pagamento parcial');
    expect(sessionStatusLabel({ status: 'active', paidCents: 300, totalCents: 300 })).toBe('Paga');
    expect(sessionStatusLabel({ status: 'ended' })).toBe('Encerrada');
  });

  it('os helpers do restaurante leem do módulo único', () => {
    expect(rawOrderStatusLabel('pending')).toBe(orderStatusLabel('pending'));
    expect(kdsStatusLabel('queue')).toBe(itemStatusLabel('pending'));
    expect(kdsStatusLabel('preparing')).toBe(itemStatusLabel('preparing'));
  });

  it('as telas ativas não voltam a declarar sinônimos', () => {
    const synonyms = /['"`>](Preparando|Na fila|Novo)['"`<]/;
    const found = ACTIVE_SCREENS.flatMap((file) =>
      read(file).split('\n').flatMap((line, index) =>
        synonyms.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []));
    expect(found).toEqual([]);
  });
});

describe('critério 5: em preparo é automático', () => {
  it('nenhuma tela ativa tem o botão Iniciar', () => {
    const found = ACTIVE_SCREENS.filter((file) => /Iniciar preparo|action: 'start'/.test(read(file)));
    expect(found).toEqual([]);
  });

  it('Pronto vale para item ainda Recebido, num passo só', async () => {
    const calls: string[] = [];
    await advanceItems({ updateOrderItemStatus: async (id, status) => { calls.push(`${id}:${status}`); } },
      [{ id: 'a', status: 'pending' }, { id: 'b', status: 'preparing' }, { id: 'c', status: 'ready' }], 'ready');
    expect(calls).toEqual(['a:ready', 'b:ready']);
  });
});
