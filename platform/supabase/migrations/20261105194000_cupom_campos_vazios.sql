-- Achado no simulador: o cupom não salvava com serviço, escopo ou dias vazios, porque null em lista dava erro.
create or replace function public.restaurant_upsert_coupon(p_restaurant_id uuid, p_coupon jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid := nullif(p_coupon->>'id', '')::uuid; o public.promotions; p public.promotions; v_kind text := p_coupon->>'discountKind'; v_code text := upper(btrim(coalesce(p_coupon->>'code', '')));
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  -- A tela manda vazio como null: para as listas, é como não ter mandado.
  p_coupon := jsonb_strip_nulls(p_coupon);
  if v_id is not null then
    select * into o from public.promotions where id = v_id and restaurant_id = p_restaurant_id for update;
    if o.id is null then raise exception 'Cupom não encontrado' using errcode = 'P0002'; end if;
    -- Depois do primeiro uso, só validade e limite podem mudar: quem usou viu outra regra.
    if o.first_used_at is not null then
      update public.promotions set valid_until = coalesce((p_coupon->>'validUntil')::timestamptz, valid_until),
          max_uses = coalesce((p_coupon->>'maxUses')::numeric, max_uses), updated_at = now() where id = v_id returning * into p;
      perform private.log_audit(p_restaurant_id, 'coupon.changed', 'promotion', p.id, 'Validade ou limite alterados', jsonb_build_object('validUntil', o.valid_until, 'maxUses', o.max_uses), jsonb_build_object('validUntil', p.valid_until, 'maxUses', p.max_uses));
      return to_jsonb(p);
    end if;
  end if;
  if v_kind not in ('percent', 'fixed', 'free_item') then raise exception 'Diga o que o cliente ganha' using errcode = '22023'; end if;
  if v_kind = 'percent' and coalesce((p_coupon->>'discountBps')::integer, 0) not between 1 and 10000 then raise exception 'Percentual inválido' using errcode = '22023'; end if;
  if v_kind = 'fixed' and coalesce((p_coupon->>'discountCents')::bigint, 0) <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  if v_kind = 'free_item' and nullif(p_coupon->>'freeItemId', '') is null then raise exception 'Escolha o item grátis' using errcode = '22023'; end if;
  -- Editar sem informar o código mantém o que já foi divulgado.
  if v_code = '' then v_code := coalesce(o.code, upper(substr(md5(gen_random_uuid()::text), 1, 8))); end if;
  if nullif(btrim(coalesce(p_coupon->>'title', '')), '') is null then raise exception 'Dê um nome ao cupom' using errcode = '22023'; end if;
  if (p_coupon->>'validFrom') is null or (p_coupon->>'validUntil') is null or (p_coupon->>'validUntil')::timestamptz <= (p_coupon->>'validFrom')::timestamptz then raise exception 'Confira as datas' using errcode = '22023'; end if;
  perform private.coupon_assert_shape(p_restaurant_id, p_coupon);
  insert into public.promotions(id, restaurant_id, code, title, description, type, status, discount_kind, discount_bps, discount_cents, free_item_id, min_order_cents, services, scope, scope_ids,
      dow, hours_from, hours_until, audience, inactive_days, max_uses, max_uses_per_user, current_uses, valid_from, valid_until, is_auto, is_visible, stacks_with_promotions, created_by, created_at, updated_at)
    values (coalesce(v_id, gen_random_uuid()), p_restaurant_id, v_code, btrim(p_coupon->>'title'), p_coupon->>'description', v_kind, 'active', v_kind,
      (p_coupon->>'discountBps')::integer, (p_coupon->>'discountCents')::bigint, nullif(p_coupon->>'freeItemId', '')::uuid, (p_coupon->>'minOrderCents')::bigint,
      (select array_agg(x) from jsonb_array_elements_text(p_coupon->'services') x), coalesce(p_coupon->>'scope', 'bill'), (select array_agg(x::uuid) from jsonb_array_elements_text(p_coupon->'scopeIds') x),
      (select array_agg(x::integer) from jsonb_array_elements_text(p_coupon->'dow') x), p_coupon->>'hoursFrom', p_coupon->>'hoursUntil', coalesce(p_coupon->>'audience', 'all'), (p_coupon->>'inactiveDays')::integer,
      (p_coupon->>'maxUses')::numeric, coalesce((p_coupon->>'maxUsesPerUser')::numeric, 1), 0, (p_coupon->>'validFrom')::timestamptz, (p_coupon->>'validUntil')::timestamptz,
      coalesce((p_coupon->>'isAuto')::boolean, false), coalesce((p_coupon->>'isVisible')::boolean, false), coalesce((p_coupon->>'stacksWithPromotions')::boolean, false), auth.uid(), now(), now())
    on conflict (id) do update set code = excluded.code, title = excluded.title, description = excluded.description, type = excluded.type, discount_kind = excluded.discount_kind, discount_bps = excluded.discount_bps,
      discount_cents = excluded.discount_cents, free_item_id = excluded.free_item_id, min_order_cents = excluded.min_order_cents, services = excluded.services, scope = excluded.scope, scope_ids = excluded.scope_ids,
      dow = excluded.dow, hours_from = excluded.hours_from, hours_until = excluded.hours_until, audience = excluded.audience, inactive_days = excluded.inactive_days, max_uses = excluded.max_uses,
      max_uses_per_user = excluded.max_uses_per_user, valid_from = excluded.valid_from, valid_until = excluded.valid_until, is_auto = excluded.is_auto, is_visible = excluded.is_visible,
      stacks_with_promotions = excluded.stacks_with_promotions, updated_at = now()
    returning * into p;
  perform private.log_audit(p_restaurant_id, 'coupon.saved', 'promotion', p.id, 'Cupom salvo', null, jsonb_build_object('code', p.code));
  return to_jsonb(p);
end $$;
