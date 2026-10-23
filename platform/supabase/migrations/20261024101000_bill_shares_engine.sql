-- G3 / P3 — motor da divisão de conta: 4 modos, commit único, pagamento da parcela,
-- fechamento só em saldo zero, abandono, walk-out e reabertura.
--
-- Dinheiro: tudo em centavos (bigint). A taxa de serviço é calculada UMA vez sobre a base
-- da sessão e depois alocada entre as parcelas (maior resto); nunca arredondada por parcela,
-- então a soma das parcelas fecha exatamente com o total (invariante 4).

-- ---------------------------------------------------------------------------
-- 1. Helpers de array e de participante
-- ---------------------------------------------------------------------------
create or replace function private.array_sub(a bigint[], b bigint[])
returns bigint[] language sql immutable as $$
  select coalesce(array_agg(x - y order by i), '{}'::bigint[]) from unnest(a, b) with ordinality as t(x, y, i)
$$;

create or replace function private.array_add(a bigint[], b bigint[])
returns bigint[] language sql immutable as $$
  select coalesce(array_agg(x + y order by i), '{}'::bigint[]) from unnest(a, b) with ordinality as t(x, y, i)
$$;

create or replace function private.lines_json(p_ids uuid[], p_cents bigint[])
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('orderItemId', id, 'baseCents', c) order by i), '[]'::jsonb)
  from unnest(p_ids, p_cents) with ordinality as t(id, c, i) where c > 0
$$;

-- Quem responde pela parte de um participante: convidado sem conta e criança (ADR-006)
-- caem em quem os adicionou; sem isso, no anfitrião.
create or replace function private.responsible_participant(p_participant_id uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case when p.user_id is not null and not p.is_kid then p.id else coalesce(
    (select r.id from public.table_session_participants r
      where r.table_session_id = p.table_session_id and r.user_id is not null and not r.is_kid
        and r.user_id = p.added_by limit 1),
    (select r.id from public.table_session_participants r
      where r.table_session_id = p.table_session_id and r.user_id is not null and r.is_host limit 1)) end
  from public.table_session_participants p where p.id = p_participant_id
$$;

-- Pagantes elegíveis na ordem determinística (joined_at, id) do ADR-001.
create or replace function private.eligible_payers(p_session uuid, p_only_unpaid boolean)
returns uuid[] language sql stable security definer set search_path = public, pg_temp as $$
  select array_agg(x.id order by x.joined_at, x.id) from (
    select distinct r.id, r.joined_at
    from public.table_session_participants p
    join public.table_session_participants r on r.id = private.responsible_participant(p.id)
    where p.table_session_id = p_session and r.walkout_at is null
      and not exists (select 1 from public.bill_shares s where s.participant_id = r.id and s.status = 'pending_payment')
      and (not p_only_unpaid or not exists (
        select 1 from public.bill_shares s where s.participant_id = r.id and s.status = 'paid'))
  ) x
$$;

-- ---------------------------------------------------------------------------
-- 2. Linhas, saldos e totais da sessão
-- ---------------------------------------------------------------------------
create or replace function private.session_fee_bps(p_session uuid)
returns integer language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v integer;
begin
  select coalesce(
    (select p.service_fee_bps from public.restaurant_model_policies p
      where p.restaurant_id = s.restaurant_id and p.service_model = s.service_model),
    (select c.service_fee_bps from public.restaurant_model_configs c where c.restaurant_id = s.restaurant_id))
  into v from public.table_sessions s where s.id = p_session;
  if v is null then raise exception 'Taxa de serviço não configurada' using errcode = 'P0002'; end if;
  return v;
end $$;

-- Valor líquido de cada item da conta: desconto do pedido alocado entre os itens e o que o
-- checkout legado (table_payment_allocations) já cobriu. Mesmo recorte de pedidos do legado.
create or replace function private.session_lines(p_session uuid)
returns table(order_item_id uuid, owner_participant uuid, open_cents bigint)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  o record; v_ids uuid[]; v_gross bigint[]; v_diner uuid[]; v_disc bigint[]; v_legacy bigint; i integer;
begin
  for o in
    select ord.id, ord.customer_id, coalesce(ord.discount_cents, 0) as disc
    from public.orders ord
    where ord.table_session_id = p_session and ord.status::text not in ('cancelled', 'completed')
      and not exists (
        select 1 from public.gateway_transactions gt
        where gt.status = 'completed' and gt.provider <> 'simulated'
          and (gt.order_id = ord.id or gt.metadata->'order_ids' @> to_jsonb(array[ord.id])))
    order by ord.created_at, ord.id
  loop
    select array_agg(oi.id order by oi.created_at, oi.id),
           array_agg(coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint) order by oi.created_at, oi.id),
           array_agg(oi.diner_id order by oi.created_at, oi.id)
      into v_ids, v_gross, v_diner
    from public.order_items oi where oi.order_id = o.id and oi.status::text <> 'cancelled';
    continue when v_ids is null;
    v_disc := private.allocate_proportional(least(o.disc, (select sum(x)::bigint from unnest(v_gross) x)), v_gross);
    for i in 1 .. array_length(v_ids, 1) loop
      select coalesce(sum(a.amount_cents), 0) into v_legacy
        from public.table_payment_allocations a
        join public.gateway_transactions gt on gt.id = a.gateway_transaction_id
        where a.order_item_id = v_ids[i] and gt.status = 'completed';
      order_item_id := v_ids[i];
      -- Dono é só o diner_id: item sem dono é rateado entre todos (spec §3.4).
      owner_participant := v_diner[i];
      open_cents := greatest(0, v_gross[i] - v_disc[i] - v_legacy);
      return next;
    end loop;
  end loop;
end $$;

