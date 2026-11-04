/** Taxa ou gorjeta por tipo de serviço (ADR-032). O que vale é o que o servidor guarda; aqui só se monta o que a pessoa escolheu. */
export type SplitMode = 'by_owner' | 'equal' | 'by_item' | 'fixed_amount';

export type ChargePolicy = {
  serviceModel: string;
  feeOrTipMode: 'service_fee' | 'tip';
  serviceFeeBps: number;
  tipPresetsBps: number[];
  tipDefaultBps: number | null;
  splitModes: SplitMode[];
  prepaid: boolean;
  convenienceCents: number;
  convenienceAbsorbed: boolean;
};

export const SERVICE_LABELS: Record<string, string> = {
  fine_dining: 'Fine Dining',
  casual_dining: 'Casual Dining',
  quick_service: 'Quick Service',
};

export const SPLIT_LABELS: { mode: SplitMode; label: string }[] = [
  { mode: 'by_owner', label: 'Meus itens' },
  { mode: 'equal', label: 'Partes iguais' },
  { mode: 'by_item', label: 'Por item' },
  { mode: 'fixed_amount', label: 'Valor fixo' },
];

export const percentFromBps = (bps: number): number => bps / 100;
export const bpsFromPercent = (percent: number): number => Math.round(percent * 100);

/** "10, 15 e 20" vira os percentuais em ordem, sem repetir. Vazio e valores fora de 0–100 ficam de fora. */
export function parsePresets(text: string): number[] {
  const values = text.split(/[^\d]+/).filter(Boolean).map(Number).filter((value) => value > 0 && value <= 100);
  return Array.from(new Set(values)).map(bpsFromPercent);
}

export function presetsText(bps: number[]): string {
  return bps.map(percentFromBps).join(', ');
}

/** Sempre fica ao menos uma forma de divisão, e a ordem é a da tela. */
export function toggleSplitMode(modes: SplitMode[], mode: SplitMode): SplitMode[] {
  if (modes.includes(mode)) return modes.length > 1 ? modes.filter((value) => value !== mode) : modes;
  return SPLIT_LABELS.map((item) => item.mode).filter((value) => value === mode || modes.includes(value));
}

export function parseChargePolicies(raw: unknown): ChargePolicy[] {
  return (Array.isArray(raw) ? raw : []).map((value) => {
    const row = value as Record<string, unknown>;
    return {
      serviceModel: String(row.serviceModel),
      feeOrTipMode: row.feeOrTipMode === 'tip' ? 'tip' : 'service_fee',
      serviceFeeBps: Number(row.serviceFeeBps ?? 0),
      tipPresetsBps: Array.isArray(row.tipPresetsBps) ? row.tipPresetsBps.map(Number) : [],
      tipDefaultBps: row.tipDefaultBps == null ? null : Number(row.tipDefaultBps),
      splitModes: (Array.isArray(row.splitModes) ? row.splitModes : []) as SplitMode[],
      prepaid: row.prepaid === true,
      convenienceCents: Number(row.convenienceCents ?? 0),
      convenienceAbsorbed: row.convenienceAbsorbed === true,
    };
  });
}
