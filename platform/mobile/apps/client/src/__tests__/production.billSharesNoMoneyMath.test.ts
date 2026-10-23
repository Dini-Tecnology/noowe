import fs from 'fs';
import path from 'path';

// Invariante 2: o app exibe valores, nunca os determina. Nada de aritmética de dinheiro
// nas telas e no serviço da divisão de conta.
const FILES = ['services/bill-shares.ts', 'screens/production/SplitBillScreen.tsx', 'screens/production/SharePaymentScreen.tsx'];
const FORBIDDEN = [/Math\.(round|ceil|floor)/, /toFixed\(/, /parseFloat/, /\*\s*\(?\s*(tip|fee|pct|percent)/i, /(amount|total|tip|fee)\w*\s*[*/]\s*\d/i];

test.each(FILES)('%s não faz conta com dinheiro', (file) => {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\/\/.*$/gm, '');
  for (const pattern of FORBIDDEN) expect(source).not.toMatch(pattern);
});
