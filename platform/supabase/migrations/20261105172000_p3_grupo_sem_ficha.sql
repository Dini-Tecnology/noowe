-- P3: quem não tem ficha no restaurante não entra em grupo nenhum.
create or replace function private.customer_in_group(p_restaurant uuid, p_user uuid, p_audience text, p_inactive_days integer)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c public.customer_profiles; v_last timestamptz; v_birth date;
begin
  if p_audience = 'all' then return true; end if;
  if p_user is null then return p_audience = 'all'; end if;
  select * into c from public.customer_profiles where restaurant_id = p_restaurant and user_id = p_user;
  select max(o.created_at) into v_last from public.orders o where o.restaurant_id = p_restaurant and o.customer_id = p_user and o.status::text <> 'cancelled'
    and o.created_at < now() - interval '1 hour';
  v_last := greatest(v_last, c.last_visit_at);
  -- Sem ficha, o resultado seria nulo, e o cupom passaria por engano.
  return coalesce(case p_audience
    when 'new' then v_last is null and coalesce(c.total_visits, 0) = 0
    when 'vip' then c.segment = 'vip'
    when 'birthday' then (select extract(month from coalesce(c.birthday, p.birth_date)) from public.profiles p where p.id = p_user) = extract(month from now() at time zone 'America/Sao_Paulo')
    when 'inactive' then v_last is not null and v_last < now() - make_interval(days => coalesce(p_inactive_days, 30))
    else false end, false);
end $$;
