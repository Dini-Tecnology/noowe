import { Alert } from 'react-native';
import { showTableQrOutcome, type QrScanOutcome } from '../hooks/qr-scan-outcome';

function run(outcome: QrScanOutcome) {
  const actions = { onOpened: jest.fn(), onRetry: jest.fn(), onOpenAccount: jest.fn() };
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  showTableQrOutcome(outcome, actions);
  return { actions, alertSpy };
}

describe('showTableQrOutcome — novos motivos', () => {
  afterEach(() => jest.restoreAllMocks());

  it('QR que não é do NOOWE explica e oferece escanear outro', () => {
    const { alertSpy } = run({ ok: false, reason: 'not_noowe' });
    expect(alertSpy.mock.calls[0][0]).toBe('QR Code não reconhecido');
    expect((alertSpy.mock.calls[0][2] as { text: string }[])[0].text).toBe('Escanear outro');
  });

  it('restaurante fechado tem mensagem própria, não "sem conexão"', () => {
    const { alertSpy } = run({ ok: false, reason: 'closed' });
    expect(alertSpy.mock.calls[0][0]).toBe('Restaurante fechado');
  });

  it('check-in sem reserva não diz que a mesa é de outro cliente', () => {
    const { alertSpy } = run({ ok: false, reason: 'booking_required' });
    expect(alertSpy.mock.calls[0][0]).toBe('Reserva necessária');
  });

  it('cancelado pelo usuário destrava o scanner sem alerta', () => {
    const { alertSpy, actions } = run({ ok: false, reason: 'cancelled' });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(actions.onRetry).toHaveBeenCalledTimes(1);
  });

  it('sucesso informa se houve troca de restaurante', () => {
    const { actions } = run({ ok: true, restaurantId: 'r2', switched: true });
    expect(actions.onOpened).toHaveBeenCalledWith('r2', { switched: true });
    const plain = run({ ok: true, restaurantId: 'r1' });
    expect(plain.actions.onOpened).toHaveBeenCalledWith('r1', { switched: false });
  });
});
