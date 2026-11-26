import { tableCellA11yLabel, waiterTableA11yLabel } from '../screens/v2/shared/tableBill';

describe('rótulos de acessibilidade da mesa (Obs. D)', () => {
  it('mapa de mesas: sem vírgula sobrando e com pessoas e consumo', () => {
    const label = tableCellA11yLabel(
      { label: '4', guestName: '', section: '', guests: 3, reservationGuests: 0, effectiveSeats: 4, sessionId: 's1', totalSpent: 52.5, remainingCents: null, spentHidden: false },
      'Ocupada',
    );
    expect(label).not.toMatch(/,\s*,|^,/);
    expect(label).toContain('3 pessoas');
    expect(label).toMatch(/Consumo R\$\s?52,50/);
  });

  it('cartão do garçom: lê pessoas, pedidos e consumo', () => {
    const label = waiterTableA11yLabel(
      { tableNumber: '7', guestName: null, guestCount: 1, seats: 4, pendingOrders: 2, totalSpent: 10, remainingCents: null, spentHidden: false },
      true, 1, false,
    );
    expect(label).not.toMatch(/,\s*,|^,/);
    expect(label).toContain('1 pessoa');
    expect(label).toContain('2 pedidos');
    expect(label).toMatch(/Consumo R\$\s?10,00/);
    expect(label).toContain('1 chamado aberto');
  });
});
