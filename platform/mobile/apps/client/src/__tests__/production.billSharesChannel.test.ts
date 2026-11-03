// Duas telas da pilha assinam a mesma conta. Com o mesmo nome, channel() devolve o canal já assinado, e acrescentar
// callbacks nele derruba a tela de pagamento.
import { billShares } from '../services/bill-shares';

const mockNames: string[] = [];

jest.mock('expo-crypto', () => ({ randomUUID: () => 'key-1' }));
jest.mock('@/shared/services/supabase', () => ({
  getSupabaseClient: () => ({
    channel: (name: string) => {
      mockNames.push(name);
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
  }),
}));

test('cada assinatura da mesma conta usa um canal próprio', () => {
  billShares.subscribe('s1', () => undefined);
  billShares.subscribe('s1', () => undefined);
  expect(mockNames).toHaveLength(2);
  expect(new Set(mockNames).size).toBe(2);
  expect(mockNames.every((name) => name.startsWith('bill-shares:s1:'))).toBe(true);
});
