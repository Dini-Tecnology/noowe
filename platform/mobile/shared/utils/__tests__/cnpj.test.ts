import { describe, it, expect } from 'vitest';
import { cnpjErrorMessage, computeCnpjCheckDigits, isValidCnpj, maskCnpjInput, normalizeCnpj } from '../cnpj';

describe('CNPJ alfanumérico (Receita Federal)', () => {
  it('valida o exemplo alfanumérico oficial 12.ABC.345/01DE-35', () => {
    expect(computeCnpjCheckDigits('12ABC34501DE')).toBe('35');
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12abc34501de35')).toBe(true);
  });

  it('CNPJ numérico antigo continua válido', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('recusa dígito verificador errado, tamanho errado e caracteres inválidos', () => {
    expect(isValidCnpj('12.ABC.345/01DE-36')).toBe(false);
    expect(isValidCnpj('12.ABC.345/01DE-3')).toBe(false);
    expect(isValidCnpj('12.ABC.345/01DE-AB')).toBe(false);
    expect(isValidCnpj('')).toBe(false);
    expect(isValidCnpj('qualquer coisa')).toBe(false);
  });

  it('recusa sequências de um caractere só', () => {
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false);
    expect(isValidCnpj('AAAAAAAAAAAAAA')).toBe(false);
  });

  it('normaliza máscara, espaços e minúsculas', () => {
    expect(normalizeCnpj(' 12.abc.345/01de-35 ')).toBe('12ABC34501DE35');
  });
});

describe('maskCnpjInput', () => {
  it('monta a máscara enquanto digita', () => {
    expect(maskCnpjInput('12')).toBe('12');
    expect(maskCnpjInput('12abc')).toBe('12.ABC');
    expect(maskCnpjInput('12abc345')).toBe('12.ABC.345');
    expect(maskCnpjInput('12abc34501de')).toBe('12.ABC.345/01DE');
    expect(maskCnpjInput('12abc34501de35')).toBe('12.ABC.345/01DE-35');
  });

  it('as duas últimas posições só aceitam dígitos e o total é 14', () => {
    expect(maskCnpjInput('12abc34501deAB')).toBe('12.ABC.345/01DE');
    expect(maskCnpjInput('12abc34501de3599999')).toBe('12.ABC.345/01DE-35');
  });

  it('descarta símbolos e aceita colar já mascarado', () => {
    expect(maskCnpjInput('12.ABC.345/01DE-35')).toBe('12.ABC.345/01DE-35');
    expect(maskCnpjInput('@#!')).toBe('');
  });
});

describe('cnpjErrorMessage', () => {
  it('vazio é permitido; inválido tem mensagem em português', () => {
    expect(cnpjErrorMessage('')).toBeNull();
    expect(cnpjErrorMessage('12.ABC.345/01DE-35')).toBeNull();
    expect(cnpjErrorMessage('12.ABC')).toMatch(/CNPJ inválido/);
  });
});
