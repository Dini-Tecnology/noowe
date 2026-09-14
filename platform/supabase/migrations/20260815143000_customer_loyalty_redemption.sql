-- Customer loyalty redemption.
-- Reward prices are validated server-side so a client cannot choose its own cost.

create or replace function public.customer_redeem_loyalty_reward(
  p_loyalty_program_id uuid,
  p_reward_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_program public.loyalty_programs;
  v_title text;
  v_points_cost numeric;
  v_claim jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_program
  from public.loyalty_programs
  where id = p_loyalty_program_id
    and user_id = auth.uid()
    and is_active
  for update;

  if v_program.id is null then
    raise exception 'Loyalty program not found' using errcode = 'P0002';
  end if;

  select reward.title, reward.points_cost
  into v_title, v_points_cost
  from (values
    ('dessert'::text, 'Sobremesa grátis'::text, 500::numeric),
    ('house_drink', 'Drink da casa', 800::numeric),
    ('premium_starter', 'Entrada premium', 1200::numeric),
    ('dinner_for_two', 'Jantar para 2', 3000::numeric)
  ) as reward(code, title, points_cost)
  where reward.code = p_reward_code;

  if v_title is null then
    raise exception 'Reward not found' using errcode = 'P0002';
  end if;

  if v_program.points < v_points_cost then
    raise exception 'Insufficient loyalty points' using errcode = 'P0001';
  end if;

  v_claim := jsonb_build_object(
    'code', p_reward_code,
    'title', v_title,
    'points_cost', v_points_cost,
    'created_at', now()
  );

  update public.loyalty_programs
  set points = points - v_points_cost,
      rewards_claimed = coalesce(rewards_claimed, '[]'::jsonb) || jsonb_build_array(v_claim),
      updated_at = now()
  where id = v_program.id;

  return jsonb_build_object(
    'programId', v_program.id,
    'reward', v_claim,
    'remainingPoints', v_program.points - v_points_cost
  );
end;
$$;

revoke all on function public.customer_redeem_loyalty_reward(uuid, text) from public;
grant execute on function public.customer_redeem_loyalty_reward(uuid, text) to authenticated;

