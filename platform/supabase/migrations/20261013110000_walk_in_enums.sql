-- ADR-016: motivo de decisão para liberar a abertura de mesa quando há fila ativa.
-- Valor de enum fica em migration própria: não pode ser usado na transação que o cria.
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'noowe_capacity_decision_reason' and e.enumlabel = 'walk_in_liberado'
  ) then
    alter type public.noowe_capacity_decision_reason add value 'walk_in_liberado';
  end if;
end $$;
