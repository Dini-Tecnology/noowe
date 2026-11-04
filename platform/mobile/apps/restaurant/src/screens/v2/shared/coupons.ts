import type { CouponRow } from '@okinawa/shared/services/supabase-api';

export type CouponDraft = {
  id?: string; title: string; code: string; discountKind: 'percent' | 'fixed' | 'free_item'; percent: string; reais: string; freeItemId: string;
  services: string[]; scope: 'bill' | 'categories' | 'items'; scopeIds: string[]; dow: number[]; hoursFrom: string; hoursUntil: string; minOrderReais: string; from: string; until: string;
  audience: 'all' | 'new' | 'vip' | 'birthday' | 'inactive'; inactiveDays: string; maxUses: string; maxUsesPerUser: string; isAuto: boolean; isVisible: boolean;
};

const DEFAULT_VALIDITY_DAYS = 30;
const pad = (value: number) => String(value).padStart(2, '0');
/** Data no fuso de quem preenche, em DD/MM/AAAA. */
const brDate = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
const plusDays = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return brDate(date); };

export const emptyDraft = (): CouponDraft => ({
  title: '', code: '', discountKind: 'percent', percent: '10', reais: '', freeItemId: '', services: [], scope: 'bill', scopeIds: [], dow: [], hoursFrom: '', hoursUntil: '', minOrderReais: '',
  from: plusDays(0), until: plusDays(DEFAULT_VALIDITY_DAYS), audience: 'all', inactiveDays: '', maxUses: '', maxUsesPerUser: '1', isAuto: false, isVisible: false,
});

/** Modelos para começar com um toque. São sugestões editáveis: o restaurante vê a regra antes de salvar. */
export const COUPON_TEMPLATES: { label: string; draft: Partial<CouponDraft> }[] = [
  { label: 'Primeira visita', draft: { title: 'Primeira visita', percent: '10', audience: 'new' } },
  { label: 'Happy hour', draft: { title: 'Happy hour', percent: '15', dow: [2, 3, 4], hoursFrom: '15:00', hoursUntil: '18:00' } },
  { label: 'Aniversariante', draft: { title: 'Aniversariante', percent: '20', audience: 'birthday' } },
  { label: 'Volte a nos visitar', draft: { title: 'Volte a nos visitar', percent: '10', audience: 'inactive', inactiveDays: '30' } },
  { label: 'Sobremesa grátis', draft: { title: 'Sobremesa grátis', discountKind: 'free_item', minOrderReais: '100' } },
];

export const COUPON_STATUS_LABEL: Record<CouponRow['status'], string> = {
  active: 'Ativo', scheduled: 'Agendado', paused: 'Pausado', sold_out: 'Esgotado', ended: 'Encerrado',
};

const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const SERVICE = { fine_dining: 'Fine', casual_dining: 'Casual', quick_service: 'Quick' } as Record<string, string>;
const AUDIENCE = { new: 'para clientes novos', vip: 'para clientes VIP', birthday: 'para aniversariantes do mês' } as Record<string, string>;

function daysText(dow: number[]): string {
  const sorted = [...dow].sort((a, b) => a - b);
  const contiguous = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
  if (sorted.length > 2 && contiguous) return `de ${DAYS[sorted[0]]} a ${DAYS[sorted[sorted.length - 1]]}`;
  return sorted.map((day) => DAYS[day]).join(', ');
}

const hourText = (hour: string) => {
  const [hours, minutes] = hour.split(':');
  return `${parseInt(hours, 10) || 0}h${minutes && minutes !== '00' ? minutes : ''}`;
};

/** A regra em uma frase, enquanto o restaurante preenche. `names` traduz item e categoria. A validação é do servidor. */
export function couponSentence(draft: CouponDraft, names: Record<string, string> = {}): string {
  const parts: string[] = [];
  const scopeNames = draft.scopeIds.map((id) => names[id]).filter(Boolean).join(', ');
  const scopeText = draft.scope !== 'bill' && scopeNames ? ` em ${scopeNames}` : '';
  if (draft.discountKind === 'percent') parts.push(`${draft.percent || 0}% de desconto${scopeText}`);
  else if (draft.discountKind === 'fixed') parts.push(`R$ ${draft.reais || 0} de desconto${scopeText}`);
  else parts.push(`${names[draft.freeItemId] ?? 'Item'} grátis`);
  if (draft.minOrderReais.trim()) parts.push(`acima de R$ ${draft.minOrderReais.trim()}`);
  if (draft.dow.length) parts.push(daysText(draft.dow));
  if (draft.hoursFrom && draft.hoursUntil) parts.push(`das ${hourText(draft.hoursFrom)} às ${hourText(draft.hoursUntil)}`);
  if (draft.services.length) parts.push(`no ${draft.services.map((service) => SERVICE[service] ?? service).join(' e ')}`);
  if (draft.audience === 'inactive') parts.push(`para quem não visita há ${draft.inactiveDays || 30} dias`);
  else if (AUDIENCE[draft.audience]) parts.push(AUDIENCE[draft.audience]);
  const perUser = draft.maxUsesPerUser.trim();
  if (perUser) parts.push(`${perUser} ${perUser === '1' ? 'vez' : 'vezes'} por cliente`);
  if (draft.until) parts.push(`até ${draft.until.slice(0, 5)}`);
  return parts.join(', ');
}

