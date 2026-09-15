#!/usr/bin/env node
/**
 * Gera CREATE TABLE IF NOT EXISTS a partir de backend/tmp/supabase-migration/schema-inventory.json
 *
 * Uso (na raiz do repo):
 *   node platform/supabase/scripts/generate-backend-parity-schema.mjs
 *
 * Saída:
 *   platform/supabase/migrations/20260430180000_generated_rest_platform_tables.sql
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INVENTORY_PATH = join(
  __dirname,
  '../../backend/tmp/supabase-migration/schema-inventory.json'
);

/** Já criadas pelo bootstrap Supabase + migração de menu */
const SKIP_TABLES = new Set([
  'profiles',
  'restaurants',
  'user_roles',
  'orders',
  'order_items',
  'reservations',
  'notifications',
  'waitlist_entries',
  'menu_categories',
  'menu_items',
  'users',
]);

function normalizeNullable(col) {
  if (typeof col.isNullable === 'boolean') return col.isNullable;
  const t = String(col.type ?? '');
  if (t.includes('| null')) return true;
  return false;
}

function columnSql(col) {
  const name = col.databaseName;
  const nullable = normalizeNullable(col);
  const nn = nullable ? '' : ' not null';

  if (col.isPrimary && name === 'id') {
    return `  ${name} uuid primary key default gen_random_uuid()`;
  }

  const rawType = String(col.type ?? '');

  if (name.endsWith('_id')) {
    return `  ${name} uuid${nn}`;
  }

  // Inventário offline marca vários timestamps como string — normaliza *_at / *_on
  if (
    (name.endsWith('_at') || name.endsWith('_on')) &&
    rawType !== 'Date' &&
    !rawType.includes('timestamptz')
  ) {
    return `  ${name} timestamptz${nn}`;
  }

  let base = 'text';
  if (rawType === 'string' || rawType.startsWith('string')) base = 'text';
  else if (rawType === 'number' || rawType.includes('number')) base = 'numeric';
  else if (rawType === 'boolean') base = 'boolean';
  else if (rawType === 'Date') base = 'timestamptz';
  else if (rawType.includes('Record') || rawType.includes('Json') || rawType === 'object')
    base = 'jsonb';
  else if (/^[A-Z][a-zA-Z0-9_]+$/.test(rawType)) base = 'text';
  else base = 'text';

  return `  ${name} ${base}${nn}`;
}

function generate() {
  const raw = readFileSync(INVENTORY_PATH, 'utf8');
  const data = JSON.parse(raw);
  const entities = data.entities ?? [];

  const chunks = [];
  chunks.push(`-- Gerado por generate-backend-parity-schema.mjs
-- Fonte: backend/tmp/supabase-migration/schema-inventory.json
-- Enums TypeORM como text (podem virar CREATE TYPE depois).
-- Sem FKs aqui — adicionar em migração dedicada quando estáveis.

`);

  const seen = new Set();

  for (const ent of entities) {
    const table = ent.tableName;
    if (!table || SKIP_TABLES.has(table) || seen.has(table)) continue;
    seen.add(table);

    const cols = (ent.columns ?? []).map(columnSql).join(',\n');
    chunks.push(`create table if not exists public.${table} (\n${cols}\n);\n\n`);
  }

  const outPath = join(__dirname, '../migrations/20260430180000_generated_rest_platform_tables.sql');
  writeFileSync(outPath, chunks.join(''), 'utf8');
  console.log(`OK: ${seen.size} tabelas → ${outPath}`);
}

generate();