create or replace function private.session_balances(
  p_session uuid, p_exclude uuid[] default '{}',
  p_count public.noowe_bill_share_status[] default array['open', 'pending_payment', 'paid']::public.noowe_bill_share_status[]
) returns table(order_item_id uuid, owner_participant uuid, open_cents bigint, remaining_cents bigint)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select l.order_item_id, l.owner_participant, l.open_cents,
    greatest(0, l.open_cents - coalesce((
      select sum(bl.base_cents) from public.bill_share_lines bl
      join public.bill_shares s on s.id = bl.bill_share_id
      where bl.order_item_id = l.order_item_id and s.status = any(p_count) and not (s.id = any(p_exclude))), 0))
  from private.session_lines(p_session) l
$$;

create or replace function private.session_totals(
  p_session uuid, p_exclude uuid[] default '{}',
  p_count public.noowe_bill_share_status[] default array['open', 'pending_payment', 'paid']::public.noowe_bill_share_status[]
) returns table(base_all bigint, fee_all bigint, total_all bigint, paid_sum bigint,
                base_rem bigint, fee_rem bigint, total_rem bigint)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_bps integer := private.session_fee_bps(p_session); v_fee_live bigint;
begin
  select coalesce(sum(b.open_cents), 0), coalesce(sum(b.remaining_cents), 0)
    into base_all, base_rem from private.session_balances(p_session, p_exclude, p_count) b;
  fee_all := private.service_fee_cents(base_all, v_bps);
  total_all := base_all + fee_all;
  select coalesce(sum(s.amount_cents), 0) into paid_sum
    from public.bill_shares s where s.table_session_id = p_session and s.status = 'paid';
  select coalesce(sum(s.service_fee_cents), 0) into v_fee_live
    from public.bill_shares s
    where s.table_session_id = p_session and s.status = any(p_count) and not (s.id = any(p_exclude));
  fee_rem := greatest(0, fee_all - v_fee_live);
  total_rem := base_rem + fee_rem;
  return next;
end $$;

-- Muda sempre que algo relevante muda: protege o commit contra tela desatualizada.
create or replace function private.split_version(p_session uuid)
returns text language sql stable security definer set search_path = public, private, pg_temp as $$
  select md5(
    coalesce((select string_agg(b.order_item_id::text || ':' || b.remaining_cents, ',' order by b.order_item_id)
      from private.session_balances(p_session) b), '') || '|' ||
    coalesce((select string_agg(s.id::text || ':' || s.status::text || ':' || s.amount_cents, ',' order by s.id)
      from public.bill_shares s where s.table_session_id = p_session
        and s.status in ('open', 'pending_payment', 'paid')), '') || '|' ||
    coalesce((select string_agg(p.id::text, ',' order by p.id) from public.table_session_participants p
      where p.table_session_id = p_session and p.walkout_at is not null), ''))
$$;

-- ---------------------------------------------------------------------------
-- 3. Cálculo dos 4 modos (sem gravar)
-- ---------------------------------------------------------------------------
create or replace function private.compute_split(
  p_session uuid, p_mode public.noowe_split_mode, p_params jsonb, p_actor uuid
) returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  v_params jsonb := coalesce(p_params, '{}'::jsonb);
  v_restaurant uuid; v_exclude uuid[] := '{}';
  v_assign jsonb; v_involved uuid[];
  t record;
  v_ids uuid[]; v_rem bigint[]; v_owner uuid[]; v_resp uuid[];
  v_payers uuid[]; v_amounts bigint[];
  v_pids uuid[] := '{}'; v_bases bigint[] := '{}'; v_fees bigint[] := '{}';
  v_modes text[] := '{}'; v_lines jsonb[] := '{}';
  v_cov bigint[]; v_cov2 bigint[]; v_rem_u bigint[]; v_owned bigint[]; v_u bigint[];
  v_rows jsonb := '[]'::jsonb; v_amount bigint; v_split bigint[]; v_policy text;
  v_fee_part bigint; v_others uuid[]; v_payer uuid; v_b bigint; v_f bigint;
  v_shares jsonb := '[]'::jsonb; i integer; k integer;