function cents(text: string): number | null {
  const match = text.trim().match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  return match ? parseInt(match[1], 10) * 100 + parseInt((match[2] ?? '').padEnd(2, '0'), 10) : null;
}

const integer = (text: string) => (/^\d+$/.test(text.trim()) ? parseInt(text.trim(), 10) : null);

/** DD/MM/AAAA para AAAA-MM-DD. Nulo quando a data não existe. */
export function isoDate(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? `${year}-${month}-${day}` : null;
}

// O dia do cupom é o do Brasil, como no servidor.
const startOfDay = (iso: string) => `${iso}T00:00:00-03:00`;
const endOfDay = (iso: string) => `${iso}T23:59:59-03:00`;

/** O que vai ao servidor, em centavos e basis points. Datas inválidas ficam nulas: o servidor recusa com a mensagem. */
export function draftToPayload(draft: CouponDraft): Record<string, unknown> {
  const percent = parseFloat(draft.percent.replace(',', '.'));
  const from = isoDate(draft.from);
  const until = isoDate(draft.until);
  return {
    id: draft.id, title: draft.title.trim(), code: draft.code.trim(), discountKind: draft.discountKind,
    discountBps: draft.discountKind === 'percent' && Number.isFinite(percent) ? Math.round(percent * 100) : null,
    discountCents: draft.discountKind === 'fixed' ? cents(draft.reais) : null,
    freeItemId: draft.discountKind === 'free_item' ? draft.freeItemId : null,
    minOrderCents: draft.minOrderReais.trim() ? cents(draft.minOrderReais) : null,
    services: draft.services.length ? draft.services : null, scope: draft.scope, scopeIds: draft.scope === 'bill' ? null : draft.scopeIds, dow: draft.dow.length ? draft.dow : null,
    hoursFrom: draft.hoursFrom.trim() || null, hoursUntil: draft.hoursUntil.trim() || null,
    audience: draft.audience, inactiveDays: draft.audience === 'inactive' ? integer(draft.inactiveDays) ?? DEFAULT_VALIDITY_DAYS : null,
    maxUses: integer(draft.maxUses), maxUsesPerUser: integer(draft.maxUsesPerUser) ?? 1,
    validFrom: from ? startOfDay(from) : null, validUntil: until ? endOfDay(until) : null, isAuto: draft.isAuto, isVisible: draft.isVisible,
  };
}

const isoToBr = (iso: string) => { const date = new Date(iso); return brDate(date); };
const decimal = (value: number) => String(value).replace('.', ',');

export function rowToDraft(row: CouponRow): CouponDraft {
  return {
    ...emptyDraft(), id: row.id, title: row.title, code: row.code, discountKind: row.discountKind,
    percent: row.discountBps != null ? decimal(row.discountBps / 100) : '', reais: row.discountCents != null ? decimal(row.discountCents / 100) : '', freeItemId: row.freeItemId ?? '',
    services: row.services ?? [], scope: row.scope, scopeIds: row.scopeIds ?? [], dow: row.dow ?? [], hoursFrom: row.hoursFrom ?? '', hoursUntil: row.hoursUntil ?? '',
    minOrderReais: row.minOrderCents != null ? decimal(row.minOrderCents / 100) : '', from: isoToBr(row.validFrom), until: isoToBr(row.validUntil), audience: row.audience as CouponDraft['audience'],
    inactiveDays: row.inactiveDays != null ? String(row.inactiveDays) : '', maxUses: row.maxUses != null ? String(row.maxUses) : '',
    maxUsesPerUser: row.maxUsesPerUser != null ? String(row.maxUsesPerUser) : '1', isAuto: row.isAuto, isVisible: row.isVisible,
  };
}

/** Duplicar é um cupom novo: outro código, validade a partir de hoje e nenhum uso. */
export function duplicateDraft(row: CouponRow): CouponDraft {
  const fresh = emptyDraft();
  return { ...rowToDraft(row), id: undefined, code: '', title: `${row.title} (cópia)`, from: fresh.from, until: fresh.until };
}

/** Link e QR do cupom. Abre o app na página do restaurante, com o código à vista. */
export const couponLink = (restaurantId: string, code: string) => `https://noowebr.com/c/${restaurantId}/${encodeURIComponent(code)}`;

export type MenuChoice = { id: string; name: string; items: { id: string; name: string }[] };

/** Só o que a tela usa do cardápio. */
export function menuChoices(menu: unknown): MenuChoice[] {
  if (!Array.isArray(menu)) return [];
  return menu.map((category: any) => ({
    id: category.id, name: category.name,
    items: Array.isArray(category.items) ? category.items.map((item: any) => ({ id: item.id, name: item.name })) : [],
  }));
}
