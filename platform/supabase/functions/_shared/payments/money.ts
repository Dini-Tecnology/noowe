// Conversão exata entre centavos (inteiro) e o `value` em reais do Asaas.
// Sem aritmética de ponto flutuante sobre dinheiro: a string decimal é montada
// a partir de inteiros e só então convertida em número JSON.

export function centsToAsaasValue(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError(`cents inválido: ${cents}`);
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return Number(`${whole}.${frac}`);
}

export function asaasValueToCents(value: number | string): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (typeof value === "number" && Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    throw new RangeError(`valor com mais de 2 casas: ${value}`);
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError(`valor inválido: ${value}`);
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) throw new RangeError(`valor fora do intervalo: ${value}`);
  return cents;
}