begin
  select restaurant_id into v_restaurant from public.table_sessions where id = p_session;

  -- Quais parcelas abertas serão substituídas por este cálculo.
  if p_mode = 'by_item' then
    v_assign := v_params->'assignments';
    if v_assign is null then
      select coalesce(jsonb_agg(jsonb_build_object('orderItemId', c.order_item_id, 'participantIds', c.pids)), '[]'::jsonb)
        into v_assign from (
          select order_item_id, jsonb_agg(participant_id order by created_at) pids
          from public.bill_item_claims where table_session_id = p_session group by order_item_id) c;
    end if;
    if jsonb_typeof(v_assign) <> 'array' or jsonb_array_length(v_assign) = 0 then
      raise exception 'Selecione itens para dividir' using errcode = '22023'; end if;
    select array_agg(distinct private.responsible_participant(x::uuid)) into v_involved
      from jsonb_array_elements(v_assign) e, jsonb_array_elements_text(e->'participantIds') x;
    select coalesce(array_agg(s.id), '{}') into v_exclude from public.bill_shares s
      where s.table_session_id = p_session and s.status = 'open' and s.participant_id = any(v_involved);
  else
    select coalesce(array_agg(s.id), '{}') into v_exclude from public.bill_shares s
      where s.table_session_id = p_session and s.status = 'open';
  end if;

  select * into t from private.session_totals(p_session, v_exclude);
  if t.base_rem <= 0 then raise exception 'Conta já quitada' using errcode = 'P0011'; end if;

  select array_agg(b.order_item_id order by b.order_item_id), array_agg(b.remaining_cents order by b.order_item_id),
         array_agg(b.owner_participant order by b.order_item_id)
    into v_ids, v_rem, v_owner
  from private.session_balances(p_session, v_exclude) b where b.remaining_cents > 0;

  -- ------------------------------------------------------------------ by_owner
  if p_mode = 'by_owner' then
    v_payers := private.eligible_payers(p_session, false);
    if v_payers is null then raise exception 'Sem pagantes disponíveis' using errcode = 'P0011'; end if;
    select array_agg(case when r.rp = any(v_payers) then r.rp end order by o.ix) into v_resp
      from unnest(v_owner) with ordinality as o(own, ix),
           lateral (select private.responsible_participant(o.own) as rp) r;
    v_rem_u := (select array_agg(case when v_resp[ix] is null then v_rem[ix] else 0 end order by ix)
                from generate_subscripts(v_rem, 1) ix);
    select array_agg(s.cents order by p.ord) into v_u
      from unnest(v_payers) with ordinality p(pid, ord)
      join private.split_equal((select coalesce(sum(x), 0)::bigint from unnest(v_rem_u) x), v_payers) s on s.participant_id = p.pid;
    for i in 1 .. array_length(v_payers, 1) loop
      v_owned := (select array_agg(case when v_resp[kx] = v_payers[i] then v_rem[kx] else 0 end order by kx)
                  from generate_subscripts(v_rem, 1) kx);
      v_cov := private.allocate_proportional(v_u[i], v_rem_u);
      v_rem_u := private.array_sub(v_rem_u, v_cov);
      v_cov2 := private.array_add(v_owned, v_cov);
      v_pids := v_pids || v_payers[i];
      v_bases := v_bases || (select coalesce(sum(x), 0)::bigint from unnest(v_cov2) x);
      v_modes := v_modes || 'by_owner'::text;
      v_lines := v_lines || private.lines_json(v_ids, v_cov2);
    end loop;
    v_fees := private.allocate_proportional(t.fee_rem, v_bases);

  -- --------------------------------------------------------------------- equal
  elsif p_mode = 'equal' then
    v_payers := coalesce(private.eligible_payers(p_session, true), private.eligible_payers(p_session, false));
    if v_payers is null then raise exception 'Sem pagantes disponíveis' using errcode = 'P0011'; end if;
    select array_agg(s.cents order by p.ord) into v_amounts
      from unnest(v_payers) with ordinality p(pid, ord)
      join private.split_equal(t.total_rem, v_payers) s on s.participant_id = p.pid;
    select array_agg(d.b order by d.n), array_agg(d.f order by d.n) into v_bases, v_fees
      from private.decompose_amounts(v_amounts, t.base_rem) with ordinality as d(b, f, n);
    v_pids := v_payers;
    for i in 1 .. array_length(v_payers, 1) loop
      v_cov := private.allocate_proportional(v_bases[i], v_rem);
      v_rem := private.array_sub(v_rem, v_cov);
      v_modes := v_modes || 'equal'::text;
      v_lines := v_lines || private.lines_json(v_ids, v_cov);
    end loop;

  -- ------------------------------------------------------------------- by_item
  elsif p_mode = 'by_item' then
    -- Item compartilhado: o saldo do item é dividido pela mesma regra do ADR-001.
    for k in 1 .. array_length(v_ids, 1) loop
      select array_agg(x.rid order by x.joined_at, x.rid) into v_payers from (
        select distinct private.responsible_participant(pp::uuid) as rid, r.joined_at
        from jsonb_array_elements(v_assign) e, jsonb_array_elements_text(e->'participantIds') pp
        join public.table_session_participants r on r.id = private.responsible_participant(pp::uuid)
        where (e->>'orderItemId')::uuid = v_ids[k] and r.table_session_id = p_session and r.walkout_at is null) x;
      continue when v_payers is null;
      v_rows := v_rows || coalesce((select jsonb_agg(jsonb_build_object('pid', s.participant_id, 'item', v_ids[k], 'cents', s.cents))
        from private.split_equal(v_rem[k], v_payers) s), '[]'::jsonb);
    end loop;
    if jsonb_array_length(v_rows) = 0 then
      raise exception 'Selecione itens ainda não pagos' using errcode = '22023'; end if;
    select array_agg(g.pid order by pr.joined_at, pr.id), array_agg(g.total order by pr.joined_at, pr.id),
           array_agg(g.lines order by pr.joined_at, pr.id)
      into v_pids, v_bases, v_lines
    from (select (r->>'pid')::uuid pid, sum((r->>'cents')::bigint)::bigint total,
                 jsonb_agg(jsonb_build_object('orderItemId', r->>'item', 'baseCents', (r->>'cents')::bigint)) lines
          from jsonb_array_elements(v_rows) r where (r->>'cents')::bigint > 0 group by 1) g
    join public.table_session_participants pr on pr.id = g.pid;
    select coalesce(sum(x), 0) into v_b from unnest(v_bases) x;
    v_fee_part := case when v_b = t.base_rem then t.fee_rem
      else (private.allocate_proportional(t.fee_rem, array[v_b, t.base_rem - v_b]))[1] end;
    v_fees := private.allocate_proportional(v_fee_part, v_bases);
    v_modes := array_fill('by_item'::text, array[array_length(v_pids, 1)]);

  -- --------------------------------------------------------------- fixed_amount
  else
    select private.responsible_participant(p.id) into v_payer from public.table_session_participants p
      where p.table_session_id = p_session and p.user_id = p_actor limit 1;
    if v_payer is null then raise exception 'Participante não encontrado' using errcode = 'P0001'; end if;
    if exists (select 1 from public.bill_shares b where b.participant_id = v_payer and b.status = 'pending_payment') then
      raise exception 'Pagamento em andamento para este participante' using errcode = 'P0001'; end if;
    v_amount := (v_params->>'amountCents')::bigint;
    if v_amount is null or v_amount <= 0 or v_amount > t.total_rem then
      raise exception 'Valor inválido ou conta já quitada' using errcode = '22023'; end if;
    v_split := private.allocate_proportional(v_amount, array[t.base_rem, t.fee_rem]);
    v_cov := private.allocate_proportional(v_split[1], v_rem);
    v_rem := private.array_sub(v_rem, v_cov);
    v_pids := array[v_payer]; v_bases := array[v_split[1]]; v_fees := array[v_split[2]];
    v_modes := array['fixed_amount']; v_lines := array[private.lines_json(v_ids, v_cov)];
    -- Destino do restante: política da unidade (ADR-010), nunca o nome do modelo.
    select c.split_fixed_remainder::text into v_policy from public.restaurant_model_configs c
      where c.restaurant_id = v_restaurant;
    if v_policy = 'redistribute_unpaid' and t.total_rem - v_amount > 0 then
      v_others := array(select x from unnest(coalesce(private.eligible_payers(p_session, true), '{}'::uuid[])) x where x <> v_payer);
      if cardinality(v_others) > 0 then
        select array_agg(s.cents order by p.ord) into v_amounts
          from unnest(v_others) with ordinality p(pid, ord)
          join private.split_equal(t.total_rem - v_amount, v_others) s on s.participant_id = p.pid;
        for i in 1 .. array_length(v_others, 1) loop
          select d.b, d.f into v_b, v_f
            from private.decompose_amounts(v_amounts, t.base_rem - v_split[1]) with ordinality as d(b, f, n)
            where d.n = i;
          v_cov := private.allocate_proportional(v_b, v_rem);
          v_rem := private.array_sub(v_rem, v_cov);
          v_pids := v_pids || v_others[i]; v_bases := v_bases || v_b; v_fees := v_fees || v_f;
          v_modes := v_modes || 'equal'::text; v_lines := v_lines || private.lines_json(v_ids, v_cov);
        end loop;
      end if;
    end if;
  end if;

  for i in 1 .. coalesce(array_length(v_pids, 1), 0) loop
    continue when v_bases[i] + v_fees[i] <= 0;
    v_shares := v_shares || jsonb_build_object('participantId', v_pids[i], 'mode', v_modes[i],
      'baseCents', v_bases[i], 'feeCents', v_fees[i], 'amountCents', v_bases[i] + v_fees[i], 'lines', v_lines[i]);
  end loop;
  if jsonb_array_length(v_shares) = 0 then
    raise exception 'Nada a dividir com os pagantes disponíveis' using errcode = 'P0011'; end if;

  return jsonb_build_object('mode', p_mode, 'baseRemCents', t.base_rem, 'feeRemCents', t.fee_rem,
    'totalRemCents', t.total_rem, 'shares', v_shares,
    'unassignedCents', t.total_rem - (select coalesce(sum((s->>'amountCents')::bigint), 0)::bigint from jsonb_array_elements(v_shares) s),
    'excludeShareIds', to_jsonb(v_exclude), 'version', private.split_version(p_session));
