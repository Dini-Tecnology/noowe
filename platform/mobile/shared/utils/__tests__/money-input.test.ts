import { describe, it, expect } from 'vitest';
import { formatCentsBRL, maskCentsInput, parseCentsInput } from '../money-input';

describe('maskCentsInput', () => {
  it('digita da direita para a esquerda', () => {
    expect(maskCentsInput('5')).toBe('R$ 0,05');
    expect(maskCentsInput('50')).toBe('R$ 0,50');
    expect(maskCentsInput('5000')).toBe('R$ 50,00');
    expect(maskCentsInput('123456')).toBe('R$ 1.234,56');
  });

  it('aceita o texto já mascarado ao editar', () => {
    expect(maskCentsInput('R$ 50,00')).toBe('R$ 50,00');
    expect(maskCentsInput('R$ 50,000')).toBe('R$ 500,00');
  });

  it('ignora letras e símbolos', () => {
    expect(maskCentsInput('abc')).toBe('');
    expect(maskCentsInput('R$ 1x2')).toBe('R$ 0,12');
  });

  it('vazio ou só zeros vira vazio (não informar)', () => {
    expect(maskCentsInput('')).toBe('');
    expect(maskCentsInput('000')).toBe('');
  });

  it('limita o tamanho', () => {
    expect(maskCentsInput('99999999999')).toBe('R$ 9.999.999,99');
  });
});

describe('parseCentsInput', () => {
  it('devolve centavos inteiros', () => {
    expect(parseCentsInput('R$ 50,00')).toBe(5000);
    expect(parseCentsInput('R$ 1.234,56')).toBe(123456);
    expect(parseCentsInput('R$ 0,07')).toBe(7);
  });

  it('vazio ou zero vira null', () => {
    expect(parseCentsInput('')).toBeNull();
    expect(parseCentsInput('R$ 0,00')).toBeNull();
  });
});

describe('formatCentsBRL', () => {
  it('formata centavos sem passar por float', () => {
    expect(formatCentsBRL(5000)).toBe('R$ 50,00');
    expect(formatCentsBRL(5)).toBe('R$ 0,05');
    expect(formatCentsBRL(100000000)).toBe('R$ 1.000.000,00');
  });
});
