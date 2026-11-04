import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PromotionsScreen from '../screens/v2/PromotionsScreen';
import { CouponsEntry } from '../screens/v2/shared/CouponsEntry';
import { WaiterAppShareCard } from '../screens/v2/shared/WaiterAppShareCard';
import { couponLink, couponSentence, draftToPayload, duplicateDraft, emptyDraft, isoDate, rowToDraft } from '../screens/v2/shared/coupons';

const mockApi = { listCoupons: jest.fn(), saveCoupon: jest.fn(), setCouponActive: jest.fn(), sendCoupon: jest.fn(), endCoupon: jest.fn(), getMenu: jest.fn() };
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (fn: () => void) => { require('react').useEffect(fn, []); } }));
let mockRoles = ['owner'];
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));
jest.mock('../contexts/RestaurantRoleContext', () => ({ useRestaurantRole: () => ({ restaurantId: 'r1', serverRoles: mockRoles }) }));
jest.mock('../screens/v2/shared/V2Shell', () => ({ V2Shell: ({ children }: any) => <>{children}</> }));
jest.mock('@okinawa/shared/utils/user-error-message', () => ({ userErrorMessage: (_: unknown, fallback: string) => fallback }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({ get supabaseApiAdapter() { return mockApi; } }));
jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const api = mockApi;

const row = { id: 'c1', code: 'DEZ', title: 'Dez', status: 'active', discountKind: 'percent', discountBps: 1000, discountCents: null, freeItemId: null, minOrderCents: null, services: null, scope: 'bill', scopeIds: null, dow: null, hoursFrom: null, hoursUntil: null,
  audience: 'all', inactiveDays: null, maxUses: 10, maxUsesPerUser: 1, validFrom: '2026-11-01T00:00:00Z', validUntil: '2026-11-30T00:00:00Z', isAuto: false, isVisible: false, locked: false, uses: 3, discountGivenCents: 1500, revenueCents: 45000, avgTicketCents: 15000, newCustomers: 2 };
const menu = [{ id: 'cat1', name: 'Bebidas', items: [{ id: 'i1', name: 'Pudim' }] }];

beforeEach(() => {
  jest.clearAllMocks();
  mockRoles = ['owner'];
  api.listCoupons.mockResolvedValue([]);
  api.saveCoupon.mockResolvedValue({});
  api.endCoupon.mockResolvedValue(undefined);
  api.getMenu.mockResolvedValue(menu);
});

describe('a regra em uma frase', () => {
  it('monta o exemplo do aditivo', () => {
    const draft = { ...emptyDraft(), percent: '10', scope: 'categories' as const, scopeIds: ['cat1'], dow: [2, 3, 4], hoursFrom: '15:00', hoursUntil: '18:00', services: ['casual_dining'], audience: 'new' as const, until: '30/11/2026' };
    expect(couponSentence(draft, { cat1: 'Bebidas' })).toBe('10% de desconto em Bebidas, de terça a quinta, das 15h às 18h, no Casual, para clientes novos, 1 vez por cliente, até 30/11');
    expect(couponSentence({ ...draft, discountKind: 'free_item', freeItemId: 'i1', scope: 'bill', scopeIds: [] }, { i1: 'Pudim' })).toMatch(/^Pudim grátis/);
  });

  it('vai ao servidor em centavos e basis points', () => {
    const fixed = draftToPayload({ ...emptyDraft(), discountKind: 'fixed', reais: '12,50', minOrderReais: '80', title: ' X ' });
    expect(fixed).toMatchObject({ discountCents: 1250, minOrderCents: 8000, discountBps: null, title: 'X' });
    expect(draftToPayload({ ...emptyDraft(), percent: '12,5' })).toMatchObject({ discountBps: 1250, scope: 'bill', scopeIds: null });
    expect(draftToPayload({ ...emptyDraft(), from: '01/11/2026', until: '30/11/2026' })).toMatchObject({ validFrom: '2026-11-01T00:00:00-03:00', validUntil: '2026-11-30T23:59:59-03:00' });
  });

  it('data que não existe não vira outra data', () => {
    expect(isoDate('31/02/2026')).toBeNull();
    expect(isoDate('2026-11-30')).toBeNull();
    expect(draftToPayload({ ...emptyDraft(), until: '99/99/2026' })).toMatchObject({ validUntil: null });
  });
});

describe('criação em 3 passos (critério 1)', () => {
  it('modelo pronto preenche, e a frase acompanha; salva no fim', async () => {
    const view = render(<PromotionsScreen />);
    fireEvent.press(await view.findByText('Happy hour'));
    expect(view.getByText(/15% de desconto, de terça a quinta, das 15h às 18h/)).toBeTruthy();
    fireEvent.press(view.getByText('Continuar'));
    expect(view.getByText('Onde e quando vale')).toBeTruthy();
    fireEvent.press(view.getByText('Continuar'));
    expect(view.getByText('Para quem e quantas vezes')).toBeTruthy();
    fireEvent.press(view.getByText('Salvar cupom'));
    await waitFor(() => expect(api.saveCoupon).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'Happy hour', discountBps: 1500, dow: [2, 3, 4] })));
  });

  it('erro do servidor aparece e não fecha a edição', async () => {
    api.saveCoupon.mockRejectedValue(new Error('x'));
    const view = render(<PromotionsScreen />);
    fireEvent.press(await view.findByText('Novo cupom'));
    fireEvent.press(view.getByText('Continuar'));
    fireEvent.press(view.getByText('Continuar'));
    fireEvent.press(view.getByText('Salvar cupom'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Não foi possível salvar', expect.any(String)));
    expect(view.getByText('Salvar cupom')).toBeTruthy();
  });
});

