-- G5 (ADR-032): a comanda tem um saldo único de consumo, e as quatro formas só abatem dele. Taxa ou gorjeta é de cada pagamento,
-- por cima do consumo: o que precisa fechar exatamente é a soma do consumo pago, não mais um "total com taxa".
-- Parcela aberta é só uma intenção: quem reserva o valor é quem entra no pagamento (pending_payment).
-- Só "Meus itens" e "Por item" travam item; "Valor fixo" e "Partes iguais" abatem do saldo sem marcar item.

-- ---------------------------------------------------------------------------
-- 1. Parcela: retirada da taxa e pagamento presencial
-- ---------------------------------------------------------------------------
alter table public.bill_shares
  add column fee_waived_by uuid references public.profiles(id) on delete set null,
  add column fee_waived_at timestamptz,
  add column fee_waived_reason text,
  alter column participant_id drop not null,
  add constraint bill_shares_fee_or_tip check (service_fee_cents = 0 or tip_cents = 0),
  -- Sessão aberta pela equipe não tem participante: o pagamento presencial não precisa de um.
  add constraint bill_shares_participant_or_settled check (participant_id is not null or status in ('paid', 'refunded'));

-- ---------------------------------------------------------------------------
-- 2. Regras em função nomeada
-- ---------------------------------------------------------------------------
-- Quanto se paga pelo valor pedido: nunca acima do saldo.
create or replace function private.adjust_to_balance(p_requested bigint, p_balance bigint)
returns bigint language sql immutable as $$
  select least(p_requested, p_balance)
$$;
revoke all on function private.adjust_to_balance(bigint, bigint) from public, anon, authenticated;

-- Separa do total o consumo e o que vem por cima (taxa ou gorjeta em percentual): "R$ 50" a 10% dá 45,45 + 4,55.
-- O resto é total menos consumo, então a soma é sempre exata.
create or replace function private.split_out_of_total(p_total bigint, p_bps integer, out base_cents bigint, out rest_cents bigint)
language sql immutable as $$
  select b, p_total - b from (select div(p_total::numeric * 10000 + (10000 + p_bps) / 2, 10000 + p_bps)::bigint as b) x
$$;
revoke all on function private.split_out_of_total(bigint, integer) from public, anon, authenticated;

-- Quanto falta pagar de consumo. O que está em pagamento já saiu: volta se falhar ou expirar.
create or replace function private.session_consumption_balance(p_session uuid, p_exclude uuid[] default '{}')
returns bigint language sql stable security definer set search_path = public, private, pg_temp as $$
  select greatest(0,
    coalesce((select sum(l.open_cents) from private.session_lines(p_session) l), 0)
    - coalesce((select sum(s.base_cents) from public.bill_shares s
        where s.table_session_id = p_session and s.status in ('paid', 'pending_payment') and not (s.id = any(p_exclude))), 0))::bigint
$$;
revoke all on function private.session_consumption_balance(uuid, uuid[]) from public, anon, authenticated;

-- Só parcela paga ou em pagamento de "Meus itens" e "Por item" trava item. Parcela aberta de outra pessoa não trava ninguém.
create or replace function private.session_balances(
  p_session uuid, p_exclude uuid[] default '{}',
  p_count public.noowe_bill_share_status[] default array['pending_payment', 'paid']::public.noowe_bill_share_status[]
) returns table(order_item_id uuid, owner_participant uuid, open_cents bigint, remaining_cents bigint)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select l.order_item_id, l.owner_participant, l.open_cents,
    greatest(0, l.open_cents - coalesce((
      select sum(bl.base_cents) from public.bill_share_lines bl
      join public.bill_shares s on s.id = bl.bill_share_id
      where bl.order_item_id = l.order_item_id and s.status = any(p_count) and not (s.id = any(p_exclude))
        and s.mode in ('by_owner', 'by_item')), 0))
  from private.session_lines(p_session) l
$$;

-- O nome ficou do modelo anterior, e os chamadores seguem valendo: agora total_all é o consumo, paid_sum é o consumo pago e
-- fee_all é a taxa efetivamente paga. Fechar é paid_sum = total_all, sem contar taxa nem gorjeta.
create or replace function private.session_totals(
  p_session uuid, p_exclude uuid[] default '{}',
  p_count public.noowe_bill_share_status[] default array['pending_payment', 'paid']::public.noowe_bill_share_status[]
) returns table(base_all bigint, fee_all bigint, total_all bigint, paid_sum bigint,
                base_rem bigint, fee_rem bigint, total_rem bigint)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  select coalesce(sum(l.open_cents), 0) into base_all from private.session_lines(p_session) l;
  total_all := base_all;
  select coalesce(sum(s.base_cents), 0), coalesce(sum(s.service_fee_cents), 0) into paid_sum, fee_all
    from public.bill_shares s where s.table_session_id = p_session and s.status = 'paid';
  base_rem := private.session_consumption_balance(p_session, p_exclude);
  fee_rem := private.service_fee_cents(base_rem, private.session_fee_bps(p_session));
  total_rem := base_rem + fee_rem;
  return next;
end $$;

