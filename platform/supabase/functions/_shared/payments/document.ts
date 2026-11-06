// CPF ou CNPJ com dígitos verificadores. A SEFAZ recusa a NFC-e com documento inválido, então conferimos antes.
// Espelha private.tax_document_valid no banco.
export function onlyDigits(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
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

export function validTaxDocument(value: unknown): boolean {
  const d = onlyDigits(value);
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
