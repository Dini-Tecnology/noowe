import { describe, it, expect } from 'vitest';
import { userErrorMessage } from '../user-error-message';

describe('userErrorMessage', () => {
  const fallback = 'Não foi possível salvar. Tente novamente.';

  it('traduz as exceções conhecidas do banco (Error e objeto do Postgrest)', () => {
    expect(userErrorMessage(new Error('Authentication required'), fallback)).toBe('Faça login novamente para continuar.');
    expect(userErrorMessage({ message: 'Restaurant not found: 123', code: 'P0002' }, fallback)).toBe('Restaurante não encontrado.');
    expect(userErrorMessage({ message: 'Staff role not found' }, fallback)).toBe('Vínculo da equipe não encontrado.');
  });

  it('mensagem que já está em português passa como está', () => {
    expect(userErrorMessage({ message: 'Já existe uma categoria com esse nome.' }, fallback)).toBe('Já existe uma categoria com esse nome.');
    expect(userErrorMessage(new Error('CNPJ inválido. Use 14 caracteres.'), fallback)).toBe('CNPJ inválido. Use 14 caracteres.');
  });

  it('inglês desconhecido nunca chega à tela: cai na mensagem padrão', () => {
    expect(userErrorMessage(new Error('Something is not right with the thing'), fallback)).toBe(fallback);
    expect(userErrorMessage({ message: 'duplicate key value violates unique constraint' }, 'padrão')).toBe('padrão');
  });

  it('erro vazio ou sem mensagem usa o padrão', () => {
    expect(userErrorMessage(undefined, fallback)).toBe(fallback);
    expect(userErrorMessage({}, fallback)).toBe(fallback);
    expect(userErrorMessage('', fallback)).toBe(fallback);
  });

  it('erros de rede viram mensagem de conexão', () => {
    expect(userErrorMessage(new TypeError('Network request failed'), fallback)).toMatch(/Sem conexão/);
  });
});
