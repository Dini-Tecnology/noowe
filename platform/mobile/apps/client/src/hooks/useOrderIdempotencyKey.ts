import { useRef } from 'react';
import * as Crypto from 'expo-crypto';

/**
 * Uma chave por tentativa de envio do carrinho (invariante 10): reenviar após erro ou
 * toque repetido reusa a mesma chave, e o servidor devolve o pedido já criado.
 * Só gira depois que o pedido foi confirmado.
 */
export function useOrderIdempotencyKey() {
  const key = useRef<string | null>(null);
  if (!key.current) key.current = Crypto.randomUUID();
  return {
    current: () => key.current!,
    rotate: () => { key.current = Crypto.randomUUID(); },
  };
}