describe('quem chega aos cupons (critério 9)', () => {
  it.each([['owner', 'Promoções'], ['manager', 'Promoções'], ['waiter', 'Cupons ativos'], ['maitre', 'Cupons ativos']])('%s entra', (role, label) => {
    mockRoles = [role];
    const onOpen = jest.fn();
    const view = render(<CouponsEntry onOpen={onOpen} />);
    fireEvent.press(view.getByText(label));
    expect(onOpen).toHaveBeenCalledWith('Promotions');
  });

  it.each(['chef', 'cook', 'barman'])('%s não vê a entrada', (role) => {
    mockRoles = [role];
    expect(render(<CouponsEntry onOpen={jest.fn()} />).toJSON()).toBeNull();
  });
});

describe('incentivo do garçom (item G)', () => {
  it('mostra só o percentual', async () => {
    mockRoles = ['waiter'];
    (api as any).getMyAppShare = jest.fn().mockResolvedValue({ percent: 62 });
    const view = render(<WaiterAppShareCard />);
    expect(await view.findByText('62%')).toBeTruthy();
    expect(view.getByText(/pagas pelo app/)).toBeTruthy();
  });

  it('não aparece para quem não é garçom, nem sem pagamento no dia', async () => {
    mockRoles = ['manager'];
    (api as any).getMyAppShare = jest.fn().mockResolvedValue({ percent: 62 });
    expect(render(<WaiterAppShareCard />).toJSON()).toBeNull();
    expect((api as any).getMyAppShare).not.toHaveBeenCalled();
    mockRoles = ['waiter'];
    (api as any).getMyAppShare = jest.fn().mockResolvedValue({ percent: null });
    const view = render(<WaiterAppShareCard />);
    await waitFor(() => expect((api as any).getMyAppShare).toHaveBeenCalled());
    expect(view.toJSON()).toBeNull();
  });
});

describe('escolhas do cardápio', () => {
  it('escopo por categoria usa o nome na frase e manda o id', async () => {
    const view = render(<PromotionsScreen />);
    fireEvent.press(await view.findByText('Novo cupom'));
    fireEvent.press(view.getByText('Continuar'));
    fireEvent.press(view.getByText('Categorias'));
    fireEvent.press(await view.findByText('Bebidas'));
    expect(view.getByText(/10% de desconto em Bebidas/)).toBeTruthy();
    fireEvent.press(view.getByText('Continuar'));
    fireEvent.press(view.getByText('Salvar cupom'));
    await waitFor(() => expect(api.saveCoupon).toHaveBeenCalledWith('r1', expect.objectContaining({ scope: 'categories', scopeIds: ['cat1'] })));
  });

  it('item grátis é escolhido do cardápio', async () => {
    const view = render(<PromotionsScreen />);
    fireEvent.press(await view.findByText('Sobremesa grátis'));
    fireEvent.press(await view.findByText('Pudim'));
    expect(view.getByText(/Pudim grátis, acima de R\$ 100/)).toBeTruthy();
    fireEvent.press(view.getByText('Continuar'));
    fireEvent.press(view.getByText('Continuar'));
    fireEvent.press(view.getByText('Salvar cupom'));
    await waitFor(() => expect(api.saveCoupon).toHaveBeenCalledWith('r1', expect.objectContaining({ discountKind: 'free_item', freeItemId: 'i1' })));
  });
});

