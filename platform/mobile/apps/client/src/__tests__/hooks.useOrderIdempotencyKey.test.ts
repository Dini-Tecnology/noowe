import { renderHook } from '@testing-library/react-native';
import { useOrderIdempotencyKey } from '../hooks/useOrderIdempotencyKey';

jest.mock('expo-crypto', () => { let n = 0; return { randomUUID: () => `key-${++n}` }; });

test('reenvio usa a mesma chave; só gira depois do pedido confirmado (invariante 10)', () => {
  const { result, rerender } = renderHook(() => useOrderIdempotencyKey());
  const first = result.current.current();
  rerender({});
  expect(result.current.current()).toBe(first);
  result.current.rotate();
  rerender({});
  expect(result.current.current()).not.toBe(first);
});
