import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
let mockSession: { restaurantId: string; tableSessionId: string | null } | null = null;
jest.mock('../contexts/VisitSessionContext', () => ({ useVisitSession: () => ({ session: mockSession }) }));
const mockClearCart = jest.fn();
let mockCart = { items: [{ id: 'i1' }], restaurantId: 'r1', clearCart: mockClearCart };
jest.mock('@/shared/contexts/CartContext', () => ({ useCart: () => mockCart }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({
  useColors: () => ({ primary: '#f60', border: '#ccc', card: '#fff', foreground: '#000' }),
}));

import { SessionCartSync } from '../components/SessionCartSync';
import { SelectChip } from '../components/restaurant/SelectionControls';

describe('SessionCartSync — Obs. H', () => {
  beforeEach(() => { mockClearCart.mockClear(); mockCart = { items: [{ id: 'i1' }], restaurantId: 'r1', clearCart: mockClearCart }; });

  it('limpa o carrinho não enviado quando a comanda é trocada por outra', () => {
    mockSession = { restaurantId: 'r1', tableSessionId: 's1' };
    const view = render(<SessionCartSync />);
    expect(mockClearCart).not.toHaveBeenCalled();
    mockSession = { restaurantId: 'r1', tableSessionId: 's2' };
    view.rerender(<SessionCartSync />);
    expect(mockClearCart).toHaveBeenCalledTimes(1);
  });

  it('limpa quando a comanda termina', () => {
    mockSession = { restaurantId: 'r1', tableSessionId: 's1' };
    const view = render(<SessionCartSync />);
    mockSession = null;
    view.rerender(<SessionCartSync />);
    expect(mockClearCart).toHaveBeenCalledTimes(1);
  });

  it('mantém o carrinho montado antes de sentar (sem comanda anterior)', () => {
    mockSession = null;
    const view = render(<SessionCartSync />);
    mockSession = { restaurantId: 'r1', tableSessionId: 's1' };
    view.rerender(<SessionCartSync />);
    expect(mockClearCart).not.toHaveBeenCalled();
  });
});

describe('SelectChip — Obs. K/L', () => {
  it('é um botão com rótulo próprio, sem variável vazia', () => {
    const { getByRole } = render(<SelectChip label="19:30" accessibilityLabel="Horário 19:30" onPress={() => {}} />);
    expect(getByRole('button', { name: 'Horário 19:30' })).toBeTruthy();
  });
  it('usa o texto visível quando não há rótulo explícito', () => {
    const { getByRole } = render(<SelectChip label="4" onPress={() => {}} />);
    expect(getByRole('button', { name: '4' })).toBeTruthy();
  });
});
