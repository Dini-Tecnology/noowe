-- O teto de retenção segue a regra das outras tabelas de parâmetro da NOOWE: fechada, com histórico e sem truncate.
do $$
begin
  execute 'alter table private.noowe_tip_retention_caps enable row level security';
  execute 'revoke all on private.noowe_tip_retention_caps from public, anon, authenticated, service_role';
  execute 'create trigger trg_noowe_tip_retention_caps_history after insert or update or delete on private.noowe_tip_retention_caps
    for each row execute function private.noowe_param_record_change()';
  execute 'create trigger trg_noowe_tip_retention_caps_no_truncate before truncate on private.noowe_tip_retention_caps
    for each statement execute function private.noowe_param_refuse_truncate()';
end $$;