end $$;
revoke all on function private.compute_split(uuid, public.noowe_split_mode, jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Commit (única porta de gravação de parcela), preview, gorjeta e itens
-- ---------------------------------------------------------------------------
create or replace function private.commit_split(
  p_session uuid, p_actor uuid, p_mode public.noowe_split_mode, p_params jsonb,
  p_expected_version text, p_key uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions; v_plan jsonb; v_share jsonb; v_id uuid; v_round integer; v_ids uuid[] := '{}';
  v_live bigint; v_total bigint; v_line jsonb;
begin
  select * into v_session from public.table_sessions where id = p_session for update;
  if v_session.id is null or v_session.status <> 'active' then
    raise exception 'Sessão da mesa indisponível' using errcode = 'P0001'; end if;
  if p_actor is not null and not exists (
    select 1 from public.table_session_participants where table_session_id = p_session and user_id = p_actor) then
    raise exception 'Participante não encontrado' using errcode = 'P0001'; end if;

  if p_key is not null and p_actor is not null then
    select coalesce(array_agg(id), '{}') into v_ids from public.bill_shares
      where committed_by = p_actor and idempotency_key = p_key and table_session_id = p_session;
    if cardinality(v_ids) > 0 then
      return jsonb_build_object('shareIds', to_jsonb(v_ids), 'idempotentReplay', true);
    end if;
  end if;
  if p_expected_version is not null and p_expected_version <> private.split_version(p_session) then
    raise exception 'A conta mudou. Confira os valores atualizados.' using errcode = 'P0012'; end if;

  v_plan := private.compute_split(p_session, p_mode, p_params, p_actor);
  update public.bill_shares set status = 'superseded', updated_at = now()
    where id in (select (x)::uuid from jsonb_array_elements_text(v_plan->'excludeShareIds') x);
  select coalesce(max(round_no), 0) + 1 into v_round from public.bill_shares where table_session_id = p_session;
  v_ids := '{}';
  for v_share in select * from jsonb_array_elements(v_plan->'shares') loop
    insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode,
        base_cents, service_fee_cents, amount_cents, committed_by, idempotency_key)
      values (v_session.restaurant_id, p_session, (v_share->>'participantId')::uuid, v_round,
        (v_share->>'mode')::public.noowe_split_mode, (v_share->>'baseCents')::bigint,
        (v_share->>'feeCents')::bigint, (v_share->>'amountCents')::bigint, p_actor, p_key)
      returning id into v_id;
    v_ids := v_ids || v_id;
    for v_line in select * from jsonb_array_elements(v_share->'lines') loop
      insert into public.bill_share_lines(bill_share_id, order_item_id, base_cents)
        values (v_id, (v_line->>'orderItemId')::uuid, (v_line->>'baseCents')::bigint);
    end loop;
  end loop;
  update public.table_sessions set billing_status = 'billing',
      billing_started_at = coalesce(billing_started_at, now()), updated_at = now() where id = p_session;

  -- Invariante: nunca se cobra mais que o total da conta.
  select coalesce(sum(amount_cents), 0) into v_live from public.bill_shares
    where table_session_id = p_session and status in ('open', 'pending_payment', 'paid');
  select total_all into v_total from private.session_totals(p_session);
  if v_live > v_total then
    raise exception 'Soma das parcelas (%) excede o total (%)', v_live, v_total using errcode = 'P0009'; end if;
  return v_plan - 'shares' || jsonb_build_object('shareIds', to_jsonb(v_ids), 'round', v_round,
    'sharesCount', cardinality(v_ids), 'idempotentReplay', false);
end $$;
revoke all on function private.commit_split(uuid, uuid, public.noowe_split_mode, jsonb, text, uuid) from public, anon, authenticated;

create or replace function public.customer_bill_split_preview(
  p_table_session_id uuid, p_mode public.noowe_split_mode, p_params jsonb default '{}'::jsonb
) returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001'; end if;
  return private.compute_split(p_table_session_id, p_mode, p_params, auth.uid());
end $$;
revoke all on function public.customer_bill_split_preview(uuid, public.noowe_split_mode, jsonb) from public, anon;
grant execute on function public.customer_bill_split_preview(uuid, public.noowe_split_mode, jsonb) to authenticated;

create or replace function public.customer_bill_split_commit(
  p_table_session_id uuid, p_mode public.noowe_split_mode, p_params jsonb,
  p_expected_version text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  return private.commit_split(p_table_session_id, auth.uid(), p_mode, p_params, p_expected_version, p_idempotency_key);
end $$;
revoke all on function public.customer_bill_split_commit(uuid, public.noowe_split_mode, jsonb, text, uuid) from public, anon;
grant execute on function public.customer_bill_split_commit(uuid, public.noowe_split_mode, jsonb, text, uuid) to authenticated;

-- Quem pode agir sobre uma parcela: o pagante responsável por ela.
create or replace function private.share_payer_allowed(p_share public.bill_shares, p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.table_session_participants r
    where r.id = private.responsible_participant(p_share.participant_id) and r.user_id = p_user)
$$;

-- Gorjeta sempre editável (spec §4.4); fica fora do total da conta.
create or replace function public.customer_set_share_tip(p_share_id uuid, p_tip_cents bigint)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;
  if p_tip_cents is null or p_tip_cents < 0 or p_tip_cents > s.amount_cents then
    raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  update public.bill_shares set tip_cents = p_tip_cents, updated_at = now() where id = s.id;
  return jsonb_build_object('shareId', s.id, 'tipCents', p_tip_cents);
end $$;
revoke all on function public.customer_set_share_tip(uuid, bigint) from public, anon;
grant execute on function public.customer_set_share_tip(uuid, bigint) to authenticated;

create or replace function public.customer_claim_item(p_order_item_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_session uuid; v_part uuid;
begin
  select o.table_session_id into v_session from public.order_items oi
    join public.orders o on o.id = oi.order_id where oi.id = p_order_item_id;
  if v_session is null or not private.is_table_session_participant(v_session) then
    raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  select id into v_part from public.table_session_participants where table_session_id = v_session and user_id = auth.uid();
  insert into public.bill_item_claims(table_session_id, order_item_id, participant_id)
    values (v_session, p_order_item_id, v_part) on conflict do nothing;
end $$;
revoke all on function public.customer_claim_item(uuid) from public, anon;
grant execute on function public.customer_claim_item(uuid) to authenticated;

create or replace function public.customer_unclaim_item(p_order_item_id uuid)
returns void language sql security definer set search_path = public, private, pg_temp as $$
  delete from public.bill_item_claims c
  where c.order_item_id = p_order_item_id
    and c.participant_id in (select id from public.table_session_participants where user_id = auth.uid())
$$;
revoke all on function public.customer_unclaim_item(uuid) from public, anon;
grant execute on function public.customer_unclaim_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Pagamento da parcela
-- ---------------------------------------------------------------------------
insert into private.dev_flags(key, enabled) values ('simulate_share_payment', false) on conflict (key) do nothing;

create or replace function private.payment_json(p_tx public.gateway_transactions)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'paymentId', p_tx.id, 'orderId', p_tx.order_id, 'billShareId', p_tx.bill_share_id,
    'restaurantId', p_tx.restaurant_id, 'provider', p_tx.provider, 'method', p_tx.payment_method,
    'status', p_tx.status, 'amountCents', p_tx.amount_cents, 'tipCents', p_tx.tip_cents,
    'platformFeeCents', p_tx.platform_fee_cents, 'providerRef', p_tx.provider_ref,
    'checkoutUrl', p_tx.checkout_url, 'pixPayload', p_tx.pix_payload, 'expiresAt', p_tx.expires_at,
    'paymentAccountId', p_tx.payment_account_id, 'alreadyPaid', false,
    'idempotentReplay', p_tx.provider_ref is not null)
$$;

create or replace function private.reserve_share_payment(
  p_user uuid, p_share_id uuid, p_method text, p_tip_cents bigint, p_key uuid, p_provider text
) returns public.gateway_transactions language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  s public.bill_shares; v_tx public.gateway_transactions; v_acct public.restaurant_payment_accounts;
  v_key text; v_tip bigint; v_expires timestamptz; v_pix_min integer; v_session_model public.noowe_service_model;
begin
  if p_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_method not in ('pix', 'credit_card') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023'; end if;
  v_key := 'share-payment:' || p_user || ':' || p_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key and customer_id = p_user;
  if v_tx.id is not null then return v_tx; end if;

  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, p_user) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.table_sessions where id = s.table_session_id and status = 'active') then
    raise exception 'Sessão da mesa indisponível' using errcode = 'P0001'; end if;
  if s.status = 'pending_payment' then
    -- Cobrança em andamento: reaproveita em vez de gerar outra (sem cobrança duplicada).
    select * into v_tx from public.gateway_transactions
      where id = s.payment_id and status in ('creating', 'pending') and (expires_at is null or expires_at > now());
    if v_tx.id is not null then return v_tx; end if;
    perform private.release_bill_share_row(s.id);
    select * into s from public.bill_shares where id = p_share_id;
  end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;

  v_tip := coalesce(p_tip_cents, s.tip_cents);
  if v_tip < 0 or v_tip > s.amount_cents then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;

  if p_provider = 'asaas' then
    select * into v_acct from public.restaurant_payment_accounts
      where restaurant_id = s.restaurant_id and status = 'active';
    if v_acct.id is null then
      raise exception 'Pagamento online indisponível neste restaurante' using errcode = 'P0007'; end if;
  end if;
  select service_model into v_session_model from public.table_sessions where id = s.table_session_id;
  select pix_expiry_min into v_pix_min from public.restaurant_model_policies
    where restaurant_id = s.restaurant_id and service_model = v_session_model;
  if p_method = 'pix' and v_pix_min is not null then v_expires := now() + make_interval(mins => v_pix_min); end if;

  insert into public.gateway_transactions(
    restaurant_id, customer_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents,
    status, idempotency_key, purpose, table_session_id, bill_share_id, payment_account_id,
    platform_fee_cents, expires_at, metadata, created_at, updated_at)
  values (
    s.restaurant_id, p_user, p_provider, p_method, s.amount_cents + v_tip, v_tip, 0,
    case when p_provider = 'asaas' then 'creating' else 'pending' end, v_key, 'bill_share',
    s.table_session_id, s.id, v_acct.id,
    case when v_acct.id is not null then div(((s.amount_cents + v_tip)::numeric * v_acct.platform_fee_bps) + 5000, 10000)::bigint end,
    v_expires, jsonb_build_object('split_mode', s.mode), now(), now())
  returning * into v_tx;
  update public.bill_shares set status = 'pending_payment', payment_id = v_tx.id, tip_cents = v_tip,
      payer_user_id = p_user, updated_at = now() where id = s.id;
  return v_tx;