-- Quem saiu sem pagar deixa a parte para o titular. Convidado sem conta e criança seguem com quem os adicionou.
create or replace function private.responsible_participant(p_participant_id uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case when p.user_id is not null and not p.is_kid and p.walkout_at is null then p.id else coalesce(
    (select r.id from public.table_session_participants r
      where r.table_session_id = p.table_session_id and r.user_id is not null and not r.is_kid and r.walkout_at is null
        and r.user_id = p.added_by limit 1),
    (select r.id from public.table_session_participants r
      where r.table_session_id = p.table_session_id and r.user_id is not null and r.is_host limit 1)) end
  from public.table_session_participants p where p.id = p_participant_id
$$;

-- ---------------------------------------------------------------------------
-- 3. Cálculo das 4 formas (sem gravar)
-- ---------------------------------------------------------------------------
create or replace function private.compute_split(
  p_session uuid, p_mode public.noowe_split_mode, p_params jsonb, p_actor uuid
) returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  v_params jsonb := coalesce(p_params, '{}'::jsonb);
  v_policy public.restaurant_model_policies;
  v_exclude uuid[] := '{}'; v_balance bigint; v_bps integer; v_mode text; v_waived uuid[];
  v_assign jsonb; v_involved uuid[]; v_ids uuid[]; v_rem bigint[]; v_raw bigint[]; v_owner uuid[]; v_resp uuid[];
  v_payers uuid[]; v_pids uuid[] := '{}'; v_bases bigint[] := '{}'; v_tips bigint[] := '{}';
  v_modes text[] := '{}'; v_lines jsonb[] := '{}';
  v_cov bigint[]; v_cov2 bigint[]; v_rem_u bigint[]; v_owned bigint[]; v_u bigint[]; v_rows jsonb := '[]'::jsonb;
  v_requested bigint; v_adjusted boolean := false; v_payer uuid; v_people integer; v_b bigint; v_r bigint; v_rate integer;
  v_tip_bps integer; v_tip_free bigint; v_fee bigint; v_waive boolean := coalesce((v_params->>'waiveFee')::boolean, false);
  v_shares jsonb := '[]'::jsonb; i integer; k integer;
begin
  select pol.* into v_policy from public.table_sessions s
    join public.restaurant_model_policies pol on pol.restaurant_id = s.restaurant_id and pol.service_model = s.service_model
    where s.id = p_session;
  if v_policy.restaurant_id is not null and not p_mode = any(v_policy.split_modes) then
    raise exception 'Esta forma de divisão não está disponível neste restaurante' using errcode = '23514';
  end if;
  v_bps := private.session_fee_bps(p_session);
  v_mode := private.fee_or_tip_mode(p_session);

  -- Quem vai pagar neste cálculo (só a parcela da própria pessoa muda em valor fixo e em partes com número ajustado).
  if p_mode = 'fixed_amount' or (p_mode = 'equal' and v_params ? 'people') or v_waive then
    select private.responsible_participant(p.id) into v_payer from public.table_session_participants p
      where p.table_session_id = p_session and p.user_id = p_actor limit 1;
    if v_payer is null then raise exception 'Participante não encontrado' using errcode = 'P0001'; end if;
  end if;

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
  elsif p_mode = 'fixed_amount' or (p_mode = 'equal' and v_params ? 'people') then
    select coalesce(array_agg(s.id), '{}') into v_exclude from public.bill_shares s
      where s.table_session_id = p_session and s.status = 'open' and s.participant_id = v_payer;
  else
    select coalesce(array_agg(s.id), '{}') into v_exclude from public.bill_shares s
      where s.table_session_id = p_session and s.status = 'open';
  end if;

  v_balance := private.session_consumption_balance(p_session);
  if v_balance <= 0 then raise exception 'Esta conta já está quitada' using errcode = 'P0011'; end if;

  -- A retirada da taxa acompanha a pessoa até ela pagar, mesmo que outra pessoa refaça a divisão.
  select coalesce(array_agg(s.participant_id), '{}') into v_waived from public.bill_shares s
    where s.table_session_id = p_session and s.status = 'open' and s.fee_waived_at is not null;
  if v_waive then v_waived := v_waived || v_payer; end if;

  select array_agg(b.order_item_id order by b.order_item_id), array_agg(b.remaining_cents order by b.order_item_id),
         array_agg(b.owner_participant order by b.order_item_id)
    into v_ids, v_raw, v_owner
  from private.session_balances(p_session) b where b.remaining_cents > 0;
  -- Depois de valor fixo ou partes iguais sobra menos saldo do que itens livres: a seleção fica limitada ao saldo.
  v_rem := case when (select coalesce(sum(x), 0) from unnest(v_raw) x) > v_balance
    then private.allocate_proportional(v_balance, v_raw) else v_raw end;

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

  elsif p_mode = 'equal' and v_params ? 'people' then
    -- Número de pessoas ajustado: a pessoa paga a parte dela, e o resto segue no saldo.
    v_people := (v_params->>'people')::integer;
    if v_people is null or v_people < 1 then raise exception 'Número de pessoas inválido' using errcode = '22023'; end if;
    v_pids := array[v_payer];
    v_bases := array[v_balance / v_people + case when v_balance % v_people > 0 then 1 else 0 end];
    v_modes := array['equal'];
    v_lines := array['[]'::jsonb];

  elsif p_mode = 'equal' then
    v_payers := coalesce(private.eligible_payers(p_session, true), private.eligible_payers(p_session, false));
    if v_payers is null then raise exception 'Sem pagantes disponíveis' using errcode = 'P0011'; end if;
    select array_agg(s.cents order by p.ord) into v_bases
      from unnest(v_payers) with ordinality p(pid, ord)
      join private.split_equal(v_balance, v_payers) s on s.participant_id = p.pid;
    v_pids := v_payers;
    v_modes := array_fill('equal'::text, array[array_length(v_payers, 1)]);
    v_lines := array_fill('[]'::jsonb, array[array_length(v_payers, 1)]);

  elsif p_mode = 'by_item' then
    -- Item compartilhado: o saldo do item é dividido pela mesma regra do ADR-001.
    for k in 1 .. coalesce(array_length(v_ids, 1), 0) loop
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
    if v_pids is null then raise exception 'Selecione itens ainda não pagos' using errcode = '22023'; end if;
    if exists (select 1 from public.bill_shares b where b.participant_id = any(v_pids) and b.status = 'pending_payment') then
      raise exception 'Pagamento em andamento para este participante' using errcode = 'P0001'; end if;
    v_modes := array_fill('by_item'::text, array[array_length(v_pids, 1)]);

  else
    -- Valor fixo é o total que sai do cartão: taxa e gorjeta em percentual saem de dentro dele.
    if exists (select 1 from public.bill_shares b where b.participant_id = v_payer and b.status = 'pending_payment') then
      raise exception 'Pagamento em andamento para este participante' using errcode = 'P0001'; end if;
    v_requested := (v_params->>'amountCents')::bigint;
    if v_requested is null or v_requested <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
    v_tip_bps := (v_params->>'tipBps')::integer;
    v_tip_free := (v_params->>'tipCents')::bigint;
    if v_tip_bps < 0 or v_tip_free < 0 then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
    if v_mode = 'service_fee' and (coalesce(v_tip_bps, 0) > 0 or coalesce(v_tip_free, 0) > 0) then
      raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;
    v_rate := case when v_payer = any(v_waived) then coalesce(v_tip_bps, 0)
      when v_mode = 'service_fee' then v_bps else coalesce(v_tip_bps, 0) end;
    select s.base_cents, s.rest_cents into v_b, v_r from private.split_out_of_total(v_requested, v_rate) s;
    if v_b > v_balance then
      v_b := private.adjust_to_balance(v_b, v_balance);
      v_r := case when v_rate = 0 then 0 else private.service_fee_cents(v_b, v_rate) end;
      v_adjusted := true;
    end if;
    v_pids := array[v_payer]; v_bases := array[v_b]; v_modes := array['fixed_amount']; v_lines := array['[]'::jsonb];
    v_tips := array[case when v_mode = 'tip' then v_r + coalesce(v_tip_free, 0) else 0 end];
  end if;

  for i in 1 .. coalesce(array_length(v_pids, 1), 0) loop
    continue when v_bases[i] <= 0;
    v_fee := case
      when v_pids[i] = any(v_waived) then 0
      when p_mode = 'fixed_amount' and v_mode = 'service_fee' then v_r
      else private.service_fee_cents(v_bases[i], v_bps) end;
    v_shares := v_shares || jsonb_build_object('participantId', v_pids[i], 'mode', v_modes[i],
      'baseCents', v_bases[i], 'feeCents', v_fee, 'amountCents', v_bases[i] + v_fee,
      'tipCents', coalesce(v_tips[i], 0), 'feeWaived', v_pids[i] = any(v_waived), 'lines', v_lines[i]);
  end loop;
  if jsonb_array_length(v_shares) = 0 then
    raise exception 'Nada a dividir com os pagantes disponíveis' using errcode = 'P0011'; end if;

  return jsonb_build_object('mode', p_mode, 'balanceCents', v_balance, 'baseRemCents', v_balance,
    'feeRemCents', private.service_fee_cents(v_balance, v_bps),
    'totalRemCents', v_balance + private.service_fee_cents(v_balance, v_bps),
    'feeOrTipMode', v_mode, 'feeBps', v_bps,
    'requestedCents', v_requested, 'adjusted', v_adjusted, 'shares', v_shares,
    'itemsRemaining', coalesce((select jsonb_agg(jsonb_build_object('orderItemId', b.order_item_id, 'remainingCents', b.remaining_cents))
      from private.session_balances(p_session) b), '[]'::jsonb),
    'unassignedCents', v_balance - (select coalesce(sum((s->>'baseCents')::bigint), 0)::bigint from jsonb_array_elements(v_shares) s),
    'excludeShareIds', to_jsonb(v_exclude), 'version', private.split_version(p_session));
end $$;
revoke all on function private.compute_split(uuid, public.noowe_split_mode, jsonb, uuid) from public, anon, authenticated;

create or replace function private.commit_split(
  p_session uuid, p_actor uuid, p_mode public.noowe_split_mode, p_params jsonb,
  p_expected_version text, p_key uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions; v_plan jsonb; v_share jsonb; v_id uuid; v_round integer; v_ids uuid[] := '{}';
  v_line jsonb; v_prev public.bill_shares; v_part uuid; v_sum bigint := 0; v_balance bigint;
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
  v_balance := (v_plan->>'balanceCents')::bigint;
  select coalesce(max(round_no), 0) + 1 into v_round from public.bill_shares where table_session_id = p_session;
  v_ids := '{}';
  for v_share in select * from jsonb_array_elements(v_plan->'shares') loop
    v_part := (v_share->>'participantId')::uuid;
    v_sum := v_sum + (v_share->>'baseCents')::bigint;
    select * into v_prev from public.bill_shares s
      where s.table_session_id = p_session and s.participant_id = v_part and s.status = 'open';
    update public.bill_shares set status = 'superseded', updated_at = now()
      where table_session_id = p_session and participant_id = v_part and status = 'open';
    insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode,
        base_cents, service_fee_cents, amount_cents, tip_cents, committed_by, idempotency_key,
        fee_waived_by, fee_waived_at, fee_waived_reason)
      values (v_session.restaurant_id, p_session, v_part, v_round,
        (v_share->>'mode')::public.noowe_split_mode, (v_share->>'baseCents')::bigint,
        (v_share->>'feeCents')::bigint, (v_share->>'amountCents')::bigint, (v_share->>'tipCents')::bigint, p_actor, p_key,
        case when (v_share->>'feeWaived')::boolean then coalesce(v_prev.fee_waived_by, p_actor) end,
        case when (v_share->>'feeWaived')::boolean then coalesce(v_prev.fee_waived_at, now()) end,
        case when (v_share->>'feeWaived')::boolean then coalesce(v_prev.fee_waived_reason, 'A pedido do cliente') end)
      returning id into v_id;
    v_ids := v_ids || v_id;
    if (v_share->>'feeWaived')::boolean and v_prev.fee_waived_at is null then
      perform private.log_audit(v_session.restaurant_id, 'bill.fee_waived', 'bill_share', v_id, 'A pedido do cliente',
        null, jsonb_build_object('baseCents', v_share->'baseCents'), p_actor);
    end if;
    for v_line in select * from jsonb_array_elements(v_share->'lines') loop
      insert into public.bill_share_lines(bill_share_id, order_item_id, base_cents)
        values (v_id, (v_line->>'orderItemId')::uuid, (v_line->>'baseCents')::bigint);
    end loop;
  end loop;
  -- O que o plano substitui e não recriou (quem saiu da divisão) também deixa de valer.
  update public.bill_shares set status = 'superseded', updated_at = now()
    where id in (select (x)::uuid from jsonb_array_elements_text(v_plan->'excludeShareIds') x) and status = 'open';
  update public.table_sessions set billing_status = 'billing',
      billing_started_at = coalesce(billing_started_at, now()), updated_at = now() where id = p_session;

  -- Invariante: nunca se cobra mais consumo do que o saldo.
  if v_sum > v_balance then
    raise exception 'Soma das parcelas (%) excede o saldo (%)', v_sum, v_balance using errcode = 'P0009'; end if;
  return v_plan - 'shares' || jsonb_build_object('shareIds', to_jsonb(v_ids), 'round', v_round,
    'sharesCount', cardinality(v_ids), 'idempotentReplay', false);
end $$;
revoke all on function private.commit_split(uuid, uuid, public.noowe_split_mode, jsonb, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Retirar a taxa, gorjeta e resumo da conta
-- ---------------------------------------------------------------------------
-- Um toque, sem aprovação, e fica registrado. Vale só para a parcela da própria pessoa.
create or replace function public.customer_set_share_fee_waived(p_share_id uuid, p_waived boolean)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_bps integer; v_base bigint; v_fee bigint; v_total bigint; v_balance bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform 1 from public.table_sessions t join public.bill_shares b on b.table_session_id = t.id where b.id = p_share_id for update of t;
  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;
  if private.fee_or_tip_mode(s.table_session_id) <> 'service_fee' then
    raise exception 'Este restaurante não cobra taxa de serviço' using errcode = '22023'; end if;
  if coalesce(p_waived, false) = (s.fee_waived_at is not null) then
    return jsonb_build_object('shareId', s.id, 'baseCents', s.base_cents, 'feeCents', s.service_fee_cents,
      'amountCents', s.amount_cents, 'feeWaived', s.fee_waived_at is not null);
  end if;
  v_bps := private.session_fee_bps(s.table_session_id);
  v_balance := private.session_consumption_balance(s.table_session_id);
  v_total := s.amount_cents;
  if s.mode = 'fixed_amount' then
    -- Valor fixo é o que sai do cartão: sem a taxa, o mesmo valor é todo consumo.
    if p_waived then
      v_base := private.adjust_to_balance(v_total, v_balance); v_fee := 0;
    else
      select x.base_cents, x.rest_cents into v_base, v_fee from private.split_out_of_total(v_total, v_bps) x;
    end if;
  else
    v_base := s.base_cents;
    v_fee := case when p_waived then 0 else private.service_fee_cents(v_base, v_bps) end;
  end if;
  update public.bill_shares set base_cents = v_base, service_fee_cents = v_fee, amount_cents = v_base + v_fee,
      fee_waived_by = case when p_waived then auth.uid() end,
      fee_waived_at = case when p_waived then now() end,
      fee_waived_reason = case when p_waived then 'A pedido do cliente' end,
      updated_at = now()
    where id = s.id;
  perform private.log_audit(s.restaurant_id, case when p_waived then 'bill.fee_waived' else 'bill.fee_restored' end,
    'bill_share', s.id, case when p_waived then 'A pedido do cliente' else 'Cliente manteve a taxa' end,
    jsonb_build_object('feeCents', s.service_fee_cents), jsonb_build_object('feeCents', v_fee));
  return jsonb_build_object('shareId', s.id, 'baseCents', v_base, 'feeCents', v_fee, 'amountCents', v_base + v_fee, 'feeWaived', p_waived);
end $$;
revoke all on function public.customer_set_share_fee_waived(uuid, boolean) from public, anon;
grant execute on function public.customer_set_share_fee_waived(uuid, boolean) to authenticated;

-- A gorjeta é calculada sobre o consumo do pagamento. Sem percentuais pedidos, valem os do restaurante.
create or replace function public.customer_share_tip_options(p_share_id uuid, p_percents integer[] default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_percents integer[] := p_percents;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if exists (select 1 from unnest(coalesce(v_percents, '{}')) x where x < 0 or x > 100) then
    raise exception 'Percentual inválido' using errcode = '22023'; end if;
  if private.fee_or_tip_mode(s.table_session_id) <> 'tip' then return '[]'::jsonb; end if;
  if v_percents is null then
    select array(select x / 100 from unnest(pol.tip_presets_bps) x) into v_percents
      from public.table_sessions t
      join public.restaurant_model_policies pol on pol.restaurant_id = t.restaurant_id and pol.service_model = t.service_model
      where t.id = s.table_session_id;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('percent', x, 'cents', t.tip, 'totalCents', s.amount_cents + t.tip)
    order by x) from unnest(v_percents) x, lateral (select div(s.base_cents * x + 50, 100) as tip) t), '[]'::jsonb);
