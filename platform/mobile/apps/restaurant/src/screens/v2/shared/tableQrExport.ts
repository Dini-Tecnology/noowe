import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import QRCode from 'qrcode';
import type { TableQRCode } from '@okinawa/shared/services/supabase-api';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function expiryLabel(value: string | null): string {
  if (!value) return 'Sem expiração programada';
  return `Válido até ${new Intl.DateTimeFormat('pt-BR').format(new Date(value))}`;
}

export async function exportTableQrPdf(rows: TableQRCode[], fileLabel = 'qrcodes-mesas'): Promise<void> {
  const printable = rows.filter((row) => Boolean(row.qr_code_data));
  if (printable.length === 0) throw new Error('Não há QR Codes disponíveis para exportar.');

  const cards = await Promise.all(printable.map(async (row) => {
    const payload = row.qr_code_data!;
    const svg = await QRCode.toString(payload, {
      type: 'svg', errorCorrectionLevel: 'H', margin: 2, width: 680,
      color: { dark: '#111827', light: '#FFFFFF' },
    });
    return `
      <article class="card">
        <div class="brand">NOOWE</div>
        <h1>Mesa ${escapeHtml(row.table_number)}</h1>
        <p class="section">${escapeHtml(row.section || 'Salão')}</p>
        <div class="qr">${svg}</div>
        <h2>Escaneie para entrar na mesa</h2>
        <p>Abra o app Noowe Client, toque em “Escanear” e aponte a câmera para este código.</p>
        <small>${escapeHtml(expiryLabel(row.expires_at))}</small>
      </article>`;
  }));

  const html = `<!doctype html>
    <html lang="pt-BR"><head><meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; }
      .card { width: 100%; min-height: 270mm; page-break-after: always; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; border: 2px solid #E5E7EB; border-radius: 28px; padding: 20mm; }
      .card:last-child { page-break-after: auto; }
      .brand { color: #EF6C2F; font-size: 18px; font-weight: 900; letter-spacing: 5px; }
      h1 { margin: 12px 0 0; font-size: 38px; }
      .section { margin: 4px 0 18px; color: #6B7280; font-size: 18px; }
      .qr { width: 115mm; height: 115mm; padding: 5mm; background: white; }
      .qr svg { width: 100%; height: 100%; }
      h2 { margin: 18px 0 8px; font-size: 24px; }
      p { max-width: 130mm; margin: 0; color: #4B5563; font-size: 15px; line-height: 1.5; }
      small { margin-top: 18px; color: #9CA3AF; }
    </style></head><body>${cards.join('')}</body></html>`;

  const result = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Exportar ${fileLabel}`,
    });
    return;
  }
  throw new Error('O compartilhamento de arquivos não está disponível neste dispositivo.');
}
