import { Alert } from 'react-native';
import { devScanErrorMessage, runDevTableScan } from '../components/dev/dev-table-scan';
import { showTableQrOutcome, type QrScanOutcome } from '../hooks/qr-scan-outcome';

describe('runDevTableScan', () => {
  it('opens the comanda with the QR the database picked', async () => {
    const pick = jest.fn().mockResolvedValue({ qrCodeData: 'noowe://t/abc' });
    const handleQrScanned = jest.fn().mockResolvedValue({ ok: true, restaurantId: 'r1' });

    await expect(runDevTableScan(pick, handleQrScanned, 'r1')).resolves.toEqual({
      ok: true,
      restaurantId: 'r1',
    });

    expect(pick).toHaveBeenCalledWith('r1');
    expect(handleQrScanned).toHaveBeenCalledWith('noowe://t/abc');
  });

  it('does not pretend a scan happened when no table QR is available', async () => {
    const handleQrScanned = jest.fn();
    const pick = jest.fn().mockRejectedValue({ message: 'Não há mesa livre para abrir uma comanda de teste.' });

    await expect(runDevTableScan(pick, handleQrScanned)).rejects.toEqual({
      message: 'Não há mesa livre para abrir uma comanda de teste.',
    });
    expect(handleQrScanned).not.toHaveBeenCalled();
  });
});

describe('devScanErrorMessage', () => {
  it('reads the message from a Postgrest error', () => {
    expect(devScanErrorMessage({ message: 'O atalho de mesa de teste está desligado no banco.' }))
      .toBe('O atalho de mesa de teste está desligado no banco.');
  });
});

describe('showTableQrOutcome', () => {
  afterEach(() => jest.restoreAllMocks());

  it('navigates when the scan opens a table', () => {
    const onOpened = jest.fn();
    showTableQrOutcome(
      { ok: true, restaurantId: 'r1' },
      { onOpened, onRetry: jest.fn(), onOpenAccount: jest.fn() },
    );
    expect(onOpened).toHaveBeenCalledWith('r1');
  });

  it.each<[QrScanOutcome, string]>([
    [{ ok: false, reason: 'invalid' }, 'QR inválido'],
    [{ ok: false, reason: 'table_unavailable' }, 'Mesa indisponível'],
    [{ ok: false, reason: 'active_account' }, 'Você já tem uma conta aberta'],
    [{ ok: false, reason: 'network' }, 'Não foi possível ler o QR'],
  ])('explains %s', (outcome, title) => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    showTableQrOutcome(outcome, { onOpened: jest.fn(), onRetry: jest.fn(), onOpenAccount: jest.fn() });
    expect(alertSpy).toHaveBeenCalledWith(title, expect.any(String), expect.any(Array));
  });
});