end $$;

-- O que o app precisa para mostrar a conta: saldo, modo da casa e de quem é a parte de quem saiu.
create or replace function public.customer_bill_summary(p_table_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare t record; pol public.restaurant_model_policies; v_pending bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001'; end if;
  select * into t from private.session_totals(p_table_session_id);
  select p.* into pol from public.table_sessions s
    join public.restaurant_model_policies p on p.restaurant_id = s.restaurant_id and p.service_model = s.service_model
    where s.id = p_table_session_id;
  select coalesce(sum(base_cents), 0) into v_pending from public.bill_shares
    where table_session_id = p_table_session_id and status = 'pending_payment';
  return jsonb_build_object('consumptionCents', t.base_all, 'paidCents', t.paid_sum, 'pendingCents', v_pending,
    'balanceCents', t.base_rem, 'settled', t.base_rem = 0 and v_pending = 0 and t.base_all > 0,
    'feeOrTipMode', private.fee_or_tip_mode(p_table_session_id), 'feeBps', private.session_fee_bps(p_table_session_id),
    'tipPresetsBps', to_jsonb(pol.tip_presets_bps), 'tipDefaultBps', pol.tip_default_bps,
    'splitModes', to_jsonb(pol.split_modes),
    'leftWithoutPaying', coalesce((select jsonb_agg(jsonb_build_object('participantId', p.id,
        'name', coalesce(p.display_name, 'Convidado'), 'leftAt', p.walkout_at) order by p.walkout_at)
      from public.table_session_participants p
      where p.table_session_id = p_table_session_id and p.walkout_at is not null), '[]'::jsonb));
end $$;
revoke all on function public.customer_bill_summary(uuid) from public, anon;
grant execute on function public.customer_bill_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reserva, expiração e pagamento tardio
-- ---------------------------------------------------------------------------
create or replace function private.reserve_share_payment(
  p_user uuid, p_share_id uuid, p_method text, p_tip_cents bigint, p_key uuid, p_provider text
) returns public.gateway_transactions language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  s public.bill_shares; v_tx public.gateway_transactions; v_acct public.restaurant_payment_accounts;
  v_key text; v_tip bigint; v_expires timestamptz; pol public.restaurant_model_policies; v_session uuid; v_balance bigint;
begin
  if p_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_method not in ('pix', 'credit_card') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023'; end if;
  v_key := 'share-payment:' || p_user || ':' || p_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key and customer_id = p_user;
  if v_tx.id is not null then return v_tx; end if;

  -- Dois pagamentos ao mesmo tempo nunca abatem mais que o saldo: a sessão é a fila.
  select table_session_id into v_session from public.bill_shares where id = p_share_id;
  if v_session is null then raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.table_sessions where id = v_session and status = 'active' for update) then
    raise exception 'Sessão da mesa indisponível' using errcode = 'P0001'; end if;
  select * into s from public.bill_shares where id = p_share_id for update;
  if not private.share_payer_allowed(s, p_user) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;

  v_tip := coalesce(p_tip_cents, s.tip_cents);
  if v_tip < 0 or v_tip > s.amount_cents then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 and private.fee_or_tip_mode(v_session) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;

  if s.status = 'pending_payment' then
    -- Cobrança em andamento, igual à pedida: reaproveita em vez de gerar outra (sem cobrança duplicada).
    select * into v_tx from public.gateway_transactions
      where id = s.payment_id and status in ('creating', 'pending') and (expires_at is null or expires_at > now())
        and payment_method = p_method and tip_cents = v_tip;
    if v_tx.id is not null then return v_tx; end if;
    -- Mudou a forma ou a gorjeta: a anterior não vale mais. Se ainda for paga, o pagamento tardio estorna.
    if s.payment_id is not null then
      perform private.apply_payment_event(s.payment_id, (select provider from public.gateway_transactions where id = s.payment_id),
        'replaced:' || s.payment_id, 'REPLACED', 'failed', null, '{}'::jsonb, 'cancelled');
    end if;
    perform private.release_bill_share_row(s.id);
    select * into s from public.bill_shares where id = p_share_id;
  end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;

  -- A conta pode ter mudado desde a divisão. Nunca altera em silêncio um valor que a pessoa confirmou.
  v_balance := private.session_consumption_balance(v_session);
  if s.base_cents > v_balance then
    raise exception 'A conta mudou. Confira os valores atualizados.' using errcode = 'P0012'; end if;

  if p_provider = 'asaas' then
    select * into v_acct from public.restaurant_payment_accounts
      where restaurant_id = s.restaurant_id and status = 'active';
    if v_acct.id is null then
      raise exception 'Pagamento online indisponível neste restaurante' using errcode = 'P0007'; end if;
  end if;
  select p.* into pol from public.table_sessions t
    join public.restaurant_model_policies p on p.restaurant_id = t.restaurant_id and p.service_model = t.service_model
    where t.id = v_session;
  v_expires := now() + make_interval(mins => case when p_method = 'pix' then pol.pix_expiry_min else pol.card_hold_min end);

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

