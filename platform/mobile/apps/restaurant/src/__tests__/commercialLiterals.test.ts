// Fatia M1, critério 1: taxa, faixa, preço e prazo comercial vêm de private.noowe_* (ADR-031), nunca do código.
// As funções do banco são varridas em platform/supabase/tests/51_m1_parametros_noowe.sql.
import * as fs from 'fs';
import * as path from 'path';

const PLATFORM = path.resolve(__dirname, '../../../../..');
const ROOTS = ['mobile/apps/client/src', 'mobile/apps/restaurant/src', 'mobile/shared', 'supabase/functions'];
const SKIP_DIRS = new Set(['node_modules', '__tests__', '__mocks__', 'dist', 'build']);

const COMMERCIAL_LITERALS: RegExp[] = [
  /R\$\s?(199|349|649|1\.990|3\.490|6\.490)\b/,
  /R\$\s?0,(99|15)\b/,
  /\b(3,49|1,49|0,99|3,6)\s?%/,
  /\b0\.0(349|149|099|36)\b/,
  /\b(19900|34900|64900|199000|349000|649000)\b/,
  /\b(800000|1500000|3000000)\b/,
  /\b(fee|rate|taxa|bps)\w*\s*[:=]\s*(349|149|99|360)\b/i,
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path.join(dir, entry.name));
    const isSource = /\.tsx?$/.test(entry.name) && !/(_test|\.test|\.d)\.tsx?$/.test(entry.name);
    return isSource ? [path.join(dir, entry.name)] : [];
  });
}

describe('critério 1: nenhum literal comercial no código', () => {
  const hits = (text: string) => COMMERCIAL_LITERALS.some((pattern) => pattern.test(text));

  it('a varredura enxerga os casos que precisa pegar', () => {
    for (const sample of ['R$ 199/mês', 'R$ 0,99', '3,49%', 'rate: 0.0349', 'priceCents = 34900', 'feeBps: 349']) {
      expect(hits(sample)).toBe(true);
    }
    expect(hits("shadowColor: 'rgba(0, 0, 0, 0.15)'")).toBe(false);
  });

  it('apps e Edge Functions não carregam taxa, preço ou volume comercial', () => {
    const files = ROOTS.flatMap((root) => sourceFiles(path.join(PLATFORM, root)));
    expect(files.length).toBeGreaterThan(100);
    const found = files.flatMap((file) =>
      fs.readFileSync(file, 'utf8').split('\n').flatMap((line, index) =>
        hits(line) ? [`${path.relative(PLATFORM, file)}:${index + 1}: ${line.trim().slice(0, 100)}`] : []));
    expect(found).toEqual([]);
  });
});
