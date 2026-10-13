import { describeLayoutError, groupCapacity, isFreeRoot, joinCandidates, swapCandidates } from '../screens/v2/shared/tableLayout';

const table = (id: string, label: string, seats: number, overrides: Record<string, unknown> = {}) => ({
  id, label, seats, effectiveSeats: seats, status: 'available', sessionId: null, mergedIntoId: null,
  mergedChildren: [], section: 'Salão', ...overrides,
}) as any;

describe('tableLayout (ADR-018)', () => {
  const tables = [
    table('a', '1', 2),
    table('b', '2', 6),
    table('c', '3', 4, { status: 'occupied', sessionId: 's' }),
    table('d', '4', 4, { mergedIntoId: 'b' }),
    table('e', '5', 4, { mergedChildren: [{ id: 'x', label: '6', seats: 2 }], effectiveSeats: 6 }),
  ];

  it('só mesa livre e principal recebe um grupo', () => {
    expect(tables.map((t) => isFreeRoot(t))).toEqual([true, true, false, false, true]);
  });

  it('troca: lista as que comportam primeiro e marca as que não comportam', () => {
    const result = swapCandidates(tables, { excludeId: 'a', needed: 5 });
    expect(result.map((c) => [c.label, c.fits])).toEqual([['2', true], ['5', true]]);
    const small = swapCandidates(tables, { needed: 5 });
    expect(small.map((c) => c.label)).toEqual(['2', '5', '1']);
    expect(small.at(-1)!.fits).toBe(false);
  });

  it('junção: só mesas livres e sozinhas, nunca a própria principal', () => {
    expect(joinCandidates(tables, 'a').map((c) => c.label)).toEqual(['2']);
  });

  it('a capacidade do grupo soma os lugares escolhidos à principal', () => {
    expect(groupCapacity({ effectiveSeats: 4 }, [{ seats: 2 }, { seats: 6 }])).toBe(12);
  });

  it.each([
    ['P0013', /unida a outra/],
    ['P0014', /não está livre/],
    ['42501', /não pode reorganizar/],
  ])('%s é explicado', (code, pattern) => {
    expect(describeLayoutError({ code })).toMatch(pattern);
  });

  it('P0015 mostra a conta que o servidor fez', () => {
    expect(describeLayoutError({ code: 'P0015', message: 'Mesa com 4 lugares para 5 pessoas' })).toBe('Mesa com 4 lugares para 5 pessoas');
  });
});
