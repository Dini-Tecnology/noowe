import { normalizeStaffInviteCode, staffInviteCodeFromUrl, staffInviteShareMessage } from '../screens/v2/shared/staffInvite';

const code = '0123456789abcdef0123456789abcdef';

describe('convite de equipe (O3, critério 6)', () => {
  it('aceita o código digitado, com espaços ou maiúsculas', () => {
    expect(normalizeStaffInviteCode(` ${code.toUpperCase()} `)).toBe(code);
  });

  it('aceita quem cola o link inteiro no campo', () => {
    expect(normalizeStaffInviteCode(`okinawa-restaurant://convite/${code}`)).toBe(code);
  });

  it('recusa o que não é código', () => {
    expect(normalizeStaffInviteCode('abc')).toBeNull();
    expect(normalizeStaffInviteCode('')).toBeNull();
    expect(normalizeStaffInviteCode(null)).toBeNull();
  });

  it('lê o código do link de convite', () => {
    expect(staffInviteCodeFromUrl(`okinawa-restaurant://convite/${code}`)).toBe(code);
    expect(staffInviteCodeFromUrl(`okinawa-restaurant://convite/${code}?x=1`)).toBe(code);
  });

  it('não se apropria de outros links', () => {
    expect(staffInviteCodeFromUrl(`okinawa-restaurant://auth/callback?t=${code}`)).toBeNull();
    expect(staffInviteCodeFromUrl(`https://site.com/convite/${code}`)).toBeNull();
    expect(staffInviteCodeFromUrl(null)).toBeNull();
  });

  it('a mensagem leva o link e o código', () => {
    const message = staffInviteShareMessage(`okinawa-restaurant://convite/${code}`, code);
    expect(message).toContain(`okinawa-restaurant://convite/${code}`);
    expect(message).toContain(`código ${code}`);
  });
});