end $$;
revoke all on function private.reserve_share_payment(uuid, uuid, text, bigint, uuid, text) from public, anon, authenticated;

-- Caminho do provedor real: chamado só pela Edge Function (service_role).
create or replace function public.service_pay_share(
  p_user_id uuid, p_share_id uuid, p_method text, p_tip_cents bigint, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_tx public.gateway_transactions;
begin
  v_tx := private.reserve_share_payment(p_user_id, p_share_id, p_method, p_tip_cents, p_idempotency_key, 'asaas');
  return private.payment_json(v_tx);
end $$;
revoke all on function public.service_pay_share(uuid, uuid, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.service_pay_share(uuid, uuid, text, bigint, uuid) to service_role;

-- Provedor simulado: só com a flag ligada, e passa pela mesma fronteira de confirmação.
create or replace function public.customer_pay_share(
  p_share_id uuid, p_method text, p_idempotency_key uuid, p_tip_cents bigint default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_tx public.gateway_transactions; v_result jsonb;
begin
  if not exists (select 1 from private.dev_flags where key = 'simulate_share_payment' and enabled) then
    raise exception 'Pagamento simulado desligado; use o pagamento online.' using errcode = '42501'; end if;
  v_tx := private.reserve_share_payment(auth.uid(), p_share_id, p_method, p_tip_cents, p_idempotency_key, 'simulated');
  if v_tx.provider <> 'simulated' then return private.payment_json(v_tx); end if;
  v_result := private.apply_payment_event(v_tx.id, 'simulated', 'simulated:' || v_tx.id, 'simulated', 'confirmed');
  select * into v_tx from public.gateway_transactions where id = v_tx.id;
  return private.payment_json(v_tx) || jsonb_build_object('simulated', true,
    'ignored', v_result->'ignored', 'latePayment', v_result->'latePayment');
end $$;
revoke all on function public.customer_pay_share(uuid, text, uuid, bigint) from public, anon;
grant execute on function public.customer_pay_share(uuid, text, uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Liquidação, fechamento em saldo zero e trava no banco
-- ---------------------------------------------------------------------------
create or replace function private.release_bill_share_row(p_share_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.bill_shares set status = 'open', payment_id = null, updated_at = now()
  where id = p_share_id and status = 'pending_payment'
$$;
revoke all on function private.release_bill_share_row(uuid) from public, anon, authenticated;

create or replace function private.release_bill_share(p_tx_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.bill_shares set status = 'open', payment_id = null, updated_at = now()
  where payment_id = p_tx_id and status = 'pending_payment'
$$;
revoke all on function private.release_bill_share(uuid) from public, anon, authenticated;

create or replace function private.close_session_if_settled(p_session uuid)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record;
begin
  select * into s from public.table_sessions where id = p_session for update;
  if s.id is null or s.status <> 'active' then return false; end if;
  select * into t from private.session_totals(p_session);
  if t.total_all = 0 and t.paid_sum = 0 then return false; end if;
  if t.paid_sum > t.total_all then
    raise exception 'Soma paga (%) excede o total (%)', t.paid_sum, t.total_all using errcode = 'P0009'; end if;
  if t.paid_sum < t.total_all then return false; end if;
  -- A sessão fecha primeiro: a trava confere o total enquanto os pedidos ainda contam.
  update public.table_sessions set status = 'ended', ended_at = now(), updated_at = now() where id = p_session;
  update public.tables set status = 'available', occupied_since = null, updated_at = now() where id = s.table_id;
  update public.reservations set status = 'completed', updated_at = now()
    where table_id = s.table_id and status::text = 'seated';
  -- Pago é payment_status; orders.status continua derivado dos itens (invariante 5).
  update public.orders set payment_status = 'confirmed', updated_at = now()
    where table_session_id = p_session and status::text <> 'cancelled' and payment_status <> 'confirmed';
  return true;
end $$;
revoke all on function private.close_session_if_settled(uuid) from public, anon, authenticated;

create or replace function private.settle_bill_share(p_tx_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare tx public.gateway_transactions; s public.bill_shares; v_kind public.noowe_tip_allocation; v_waiter uuid;
begin
  select * into tx from public.gateway_transactions where id = p_tx_id;
  select * into s from public.bill_shares where id = tx.bill_share_id for update;
  if s.id is null or s.status = 'paid' then return; end if;
  select c.tip_allocation into v_kind from public.restaurant_model_configs c where c.restaurant_id = s.restaurant_id;
  if v_kind = 'table_waiter' then
    select t.assigned_waiter_id into v_waiter from public.tables t
      join public.table_sessions ts on ts.table_id = t.id where ts.id = s.table_session_id;
  end if;
  update public.bill_shares set status = 'paid', paid_at = now(), payment_id = tx.id,
      tip_cents = tx.tip_cents, tip_recipient_kind = v_kind, tip_recipient_user_id = v_waiter,
      payer_user_id = coalesce(payer_user_id, tx.customer_id), updated_at = now()
    where id = s.id;
  begin
    perform private.close_session_if_settled(s.table_session_id);
  exception when others then
    -- O dinheiro já entrou: o webhook não pode falhar. Fica registrado para o gerente.
    perform private.log_system_audit(s.restaurant_id, 'bill.close_failed', 'table_session', s.table_session_id,
      sqlerrm, null, null);
  end;
end $$;
revoke all on function private.settle_bill_share(uuid) from public, anon, authenticated;

-- Nenhum caminho (RPC, tela do garçom, legado) encerra uma sessão dividida com saldo aberto.
create or replace function private.guard_session_close()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare t record;
begin
  if new.status in ('ended', 'closed') and old.status = 'active'
    and exists (select 1 from public.bill_shares b where b.table_session_id = new.id
      and b.status in ('open', 'pending_payment', 'paid')) then
    select * into t from private.session_totals(new.id);
    if t.paid_sum <> t.total_all then
      raise exception 'Conta com saldo em aberto (pago %, total %)', t.paid_sum, t.total_all using errcode = 'P0010';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_session_close on public.table_sessions;
create trigger trg_guard_session_close before update of status on public.table_sessions
  for each row execute function private.guard_session_close();

-- apply_payment_event passa a liquidar parcelas (purpose = 'bill_share').
create or replace function private.apply_payment_event(
  p_transaction_id uuid, p_provider text, p_provider_event_id text, p_event_type text,
  p_outcome public.noowe_payment_status, p_amount_cents bigint default null,
  p_payload jsonb default '{}'::jsonb, p_gateway_status text default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_tx public.gateway_transactions; v_order public.orders; v_mode text;
  v_status text; v_late boolean := false; v_ignored text;
begin
  select * into v_tx from public.gateway_transactions where id = p_transaction_id for update;
  if v_tx.id is null or v_tx.provider <> p_provider then
    raise exception 'Payment transaction not found' using errcode = 'P0002';
  end if;
  insert into public.payment_provider_events(provider, provider_event_id, gateway_transaction_id,
      restaurant_id, event_type, outcome, payload)
    values (p_provider, p_provider_event_id, v_tx.id, v_tx.restaurant_id, p_event_type, p_outcome,
      coalesce(p_payload, '{}'::jsonb))
    on conflict do nothing;
  if not found then
    return jsonb_build_object('transactionId', v_tx.id, 'orderId', v_tx.order_id,
      'paymentStatus', (select payment_status from public.orders where id = v_tx.order_id),
      'idempotentReplay', true);
  end if;

  v_status := coalesce(p_gateway_status, case p_outcome
    when 'confirmed' then 'completed' when 'failed' then 'failed'
    when 'refunded' then 'refunded' when 'refund_pending' then 'refund_pending' else 'pending' end);
  if v_status not in ('pending','completed','failed','expired','cancelled','refund_pending','refunded','partially_refunded') then
    raise exception 'Status de pagamento inválido: %', v_status using errcode = '22023';
  end if;

  if p_outcome = 'confirmed' and p_amount_cents is not null and p_amount_cents <> v_tx.amount_cents then
    v_ignored := 'amount_mismatch';
  elsif v_tx.status in ('refunded','partially_refunded') and v_status in ('pending','completed','failed','expired','cancelled') then
    v_ignored := 'terminal_state';
  elsif v_tx.status = 'completed' and v_status in ('pending','failed','expired','cancelled') then
    v_ignored := 'already_completed';
  elsif v_tx.status = v_status then
    v_ignored := 'no_change';
  end if;
  if v_ignored is not null then
    update public.payment_provider_events set error = v_ignored
      where provider = p_provider and provider_event_id = p_provider_event_id;
    if v_ignored = 'amount_mismatch' then
      perform private.log_system_audit(v_tx.restaurant_id, 'payment.amount_mismatch', 'payment', v_tx.id,
        'valor do evento diferente do cobrado',
        jsonb_build_object('amount_cents', v_tx.amount_cents), jsonb_build_object('event_amount_cents', p_amount_cents));
    end if;
    return jsonb_build_object('transactionId', v_tx.id, 'orderId', v_tx.order_id,
      'ignored', v_ignored, 'idempotentReplay', false);
  end if;

  if v_tx.order_id is not null then
    select * into v_order from public.orders where id = v_tx.order_id for update;
  end if;
  if p_outcome = 'confirmed' and v_order.id is not null and (
    v_order.fulfillment_status in ('cancelled', 'not_picked_up')
    or v_order.payment_status in ('failed', 'refunded')
    or (v_order.payment_expires_at is not null and v_order.payment_expires_at < now())
  ) then
    v_late := true;
  end if;

  perform set_config('noowe.status_actor', 'system', true);
  update public.gateway_transactions
    set status = case when v_late then 'completed' else v_status end,
        confirmed_at = case when p_outcome = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
        updated_at = now()
    where id = v_tx.id;
  if v_late then
    perform private.enqueue_refund(v_tx.id, 'pagamento tardio');
  elsif v_tx.purpose = 'bill_share' then
    if p_outcome = 'confirmed' then perform private.settle_bill_share(v_tx.id);
    elsif p_outcome = 'failed' then perform private.release_bill_share(v_tx.id);
    elsif p_outcome = 'refunded' then
      update public.bill_shares set status = 'refunded', updated_at = now() where payment_id = v_tx.id;
    end if;
  elsif v_order.id is not null and v_tx.purpose = 'order' then
    update public.orders set payment_status = p_outcome,
      status = case when p_outcome = 'confirmed' and service_model = 'quick_service'
        then 'confirmed'::public.orders_status_enum else status end,
      updated_at = now() where id = v_order.id returning * into v_order;
    if p_outcome = 'confirmed' and v_order.service_model = 'quick_service' then
      select accept_mode into v_mode from public.restaurant_model_policies
        where restaurant_id = v_order.restaurant_id and service_model = 'quick_service';
      if v_mode = 'auto' then
        update public.orders set fulfillment_status = 'accepted', updated_at = now()
          where id = v_order.id returning * into v_order;
      end if;
    end if;
    if p_outcome = 'failed' then
      update public.pickup_slot_reservations set status = 'released'
        where order_id = v_order.id and status = 'reserved';
    end if;
  end if;
  perform set_config('noowe.status_actor', '', true);

  return jsonb_build_object('transactionId', v_tx.id, 'orderId', v_order.id,
    'paymentStatus', v_order.payment_status, 'fulfillmentStatus', v_order.fulfillment_status,
    'latePayment', v_late, 'idempotentReplay', false);
end $$;
revoke all on function private.apply_payment_event(uuid, text, text, text, public.noowe_payment_status, bigint, jsonb, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Abandono, walk-out e reabertura
-- ---------------------------------------------------------------------------

-- Convidado desiste: o valor volta ao pool e é redistribuído entre quem ainda não pagou.
create or replace function public.customer_abandon_share(p_share_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_mode public.noowe_split_mode; v_result jsonb; v_part uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'open' then raise exception 'Só parcela aberta pode ser abandonada' using errcode = 'P0001'; end if;
  v_part := private.responsible_participant(s.participant_id);
  update public.bill_shares set status = 'abandoned', updated_at = now() where id = s.id;
  update public.table_session_participants set walkout_at = now() where id = v_part;
  perform private.log_audit(s.restaurant_id, 'bill.share_abandoned', 'bill_share', s.id,
    'participante abandonou o pagamento', jsonb_build_object('amount_cents', s.amount_cents), null, auth.uid());
  -- Redistribui só quando a rodada era de cobertura total; item e valor fixo seguem em aberto.
  select b.mode into v_mode from public.bill_shares b
    where b.table_session_id = s.table_session_id and b.status = 'open' and b.mode in ('equal', 'by_owner')
    order by (b.mode = 'equal') desc limit 1;
  if v_mode is not null then
    begin
      v_result := private.commit_split(s.table_session_id, null, v_mode, '{}'::jsonb, null, null);
    exception when sqlstate 'P0011' then
      v_result := null;  -- ninguém para receber: o saldo fica em aberto na mesa
    end;
  end if;
  return jsonb_build_object('shareId', s.id, 'redistributed', v_result is not null);
end $$;
revoke all on function public.customer_abandon_share(uuid) from public, anon;
grant execute on function public.customer_abandon_share(uuid) to authenticated;

-- Cliente saiu sem pagar: a mesa fica em billing e o gerente é alertado com o saldo em aberto.
create or replace function public.restaurant_mark_walkout(p_session_id uuid, p_participant_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_number text;
begin
  select * into s from public.table_sessions where id = p_session_id for update;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(s.restaurant_id,
    array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  update public.table_session_participants set walkout_at = now()
    where id = p_participant_id and table_session_id = p_session_id;
  if not found then raise exception 'Participante não encontrado' using errcode = 'P0002'; end if;
  update public.bill_shares set status = 'abandoned', updated_at = now()
    where table_session_id = p_session_id and participant_id = p_participant_id and status = 'open';
  update public.table_sessions set billing_status = 'billing',
      billing_started_at = coalesce(billing_started_at, now()), updated_at = now() where id = p_session_id;
  select * into t from private.session_totals(p_session_id);
  select table_number into v_number from public.tables where id = s.table_id;
  perform private.notify_restaurant_staff(s.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
    'Cliente saiu sem pagar — mesa ' || coalesce(v_number, ''),
    'Saldo em aberto: R$ ' || to_char((t.total_all - t.paid_sum)::numeric / 100, 'FM999G990D00'),
    'staff_bill_walkout', s.id, 'table',
    jsonb_build_object('kind', 'staff_bill_walkout', 'table_session_id', s.id,
      'open_cents', t.total_all - t.paid_sum));
  perform private.log_audit(s.restaurant_id, 'bill.walkout', 'table_session', s.id, p_reason,
    null, jsonb_build_object('participant_id', p_participant_id, 'open_cents', t.total_all - t.paid_sum));
  return jsonb_build_object('tableSessionId', s.id, 'openCents', t.total_all - t.paid_sum, 'status', 'billing');
end $$;
revoke all on function public.restaurant_mark_walkout(uuid, uuid, text) from public, anon;
grant execute on function public.restaurant_mark_walkout(uuid, uuid, text) to authenticated;

-- ADR-004 (PROVISÓRIO): reabrir não estorna sozinho. Regra isolada nesta função.
create or replace function private.reopen_bill_policy(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare t record;
begin
  update public.bill_shares set status = 'superseded', updated_at = now()
    where table_session_id = p_session and status = 'open';
  select * into t from private.session_totals(p_session);
  return jsonb_build_object('totalCents', t.total_all, 'paidCents', t.paid_sum,
    'refundReviewCents', greatest(0, t.paid_sum - t.total_all));
end $$;
revoke all on function private.reopen_bill_policy(uuid) from public, anon, authenticated;

create or replace function public.restaurant_reopen_bill(p_session_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; v_policy jsonb;
begin
  select * into s from public.table_sessions where id = p_session_id for update;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(s.restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  if s.status <> 'active' or s.billing_status <> 'billing' then
    raise exception 'A conta não está em fechamento' using errcode = 'P0001'; end if;
  update public.table_sessions set billing_status = 'open', reopened_count = reopened_count + 1,
      reopened_at = now(), updated_at = now() where id = p_session_id;
  v_policy := private.reopen_bill_policy(p_session_id);
  perform private.log_audit(s.restaurant_id, 'bill.reopened', 'table_session', s.id, p_reason,
    jsonb_build_object('billing_status', 'billing'), v_policy);
  if (v_policy->>'refundReviewCents')::bigint > 0 then
    perform private.notify_restaurant_staff(s.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
      'Revisar estorno após reabrir conta',
      'O total ficou abaixo do já pago. Decida o estorno manualmente.',
      'staff_bill_refund_review', s.id, 'table', jsonb_build_object('kind', 'staff_bill_refund_review', 'policy', v_policy));
  end if;
  return v_policy;
end $$;
revoke all on function public.restaurant_reopen_bill(uuid, text) from public, anon;
grant execute on function public.restaurant_reopen_bill(uuid, text) to authenticated;