-- Pagamento confirmado depois que a reserva caiu: só vale se a conta ainda comporta; senão, volta ao cliente.
create or replace function private.settle_bill_share(p_tx_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare tx public.gateway_transactions; s public.bill_shares; v_kind public.noowe_tip_allocation; v_waiter uuid; v_session uuid; v_active boolean;
begin
  select * into tx from public.gateway_transactions where id = p_tx_id;
  select table_session_id into v_session from public.bill_shares where id = tx.bill_share_id;
  if v_session is null then return; end if;
  select status = 'active' into v_active from public.table_sessions where id = v_session for update;
  select * into s from public.bill_shares where id = tx.bill_share_id for update;
  if s.status = 'paid' and s.payment_id is not distinct from tx.id then return; end if;
  if not (s.status = 'pending_payment' and s.payment_id is not distinct from tx.id)
     and not (s.status = 'open' and s.payment_id is null and v_active and tx.amount_cents = s.amount_cents + tx.tip_cents
       and s.base_cents <= private.session_consumption_balance(v_session)) then
    perform private.enqueue_refund(tx.id, 'pagamento tardio');
    return;
  end if;
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
    perform private.write_share_receipt(tx.id);
  exception when others then
    perform private.log_system_audit(s.restaurant_id, 'receipt.write_failed', 'payment', tx.id, sqlerrm, null, null);
  end;
  begin
    perform private.close_session_if_settled(s.table_session_id);
  exception when others then
    -- O dinheiro já entrou: o webhook não pode falhar. Fica registrado para o gerente.
    perform private.log_system_audit(s.restaurant_id, 'bill.close_failed', 'table_session', s.table_session_id,
      sqlerrm, null, null);
  end;
end $$;
revoke all on function private.settle_bill_share(uuid) from public, anon, authenticated;

-- A reserva caiu: o valor volta ao saldo. Passa pela mesma fronteira dos eventos do provedor, e repetir não faz nada.
create or replace function private.bill_hold_sweep()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_tx record; v_count integer := 0;
begin
  for v_tx in
    select g.id, g.provider from public.gateway_transactions g
    join public.bill_shares s on s.id = g.bill_share_id and s.payment_id = g.id and s.status = 'pending_payment'
    where g.purpose = 'bill_share' and g.status in ('creating', 'pending') and g.expires_at < now()
    for update of g skip locked
  loop
    perform private.apply_payment_event(v_tx.id, v_tx.provider, 'hold-expired:' || v_tx.id, 'HOLD_EXPIRED', 'failed', null, '{}'::jsonb, 'expired');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function private.bill_hold_sweep() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Pagamento presencial
-- ---------------------------------------------------------------------------
-- Dinheiro, maquininha e Pix na mesa abatem do mesmo saldo. O valor é sempre do servidor. Regras de caixa ficam na O8.
create or replace function public.restaurant_record_bill_payment(
  p_table_session_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_base_cents bigint default null, p_waive_fee boolean default false, p_tip_cents bigint default 0, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions; v_key text; v_tx public.gateway_transactions; v_balance bigint; v_bps integer; v_base bigint; v_fee bigint;
  v_tip bigint := coalesce(p_tip_cents, 0); v_share uuid; v_kind public.noowe_tip_allocation; v_waiter uuid; v_closed boolean := false;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'A pedido do cliente');
begin
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_payment_method not in ('cash', 'credit_card', 'debit_card', 'pix') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023'; end if;
  select * into v_session from public.table_sessions where id = p_table_session_id for update;
  if v_session.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_session.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);

  v_key := 'manual-share:' || p_table_session_id || ':' || p_idempotency_key;
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key;
  if v_tx.id is not null then
    return jsonb_build_object('transactionId', v_tx.id, 'shareId', v_tx.bill_share_id, 'amountCents', v_tx.amount_cents, 'idempotentReplay', true);
  end if;
  if v_session.status <> 'active' then raise exception 'Sessão já encerrada' using errcode = 'P0001'; end if;

  v_balance := private.session_consumption_balance(p_table_session_id);
  if v_balance <= 0 then raise exception 'Esta conta já está quitada' using errcode = 'P0011'; end if;
  if p_base_cents is not null and p_base_cents <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  v_base := private.adjust_to_balance(coalesce(p_base_cents, v_balance), v_balance);
  v_bps := private.session_fee_bps(p_table_session_id);
  v_fee := case when coalesce(p_waive_fee, false) then 0 else private.service_fee_cents(v_base, v_bps) end;
  if v_tip < 0 or v_tip > v_base + v_fee then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 and private.fee_or_tip_mode(p_table_session_id) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;

  select c.tip_allocation into v_kind from public.restaurant_model_configs c where c.restaurant_id = v_session.restaurant_id;
  if v_kind = 'table_waiter' then
    select t.assigned_waiter_id into v_waiter from public.tables t where t.id = v_session.table_id;
  end if;
  insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode, base_cents, service_fee_cents, amount_cents,
      tip_cents, tip_recipient_kind, tip_recipient_user_id, status, committed_by, paid_at, fee_waived_by, fee_waived_at, fee_waived_reason)
    values (v_session.restaurant_id, p_table_session_id, null,
      (select coalesce(max(round_no), 0) + 1 from public.bill_shares where table_session_id = p_table_session_id),
      'fixed_amount', v_base, v_fee, v_base + v_fee, v_tip, v_kind, v_waiter, 'paid', auth.uid(), now(),
      case when p_waive_fee and v_bps > 0 then auth.uid() end, case when p_waive_fee and v_bps > 0 then now() end,
      case when p_waive_fee and v_bps > 0 then v_reason end)
    returning id into v_share;
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents, status,
      idempotency_key, purpose, table_session_id, bill_share_id, confirmed_at, metadata, created_at, updated_at)
    values (v_session.restaurant_id, 'manual', p_payment_method, v_base + v_fee + v_tip, v_tip, 0, 'completed', v_key, 'bill_share',
      p_table_session_id, v_share, now(), jsonb_build_object('recorded_by', auth.uid()), now(), now())
    returning * into v_tx;
  update public.bill_shares set payment_id = v_tx.id where id = v_share;
  if p_waive_fee and v_bps > 0 then
    perform private.log_audit(v_session.restaurant_id, 'bill.fee_waived', 'bill_share', v_share, v_reason,
      null, jsonb_build_object('baseCents', v_base));
  end if;
  begin
    v_closed := private.close_session_if_settled(p_table_session_id);
  exception when others then
    perform private.log_system_audit(v_session.restaurant_id, 'bill.close_failed', 'table_session', p_table_session_id, sqlerrm, null, null);
  end;
  return jsonb_build_object('transactionId', v_tx.id, 'shareId', v_share, 'baseCents', v_base, 'feeCents', v_fee, 'tipCents', v_tip,
    'amountCents', v_tx.amount_cents, 'balanceCents', v_balance - v_base, 'requestedCents', p_base_cents,
    'adjusted', p_base_cents is not null and p_base_cents > v_balance, 'closed', v_closed, 'idempotentReplay', false);
