import type { QrScanOutcome } from '../../hooks/qr-scan-outcome';

export async function runDevTableScan(
  pick: (restaurantId?: string) => Promise<{ qrCodeData: string }>,
  handleQrScanned: (qrData: string) => Promise<QrScanOutcome>,
  restaurantId?: string,
): Promise<QrScanOutcome> {
  const picked = await pick(restaurantId);
  return handleQrScanned(picked.qrCodeData);
}

export function devScanErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Não foi possível abrir a mesa de teste.';
}
