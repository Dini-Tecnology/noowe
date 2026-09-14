-- table_session_participants_select_member (20260814110000) queries
-- table_session_participants from inside its own USING clause, so Postgres
-- re-evaluates the same RLS policy for the inner query and recurses forever
-- ("infinite recursion detected in policy for relation
-- table_session_participants"). Because orders_select_table_participant and
-- profiles_select_for_restaurant_staff transitively touch this table (via
-- orders), the recursion also breaks the customer Orders and Profile screens.
--
-- Fix: move the self-membership check into a SECURITY DEFINER helper, same
-- pattern as private.has_restaurant_role. The function body still queries
-- table_session_participants, but it runs as the function owner (which
-- bypasses RLS on the table it owns), so it no longer re-enters the policy
-- that called it.

create or replace function private.is_table_session_participant(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.table_session_participants me
    where me.table_session_id = target_session_id
      and me.user_id = auth.uid()
  );
$$;

revoke all on function private.is_table_session_participant(uuid) from public;
grant execute on function private.is_table_session_participant(uuid) to authenticated, service_role;

drop policy if exists table_session_participants_select_member on public.table_session_participants;
create policy table_session_participants_select_member on public.table_session_participants
for select to authenticated
using (
  private.is_table_session_participant(table_session_participants.table_session_id)
  or private.has_restaurant_role((
    select s.restaurant_id from public.table_sessions s where s.id = table_session_participants.table_session_id
  ))
);