end $$;
revoke all on function public.restaurant_record_bill_payment(uuid, text, uuid, bigint, boolean, bigint, text) from public, anon;
grant execute on function public.restaurant_record_bill_payment(uuid, text, uuid, bigint, boolean, bigint, text) to authenticated;

-- Saldo e modo da casa para o garçom cobrar sem fazer conta: os valores vêm prontos do servidor.
create or replace function public.restaurant_get_session_bill(p_table_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_bps integer;
begin
  select * into s from public.table_sessions where id = p_table_session_id;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(s.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);
  select * into t from private.session_totals(p_table_session_id);
  v_bps := private.session_fee_bps(p_table_session_id);
  return jsonb_build_object('tableSessionId', s.id, 'consumptionCents', t.base_all, 'paidCents', t.paid_sum, 'balanceCents', t.base_rem,
    'feeOrTipMode', private.fee_or_tip_mode(p_table_session_id), 'feeBps', v_bps,
    'feeCents', private.service_fee_cents(t.base_rem, v_bps), 'totalWithFeeCents', t.base_rem + private.service_fee_cents(t.base_rem, v_bps));
end $$;
revoke all on function public.restaurant_get_session_bill(uuid) from public, anon;
grant execute on function public.restaurant_get_session_bill(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Quem sai sem pagar deixa a parte para o titular
-- ---------------------------------------------------------------------------
create or replace function private.notify_part_left_to_host(p_session uuid, p_participant uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_host uuid; v_name text;
begin
  select r.user_id into v_host from public.table_session_participants r
    where r.table_session_id = p_session and r.is_host and r.user_id is not null limit 1;
  select coalesce(p.display_name, 'Um convidado') into v_name from public.table_session_participants p where p.id = p_participant;
  if v_host is null then return; end if;
  perform private.create_notification(v_host, 'Conta da mesa', v_name || ' saiu sem pagar. A parte ficou com você.',
    'system', p_session, null, jsonb_build_object('kind', 'bill_part_left', 'table_session_id', p_session, 'participant_id', p_participant));
end $$;
revoke all on function private.notify_part_left_to_host(uuid, uuid) from public, anon, authenticated;

create or replace function public.customer_abandon_share(p_share_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_part uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'open' then raise exception 'Só parcela aberta pode ser abandonada' using errcode = 'P0001'; end if;
  v_part := private.responsible_participant(s.participant_id);
  -- Regra provisória (ADR-032): o titular responde pela comanda e não sai sem quitar.
  if exists (select 1 from public.table_session_participants where id = v_part and is_host) then
    raise exception 'Quem abriu a comanda responde pelo saldo: quite antes de sair' using errcode = 'P0004'; end if;
  update public.bill_shares set status = 'abandoned', updated_at = now() where id = s.id;
  update public.table_session_participants set walkout_at = now() where id = v_part;
  perform private.log_audit(s.restaurant_id, 'bill.share_abandoned', 'bill_share', s.id,
    'participante abandonou o pagamento', jsonb_build_object('amount_cents', s.amount_cents), null, auth.uid());
  perform private.notify_part_left_to_host(s.table_session_id, v_part);
  return jsonb_build_object('shareId', s.id, 'movedToHost', true);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Recibo
-- ---------------------------------------------------------------------------
create or replace function private.write_share_receipt(p_tx_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare tx public.gateway_transactions; s public.bill_shares; v_items jsonb;
begin
  select * into tx from public.gateway_transactions where id = p_tx_id;
  select * into s from public.bill_shares where id = tx.bill_share_id;
  if s.id is null or tx.customer_id is null then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', coalesce(mi.name, 'Item') || case when l.base_cents < item.cents then ' (parcial)' else '' end,
      'quantity', case when l.base_cents < item.cents then 1 else oi.quantity end,
      'unitPrice', l.base_cents::numeric / 100 / (case when l.base_cents < item.cents then 1 else greatest(oi.quantity, 1) end),
      'totalPrice', l.base_cents::numeric / 100) order by oi.created_at, oi.id), '[]'::jsonb)
    into v_items
  from public.bill_share_lines l
  join public.order_items oi on oi.id = l.order_item_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  cross join lateral (select coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint) as cents) item
  where l.bill_share_id = s.id;
  -- Valor fixo e partes iguais abatem do saldo sem marcar item.
  if jsonb_array_length(v_items) = 0 then
    v_items := jsonb_build_array(jsonb_build_object('name', 'Consumo', 'quantity', 1,
      'unitPrice', s.base_cents::numeric / 100, 'totalPrice', s.base_cents::numeric / 100));
  end if;
  insert into public.casual_dining_receipts(gateway_transaction_id, restaurant_id, customer_id, table_session_id,
      items, subtotal, service_fee_percent, service_fee, total, tip, payment_method)
  values (tx.id, s.restaurant_id, tx.customer_id, s.table_session_id, v_items,
    s.base_cents::numeric / 100,
    case when s.service_fee_cents > 0 then private.session_fee_bps(s.table_session_id)::numeric / 100 else 0 end,
    s.service_fee_cents::numeric / 100, s.amount_cents::numeric / 100, tx.tip_cents::numeric / 100, tx.payment_method)
  on conflict (gateway_transaction_id) do nothing;
end $$;

drop function if exists private.decompose_amounts(bigint[], bigint);

-- ---------------------------------------------------------------------------
-- 9. Sair da mesa, saldo por pessoa, fechamento por walk-out, tick e pedido da comanda
-- ---------------------------------------------------------------------------
drop function if exists private.leave_table_session_as(uuid, uuid);
drop function if exists public.customer_leave_table_session(uuid);
create or replace function private.leave_table_session_as(p_table_session_id uuid, p_user_id uuid, p_confirm_unpaid boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session public.table_sessions;
  v_next_host uuid;
  v_remaining integer;
  v_part public.table_session_participants;
  v_owed bigint;
begin
  select * into v_session
  from public.table_sessions
  where id = p_table_session_id and status = 'active'
  for update;

  if v_session.id is null or not exists (
    select 1 from public.table_session_participants
    where table_session_id = p_table_session_id and user_id = p_user_id
  ) then
    raise exception 'Active table session not accessible' using errcode = 'P0002';
  end if;

  -- ADR-021: a dívida é da pessoa (diner), não de quem digitou o pedido, e parcela paga zera.
  select * into v_part from public.table_session_participants p
    where p.table_session_id = p_table_session_id and p.user_id = p_user_id;
  v_owed := private.participant_open_balance_cents(p_table_session_id, v_part.id);
  if v_owed > 0 then
    -- Regra provisória (ADR-032): o titular responde pela comanda; os demais podem sair, confirmando, e a parte fica com ele.
    if v_part.is_host or not p_confirm_unpaid then
      raise exception 'Quite sua parte da conta antes de sair da mesa' using errcode = 'P0004';
    end if;
    update public.bill_shares set status = 'abandoned', updated_at = now()
      where table_session_id = p_table_session_id and participant_id = v_part.id and status = 'open';
    update public.table_session_participants set walkout_at = now() where id = v_part.id;
    perform private.log_audit(v_session.restaurant_id, 'bill.left_unpaid', 'table_session', p_table_session_id,
      'Saiu da mesa sem pagar; a parte ficou com o titular', null,
      jsonb_build_object('participantId', v_part.id, 'owedCents', v_owed), p_user_id);
    perform private.notify_part_left_to_host(p_table_session_id, v_part.id);
    return jsonb_build_object('tableSessionId', p_table_session_id, 'left', true, 'movedToHost', true, 'owedCents', v_owed);
  end if;

  -- Quem tem parcela no histórico não pode sumir da comanda: fica registrado que saiu.
  if exists (select 1 from public.bill_shares b where b.participant_id = v_part.id) then
    update public.table_session_participants set walkout_at = now() where id = v_part.id;
  else
    delete from public.table_session_participants where id = v_part.id;
  end if;

  select count(*)::integer into v_remaining
  from public.table_session_participants
  where table_session_id = p_table_session_id and user_id is not null and walkout_at is null;

  if v_remaining > 0 and (v_session.customer_id = p_user_id or v_session.primary_user_id = p_user_id) then
    select user_id into v_next_host
    from public.table_session_participants
    where table_session_id = p_table_session_id and user_id is not null and walkout_at is null
    order by joined_at
    limit 1;

    update public.table_session_participants
    set is_host = (user_id = v_next_host)
    where table_session_id = p_table_session_id and user_id is not null;

    update public.table_sessions
    set customer_id = v_next_host, primary_user_id = v_next_host,
        last_activity = now(), updated_at = now()
    where id = p_table_session_id;
  elsif v_remaining = 0 then
    if not exists (select 1 from private.table_unpaid_items(p_table_session_id) where remaining_cents > 0) then
      update public.table_sessions
      set status = 'ended', ended_at = now(), last_activity = now(), updated_at = now()
      where id = p_table_session_id;

      if not exists (select 1 from public.orders where table_session_id = p_table_session_id) and exists (
        select 1 from public.reservations
        where table_id = v_session.table_id and status::text = 'seated'
      ) then
        update public.reservations
        set status = 'confirmed', updated_at = now()
        where table_id = v_session.table_id and status::text = 'seated';

        update public.tables
        set status = 'reserved', occupied_since = null, updated_at = now()
        where id = v_session.table_id;
      else
        update public.reservations set status = 'completed', updated_at = now()
        where table_id = v_session.table_id and status::text = 'seated';
        update public.tables
        set status = 'available', occupied_since = null, updated_at = now()
        where id = v_session.table_id and status = 'occupied';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'tableSessionId', p_table_session_id,
    'left', true,
    'remainingParticipants', v_remaining
  );
end;
$$;
revoke all on function private.leave_table_session_as(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.customer_leave_table_session(p_table_session_id uuid, p_confirm_unpaid boolean default false)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  return private.leave_table_session_as(p_table_session_id, auth.uid(), p_confirm_unpaid);
end $$;
revoke all on function public.customer_leave_table_session(uuid, boolean) from public, anon;
grant execute on function public.customer_leave_table_session(uuid, boolean) to authenticated;

create or replace function private.assert_single_active_session(p_user_id uuid, p_table_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_table text; v_restaurant text;
begin
  perform pg_advisory_xact_lock(hashtextextended('single_active_session:' || p_user_id::text, 0));
  select t.table_number, r.name into v_table, v_restaurant
  from public.table_session_participants p
  join public.table_sessions s on s.id = p.table_session_id
  join public.tables t on t.id = s.table_id
  join public.restaurants r on r.id = s.restaurant_id
  where p.user_id = p_user_id
    and s.status = 'active'
    and p.walkout_at is null
    -- Mesa trocada pela equipe: o QR da mesa antiga continua apontando para a mesma comanda.
    and (p_table_id is null or (s.table_id <> p_table_id and s.previous_table_id is distinct from p_table_id))
  order by s.last_activity desc
  limit 1;
  if found then
    raise exception 'Você já está na % da %. Encerre a comanda para continuar.',
      case when v_table ~* '^\s*mesa' then v_table else 'Mesa ' || v_table end, v_restaurant
      using errcode = 'P0016';
  end if;
end;
$$;

create or replace function private.participant_open_balance_cents(p_session uuid, p_participant uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare v_base bigint; v_fee bigint := 0; v_open_share bigint;
begin
  if exists (select 1 from public.bill_shares s
    where s.table_session_id = p_session and s.participant_id = p_participant and s.status = 'paid') then
    return 0;
  end if;

  select coalesce(sum(b.remaining_cents), 0)::bigint into v_base
  from private.session_balances(p_session, '{}', array['paid']::public.noowe_bill_share_status[]) b
  join public.order_items oi on oi.id = b.order_item_id
  join public.orders o on o.id = oi.order_id
  where coalesce(
    private.responsible_participant(b.owner_participant),
    (select p.id from public.table_session_participants p
      where p.table_session_id = p_session and p.user_id = o.customer_id limit 1)
  ) = p_participant;

  -- Depois de valor fixo ou partes iguais, ninguém deve mais do que o saldo.
  v_base := least(v_base, private.session_consumption_balance(p_session));

  begin
    v_fee := private.service_fee_cents(v_base, private.session_fee_bps(p_session));
  exception when others then
    v_fee := 0;
  end;

  select coalesce(sum(s.amount_cents), 0)::bigint into v_open_share
  from public.bill_shares s
  where s.table_session_id = p_session and s.participant_id = p_participant
    and s.status in ('open', 'pending_payment');

  return greatest(v_base + v_fee, v_open_share);
end;
$$;

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
  perform private.notify_part_left_to_host(p_session_id, p_participant_id);
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

create or replace function private.engine_tick()
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid; v_result jsonb := '{}'::jsonb; v_n integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('noowe.engine_tick', 0)) then
    return jsonb_build_object('skipped', true);
  end if;
  begin
    v_result := v_result || jsonb_build_object('reservations', private.reservation_expire_sweep(null, null));
  exception when others then raise warning 'engine_tick reservas: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('queue', private.queue_expire_sweep(null, null));
  exception when others then raise warning 'engine_tick fila: %', sqlerrm; end;
  v_n := 0;
  for v_id in select distinct restaurant_id from public.restaurant_model_policies where service_model = 'quick_service' loop
    begin
      v_n := v_n + private.quick_service_sweep(v_id);
    exception when others then raise warning 'engine_tick quick %: %', v_id, sqlerrm; end;
  end loop;
  v_result := v_result || jsonb_build_object('quick', v_n);
  v_n := 0;
  for v_id in select distinct restaurant_id from public.table_sessions where status = 'active' loop
    begin
      v_n := v_n + private.session_idle_sweep(v_id);
    exception when others then raise warning 'engine_tick comanda parada %: %', v_id, sqlerrm; end;
  end loop;
  v_result := v_result || jsonb_build_object('idle', v_n);
  begin
    v_result := v_result || jsonb_build_object('billHolds', private.bill_hold_sweep());
  exception when others then raise warning 'engine_tick reservas de conta: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('timeRules', private.engine_time_rules());
  exception when others then raise warning 'engine_tick regras: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('pushRetries', private.retry_undelivered_pushes());
  exception when others then raise warning 'engine_tick push: %', sqlerrm; end;
  return v_result;
end $$;

create or replace function public.customer_open_table_session(p_qr_data text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_qr public.table_qr_codes;
  v_table public.tables;
  v_session public.table_sessions;
  v_reservation public.reservations;
  v_name text;
  v_data text := btrim(p_qr_data);
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Look up the code ignoring active/expiry/signature first so we can tell
  -- "never existed" apart from "existed but is no longer usable".
  select * into v_qr
  from public.table_qr_codes
  where qr_code_data = v_data
  order by created_at desc
  limit 1;

  if v_qr.id is null then
    raise exception 'QR code not recognized' using errcode = '22023';
  end if;

  if v_qr.signature is distinct from encode(sha256(v_qr.qr_code_data::bytea), 'hex') then
    raise exception 'QR code failed signature check' using errcode = '22023';
  end if;

  if not v_qr.is_active then
    raise exception 'QR code was replaced by a newer one' using errcode = 'P0006';
  end if;

  if v_qr.expires_at is not null and v_qr.expires_at <= now() then
    raise exception 'QR code has expired' using errcode = 'P0007';
  end if;

  if not exists (
    select 1 from public.restaurants r where r.id = v_qr.restaurant_id and r.is_active
  ) then
    raise exception 'Restaurant is not active' using errcode = '22023';
  end if;

  -- ADR-018: QR de mesa unida abre a sessão da mesa principal (uma sessão e uma conta por grupo).
  perform private.lock_floor(v_qr.restaurant_id, false);

  select * into v_table
  from public.tables
  where id = private.table_group_root(v_qr.table_id) and restaurant_id = v_qr.restaurant_id
  for update;

  if v_table.id is null then
    raise exception 'Table is not available for check-in' using errcode = 'P0005';
  end if;

  select * into v_session
  from public.table_sessions
  where table_id = v_table.id and status = 'active'
  order by started_at desc
  limit 1;

  -- Com a comanda aberta, "payment" e "partial_payment" não impedem ninguém de entrar.
  if v_table.status in ('blocked', 'cleaning')
     or (v_session.id is null and v_table.status in ('payment', 'partial_payment')) then
    raise exception 'Table is not available for check-in' using errcode = 'P0005';
  end if;

  -- If staff assigned this table to a confirmed reservation, the QR doubles
  -- as a secure self check-in: only the reservation owner or an accepted
  -- invited guest can occupy it. Manually reserved tables without a linked
  -- reservation keep the ordinary walk-in QR flow.
  if v_table.status = 'reserved' then
    select * into v_reservation
    from public.reservations r
    where r.table_id = v_table.id
      and r.status::text = 'confirmed'
      and private.reservation_in_check_in_window(r.restaurant_id, r.reservation_time)
    order by r.reservation_time
    limit 1
    for update;

    if v_reservation.id is not null
      and v_reservation.customer_id is distinct from auth.uid()
      and not exists (
        select 1 from public.reservation_guests g
        where g.reservation_id = v_reservation.id
          and g.guest_user_id = auth.uid()
          and g.status = 'accepted'
      )
    then
      raise exception 'This table is reserved for another customer' using errcode = 'P0005';
    end if;
  end if;

  -- ADR-021: uma comanda ativa por cliente. Quem já está em outra mesa é recusado (P0016), não movido,
  -- e nenhuma sessão é encerrada por inatividade: comanda parada só gera alerta à equipe.
  perform private.assert_single_active_session(auth.uid(), v_table.id);

  if v_session.id is null then
    insert into public.table_sessions(
      restaurant_id, table_id, qr_code_id, customer_id, primary_user_id,
      guest_user_ids, guest_count, status, started_at, last_activity,
      total_orders, total_spent, created_at, updated_at
    ) values (
      v_table.restaurant_id, v_table.id, v_qr.id, auth.uid(), auth.uid(),
      '[]', 1, 'active', now(), now(), 0, 0, now(), now()
    ) returning * into v_session;
  else
    update public.table_sessions
    set qr_code_id = coalesce(qr_code_id, v_qr.id),
        customer_id = coalesce(customer_id, auth.uid()),
        primary_user_id = coalesce(primary_user_id, auth.uid()),
        last_activity = now(),
        updated_at = now()
    where id = v_session.id
    returning * into v_session;
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.table_session_participants(table_session_id, user_id, display_name, is_host)
  values (
    v_session.id,
    auth.uid(),
    coalesce(nullif(btrim(v_name), ''), 'Cliente'),
    v_session.customer_id = auth.uid()
  )
  on conflict (table_session_id, user_id) where user_id is not null
  -- Quem volta à mesa volta a responder pela própria parte.
  do update set display_name = excluded.display_name, walkout_at = null;

  -- Os estados informativos ficam como estão: entrar na mesa não desfaz "Conta pedida".
  update public.tables
  set status = case when v_table.status in ('payment', 'partial_payment') then v_table.status else 'occupied' end,
      occupied_since = coalesce(occupied_since, now()), updated_at = now()
  where id = v_table.id;

  if v_reservation.id is not null then
    update public.reservations
    set status = 'seated', updated_at = now()
    where id = v_reservation.id;
  end if;

  return jsonb_build_object(
    'restaurantId', v_table.restaurant_id,
    'tableId', v_table.id,
    'tableSessionId', v_session.id,
    'tableNumber', v_table.table_number
  );
end;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_record_payment(p_order_id uuid, p_payment_method text, p_amount numeric, p_tip_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_order record;
  v_updated_order record;
  v_tx_id uuid;
  v_existing record;
  v_key text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

  -- Pedido de comanda aberta abate do saldo único: o valor vem do servidor, não do app (G5). Versões antigas chegam por aqui.
  if v_order.table_session_id is not null and exists (
      select 1 from public.table_sessions ts where ts.id = v_order.table_session_id and ts.status = 'active') then
    return public.restaurant_record_bill_payment(v_order.table_session_id, p_payment_method,
      md5(p_order_id::text || ':' || coalesce(p_idempotency_key, gen_random_uuid()::text))::uuid,
      (select nullif(coalesce(sum(l.open_cents), 0), 0)::bigint from private.session_lines(v_order.table_session_id) l
         join public.order_items oi on oi.id = l.order_item_id where oi.order_id = p_order_id),
      false, round(coalesce(p_tip_amount, 0) * 100)::bigint);
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payment amount: %', p_amount using errcode = '22023';
  end if;

  if p_payment_method not in ('cash','credit_card','debit_card','pix','wallet','voucher','other') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22023';
  end if;

  -- Idempotent retry: if the client already sent this exact key for this
  -- order, return the transaction that was recorded the first time instead
  -- of creating a duplicate.
  if p_idempotency_key is not null then
    select * into v_existing
    from public.gateway_transactions
    where order_id = p_order_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_existing.id is not null then
      return jsonb_build_object(
        'transaction_id', v_existing.id,
        'order_id', p_order_id,
        'payment_method', v_existing.payment_method,
        'amount', v_existing.amount,
        'tip_amount', p_tip_amount,
        'status', v_existing.status,
        'idempotent_replay', true
      );
    end if;
  end if;

  v_key := coalesce(p_idempotency_key, gen_random_uuid()::text);

  insert into public.gateway_transactions(
    restaurant_id, order_id, customer_id, provider, payment_method,
    amount, amount_cents, status, idempotency_key, metadata, created_at, updated_at
  )
  values(
    v_order.restaurant_id, p_order_id, v_order.customer_id,
    'manual', p_payment_method,
    p_amount, (p_amount * 100)::numeric(12,2), 'completed',
    v_key,
    jsonb_build_object('tip_amount', p_tip_amount, 'notes', p_notes),
    now(), now()
  )
  returning id into v_tx_id;

  update public.orders
  set
    payment_method = p_payment_method,
    payment_status = 'confirmed',
    tip_amount     = coalesce(tip_amount, 0) + p_tip_amount,
    completed_at   = case when completed_at is null then now() else completed_at end,
    updated_at     = now()
  where id = p_order_id
  returning * into v_updated_order;

  if v_order.customer_id is not null then
    perform private.loyalty_award_points(
      v_order.customer_id,
      v_order.restaurant_id,
      p_order_id,
      p_amount
    );
  end if;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'order_id', p_order_id,
    'payment_method', p_payment_method,
    'amount', p_amount,
    'tip_amount', p_tip_amount,
    'status', 'completed'
  );
end;
$function$;
