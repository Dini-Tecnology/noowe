-- RLS + RPCs for public.table_qr_codes, powering QRGeneratorScreen / QRBatchScreen.
-- Visual PNG/PDF rendering still needs a QR-rendering library on the client (none is
-- installed today); these RPCs only manage the underlying qr_code_data/signature record
-- that such a renderer would consume.

alter table public.table_qr_codes enable row level security;

drop policy if exists "table_qr_codes_staff" on public.table_qr_codes;
create policy "table_qr_codes_staff" on public.table_qr_codes
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
  );

create or replace function public.restaurant_get_table_qr_codes(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'table_id', t.id,
      'table_number', t.table_number,
      'section', t.section,
      'qr_code_data', qc.qr_code_data,
      'is_active', qc.is_active
    ) order by t.section, t.table_number
  ), '[]'::jsonb)
  into result
  from public.tables t
  left join lateral (
    select *
    from public.table_qr_codes
    where table_id = t.id and is_active
    order by created_at desc
    limit 1
  ) qc on true
  where t.restaurant_id = p_restaurant_id;

  return result;
end;
$$;

create or replace function public.restaurant_generate_table_qr(
  p_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_table record;
  v_qr record;
  v_data text;
begin
  select * into v_table from public.tables where id = p_table_id;
  if v_table.id is null then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_table.restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  v_data := 'noowe://table/' || v_table.id::text;

  update public.table_qr_codes
  set is_active = false, updated_at = now()
  where table_id = p_table_id and is_active;

  insert into public.table_qr_codes (
    restaurant_id, table_id, qr_code_data, signature, style,
    color_primary, logo_included, version, is_active, generated_by,
    created_at, updated_at
  )
  values (
    v_table.restaurant_id, p_table_id, v_data,
    encode(sha256(v_data::bytea), 'hex'), 'default',
    '#000000', false, 1, true, auth.uid()::text,
    now(), now()
  )
  returning * into v_qr;

  update public.tables set qr_code = v_data, updated_at = now() where id = p_table_id;

  return jsonb_build_object(
    'table_id', p_table_id,
    'qr_code_data', v_qr.qr_code_data,
    'created_at', v_qr.created_at
  );
end;
$$;

revoke all on function public.restaurant_get_table_qr_codes(uuid) from public;
revoke all on function public.restaurant_generate_table_qr(uuid) from public;
grant execute on function public.restaurant_get_table_qr_codes(uuid) to authenticated, service_role;
grant execute on function public.restaurant_generate_table_qr(uuid) to authenticated, service_role;
