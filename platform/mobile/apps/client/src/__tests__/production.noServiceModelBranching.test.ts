import fs from 'fs';
import path from 'path';
import { isCounterJourney, isTableJourney, journeyFeatures } from '@okinawa/shared/config/service-types';

// CLAUDE.md / IV-10: nada ramifica por service_model; ramifica-se por capacidade
// (journeyFeatures/isTableJourney/isCounterJourney em shared/config/service-types).
const SRC = path.join(__dirname, '..');
// HomeScreen: o id do chip de filtro escolhido pelo usuário, não a capacidade de um restaurante.
const ALLOWED = new Set(['screens/production/HomeScreen.tsx']);
const MODEL = `'(fine_dining|casual_dining|quick_service)'`;
const FORBIDDEN = [new RegExp(`[!=]==\\s*${MODEL}`), new RegExp(`${MODEL}\\s*[!=]==`), new RegExp(`\\.includes\\(${MODEL}\\)`), new RegExp(`\\[${MODEL}(,\\s*${MODEL})*\\]\\.includes\\(`)];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : files(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

test('nenhum arquivo do app compara o modelo de serviço', () => {
  const offenders = files(SRC).flatMap((file) => {
    const rel = path.relative(SRC, file);
    if (ALLOWED.has(rel)) return [];
    const source = fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
    return FORBIDDEN.some((p) => p.test(source)) ? [rel] : [];
  });
  expect(offenders).toEqual([]);
});

test('flags de jornada saem da configuração do modelo', () => {
  expect(isTableJourney('fine_dining')).toBe(true);
  expect(isTableJourney('quick_service')).toBe(false);
  expect(isCounterJourney('quick_service')).toBe(true);
  expect(isCounterJourney(null)).toBe(false);
  expect(isTableJourney(undefined)).toBe(false);
  expect(journeyFeatures('x')).toBeNull();
});
