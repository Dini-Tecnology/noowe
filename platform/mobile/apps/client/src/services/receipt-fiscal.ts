/** Situação da NFC-e, sempre vinda do servidor. `delayed` nunca expõe o erro interno. */
export type ReceiptFiscal = {
  status: 'none' | 'awaiting_close' | 'issuing' | 'authorized' | 'delayed';
  number: string | null;
  series: string | null;
  accessKey: string | null;
  qrCodeUrl: string | null;
  danfeUrl: string | null;
  homologation: boolean;
  contingency: boolean;
};

const STATUSES: ReceiptFiscal['status'][] = ['none', 'awaiting_close', 'issuing', 'authorized', 'delayed'];
const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

export function parseReceiptFiscal(raw: unknown): ReceiptFiscal {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    // Situação desconhecida nunca vira nota autorizada.
    status: STATUSES.find((value) => value === row.status) ?? 'none',
    number: row.number == null ? null : String(row.number),
    series: row.series == null ? null : String(row.series),
    accessKey: text(row.accessKey),
    qrCodeUrl: text(row.qrCodeUrl),
    danfeUrl: text(row.danfeUrl),
    homologation: row.homologation === true,
    contingency: row.contingency === true,
  };
}
