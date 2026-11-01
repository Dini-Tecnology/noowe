-- Antecipa o aviso de restaurante fechado: o resolve do QR de mesa passa a informar isOpen,
-- para o app barrar antes de perguntar a quantidade de pessoas. O bloqueio real segue no table_check_in.
create or replace function public.customer_resolve_service_qr(p_qr_data text)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_table public.table_qr_codes; v_counter public.counter_qr_codes; v_models public.noowe_service_model[];
  v_selected public.noowe_service_model; v_session_id uuid; v_policy public.restaurant_model_policies; v_root uuid;
begin
  if p_qr_data is null or length(trim(p_qr_data)) < 8 then
    raise exception 'QR inválido' using errcode = '22023';
  end if;
  select * into v_counter from public.counter_qr_codes
    where qr_code_data = p_qr_data and is_active and (expires_at is null or expires_at > now());
  if v_counter.id is not null then
    if not private.restaurant_is_open_now(v_counter.restaurant_id) then
      raise exception 'Restaurante fechado no momento' using errcode = 'P0010';
    end if;
    return jsonb_build_object('kind','counter','restaurantId',v_counter.restaurant_id,
      'serviceModel','quick_service','counterLabel',v_counter.label);
  end if;
  select * into v_table from public.table_qr_codes
    where qr_code_data = p_qr_data and is_active and (expires_at is null or expires_at > now());
  if v_table.id is null then raise exception 'QR inválido ou expirado' using errcode = 'P0002'; end if;
  v_root := private.table_group_root(v_table.table_id); -- ADR-018
  select c.service_models,
    case when r.service_type in ('fine_dining','casual_dining') then r.service_type::public.noowe_service_model
      when 'casual_dining'::public.noowe_service_model=any(c.service_models) then 'casual_dining'::public.noowe_service_model
      else 'fine_dining'::public.noowe_service_model end
  into v_models,v_selected from public.restaurant_model_configs c join public.restaurants r on r.id=c.restaurant_id
  where c.restaurant_id = v_table.restaurant_id;
  if v_models is not null and not exists (
    select 1 from unnest(v_models) m where m <> 'quick_service'::public.noowe_service_model
  ) then
    raise exception 'Este restaurante atende só por retirada' using errcode = 'P0012';
  end if;
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = v_table.restaurant_id and service_model = v_selected;
  select s.id into v_session_id from public.table_sessions s
    where s.table_id = v_root and s.status = 'active' order by s.started_at desc limit 1;
  return jsonb_build_object('kind','table','restaurantId',v_table.restaurant_id,
    'tableId',v_root,
    'scannedTableId',v_table.table_id,
    'mergedIntoTableNumber',(select t.table_number from public.tables t where t.id = v_root and v_root <> v_table.table_id),'tableQrId',v_table.id,
    'serviceModel',v_selected,
    'allowedServiceModels', to_jsonb(array_remove(v_models, 'quick_service'::public.noowe_service_model)),
    'seats', private.table_effective_seats(v_table.table_id),
    'hasActiveSession', v_session_id is not null,
    'asksPartySize', not private.check_in_party_from_entry(v_policy),
    'isParticipant', v_session_id is not null and private.is_table_session_participant(v_session_id),
    'isOpen', private.restaurant_is_open_now(v_table.restaurant_id));
end $$;
grant execute on function public.customer_resolve_service_qr(text) to anon, authenticated;
