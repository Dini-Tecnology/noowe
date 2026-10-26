-- Cinco funções ainda chegavam ao anon pelo grant a PUBLIC. authenticated e service_role têm concessão própria.
revoke all on function public.customer_add_table_companion(uuid, text, boolean, smallint, text) from public;
revoke all on function public.customer_resolve_service_qr(text) from public;
revoke all on function public.restaurant_confirm_pickup(uuid, text) from public;
revoke all on function public.restaurant_generate_counter_qr(uuid, text) from public;
revoke all on function public.restaurant_record_payment(uuid, text, numeric, numeric, text, text) from public;
