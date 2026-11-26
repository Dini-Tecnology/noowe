jest.mock('../services/customer-backend', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => null }) }));
import { describeTableInviteError } from '../hooks/useTableUserInvites';

// CT-08: reaceitar um convite já usado depois de sair da mesa mostra o motivo do servidor, não some em silêncio.
test('convite usado por quem saiu da mesa mostra a mensagem do servidor', () => {
  const message = 'Você saiu desta mesa. Peça um novo convite ou leia o QR da mesa para voltar.';
  expect(describeTableInviteError({ code: 'P0001', message })).toBe(message);
});
