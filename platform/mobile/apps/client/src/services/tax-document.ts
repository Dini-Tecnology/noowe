// CPF ou CNPJ com dígitos verificadores. O servidor confere de novo; aqui é só para avisar antes de pagar.
export function taxDocumentDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function checkDigit(digits: string, weights: number[], cpf: boolean): number {
  const sum = weights.reduce((acc, w, i) => acc + Number(digits[i]) * w, 0);
  if (cpf) {
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

export function isValidTaxDocument(value: string): boolean {
  const d = taxDocumentDigits(value);
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    return checkDigit(d, [10, 9, 8, 7, 6, 5, 4, 3, 2], true) === Number(d[9])
      && checkDigit(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2], true) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    return checkDigit(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], false) === Number(d[12])
      && checkDigit(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], false) === Number(d[13]);
  }
  return false;
}

export function formatTaxDocument(value: string): string {
  const d = taxDocumentDigits(value);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return value;
}
