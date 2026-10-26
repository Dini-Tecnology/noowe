-- Próxima abertura quando o restaurante está fechado: hoje, amanhã ou dias depois (7 dias à frente).
begin;
select plan(1);
do $$
declare
  hours jsonb := '{
    "sunday":{"closed":true,"shifts":[]}, "monday":{"closed":true,"shifts":[]},
    "tuesday":{"closed":false,"shifts":[{"open":"10:00","close":"23:30"}]},
    "wednesday":{"closed":false,"shifts":[{"open":"19:00","close":"23:30"}]},
    "thursday":{"closed":true,"shifts":[]}, "friday":{"closed":false,"shifts":[{"open":"19:00","close":"00:30"}]},
    "saturday":{"closed":true,"shifts":[]}}';
  r jsonb;
begin
  -- Segunda 14:00 (fechada o dia todo): abre amanhã, terça, 10:00.
  r := private.opening_hours_status(hours, '2026-10-26 14:00');
  assert r->>'isOpen' = 'false' and r->>'opensAt' = '10:00' and (r->>'opensInDays')::int = 1 and (r->>'opensWeekday')::int = 2,
    'segunda fechada: próxima abertura é terça 10:00';

  -- Terça 08:00: ainda abre hoje.
  r := private.opening_hours_status(hours, '2026-10-27 08:00');
  assert r->>'opensAt' = '10:00' and (r->>'opensInDays')::int = 0, 'terça cedo: abre hoje';

  -- Terça 23:45: passou do turno; quarta 19:00.
  r := private.opening_hours_status(hours, '2026-10-27 23:45');
  assert r->>'opensAt' = '19:00' and (r->>'opensInDays')::int = 1 and (r->>'opensWeekday')::int = 3, 'terça tarde: quarta 19:00';

  -- Quarta 23:45: quinta fechada, abre sexta 19:00 (2 dias).
  r := private.opening_hours_status(hours, '2026-10-28 23:45');
  assert r->>'opensAt' = '19:00' and (r->>'opensInDays')::int = 2 and (r->>'opensWeekday')::int = 5, 'quarta tarde: sexta 19:00';

  -- Aberto: nada de próxima abertura; fecha às 23:30.
  r := private.opening_hours_status(hours, '2026-10-27 12:00');
  assert (r->>'isOpen')::boolean and r->>'closesAt' = '23:30' and r->'opensAt' = 'null'::jsonb and r->'opensInDays' = 'null'::jsonb, 'aberto';

  -- Sexta 00:10 (ainda no turno de quinta? quinta fechada): sexta 19:00 hoje; e sábado 00:10 está no turno de sexta.
  r := private.opening_hours_status(hours, '2026-10-31 00:10');
  assert (r->>'isOpen')::boolean and r->>'closesAt' = '00:30', 'sábado 00:10 ainda no turno de sexta';

  -- Sem nenhum horário cadastrado: sem próxima abertura.
  r := private.opening_hours_status('{}'::jsonb, '2026-10-26 14:00');
  assert r->>'isOpen' = 'false' and r->'opensAt' = 'null'::jsonb and r->'opensInDays' = 'null'::jsonb, 'sem horários';
end $$;
select pass('próxima abertura: hoje, amanhã, dias depois, aberto e sem horários');
select * from finish();
rollback;