describe('painel e divulgação', () => {
  it('mostra status e relatório, e permite enviar e pausar', async () => {
    api.listCoupons.mockResolvedValue([row]);
    api.sendCoupon.mockResolvedValue({ recipients: 4 });
    const view = render(<PromotionsScreen />);
    expect(await view.findByText(/3 uso\(s\) · R\$\s15,00 em desconto/)).toBeTruthy();
    expect(view.getByText('Ativo')).toBeTruthy();
    expect(view.getByText(/Faturamento R\$\s450,00 · ticket médio R\$\s150,00 · 2 cliente\(s\) novo\(s\)/)).toBeTruthy();
    fireEvent.press(view.getByText('Enviar ao grupo'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Cupom enviado', expect.stringContaining('aceitaram')));
    fireEvent.press(view.getByText('Pausar'));
    await waitFor(() => expect(api.setCouponActive).toHaveBeenCalledWith('c1', false));
  });

  it('link e QR apontam para o restaurante e o código', async () => {
    api.listCoupons.mockResolvedValue([row]);
    const view = render(<PromotionsScreen />);
    fireEvent.press(await view.findByText('Link e QR'));
    expect(view.getByText(couponLink('r1', 'DEZ'))).toBeTruthy();
    expect(couponLink('r1', 'DEZ')).toBe('https://noowebr.com/c/r1/DEZ');
  });

  it('encerrar pede confirmação, e encerrado só duplica', async () => {
    api.listCoupons.mockResolvedValue([row]);
    const view = render(<PromotionsScreen />);
    fireEvent.press(await view.findByText('Encerrar'));
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    expect(api.endCoupon).not.toHaveBeenCalled();
    buttons.find((button: any) => button.text === 'Encerrar').onPress();
    await waitFor(() => expect(api.endCoupon).toHaveBeenCalledWith('c1'));

    api.listCoupons.mockResolvedValue([{ ...row, status: 'ended' }]);
    const ended = render(<PromotionsScreen />);
    expect(await ended.findByText('Encerrado')).toBeTruthy();
    expect(ended.queryByText('Pausar')).toBeNull();
    expect(ended.queryByText('Editar')).toBeNull();
    expect(ended.getByText('Duplicar')).toBeTruthy();
  });

  it('duplicar é cupom novo: sem id, sem código, validade a partir de hoje', () => {
    const copy = duplicateDraft({ ...row, status: 'ended', locked: true } as any);
    expect(copy).toMatchObject({ id: undefined, code: '', title: 'Dez (cópia)', percent: '10' });
    expect(copy.from).toBe(emptyDraft().from);
  });

  it('cupom já usado abre só validade e limite (critério 7)', async () => {
    api.listCoupons.mockResolvedValue([{ ...row, locked: true }]);
    const view = render(<PromotionsScreen />);
    fireEvent.press(await view.findByText('Editar'));
    expect(view.getByText(/só validade e limite/)).toBeTruthy();
    expect(view.queryByText('Para quem e quantas vezes')).toBeNull();
    expect(view.getByLabelText('Limite de usos')).toBeTruthy();
    expect(view.queryByText('Continuar')).toBeNull();
  });

  it('garçom vê, mas não edita', async () => {
    mockRoles = ['waiter'];
    api.listCoupons.mockResolvedValue([row]);
    const view = render(<PromotionsScreen />);
    expect(await view.findByText(/Dez · DEZ/)).toBeTruthy();
    expect(view.queryByText('Novo cupom')).toBeNull();
    expect(view.queryByText('Editar')).toBeNull();
    expect(view.queryByText(/Faturamento/)).toBeNull();
    expect(api.getMenu).not.toHaveBeenCalled();
  });

  it('de volta da tabela para a edição', () => {
    const draft = rowToDraft({ ...row, validUntil: '2026-11-30T23:59:59-03:00', discountBps: 1250 } as any);
    expect(draft).toMatchObject({ percent: '12,5', maxUses: '10' });
    expect(isoDate(draft.until)).toBe(new Date('2026-11-30T23:59:59-03:00').toLocaleDateString('sv-SE'));
  });
});
