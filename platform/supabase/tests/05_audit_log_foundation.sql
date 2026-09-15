begin;
select plan(6);

select ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'restaurant_id'),
  'audit_logs identifica a unidade'
);
select ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'reason'),
  'audit_logs exige substrato para motivo'
);
select ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'before')
  and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'after'),
  'audit_logs guarda snapshots antes e depois'
);
select ok(
  to_regprocedure('private.log_audit(uuid,text,text,uuid,text,jsonb,jsonb,uuid)') is not null,
  'helper transacional de auditoria existe'
);
select ok(
  not has_function_privilege('authenticated', 'private.log_audit(uuid,text,text,uuid,text,jsonb,jsonb,uuid)', 'execute'),
  'cliente não pode fabricar log operacional'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_restaurant_managers_read'),
  'logs operacionais são isolados por unidade'
);

select * from finish();
rollback;
