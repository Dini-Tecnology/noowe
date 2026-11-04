-- M4: os nomes das capacidades que o plano desliga, e a taxa de serviço só conta em modo taxa.
create or replace function private.apply_plan_to_capabilities(p_restaurant uuid, p_caps jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v jsonb := p_caps;
begin
  if not private.plan_allows(p_restaurant, 'reservations') then
    v := jsonb_set(jsonb_set(v, '{capabilities,reservations}', 'false'::jsonb, true), '{capabilities,reservationRequired}', 'false'::jsonb, true);
  end if;
  if not private.plan_allows(p_restaurant, 'waitlist') then
    v := jsonb_set(jsonb_set(v, '{capabilities,virtualQueue}', 'false'::jsonb, true), '{capabilities,queueIsPrimaryEntry}', 'false'::jsonb, true);
  end if;
  if not private.plan_allows(p_restaurant, 'bill_split') then
    v := jsonb_set(jsonb_set(v, '{capabilities,splitBill}', 'false'::jsonb, true), '{capabilities,splitModes}', '[]'::jsonb, true);
  end if;
  if v->'policies'->>'feeOrTipMode' = 'tip' then v := jsonb_set(v, '{capabilities,serviceFee}', 'false'::jsonb, true); end if;
  return v;
end $$;
