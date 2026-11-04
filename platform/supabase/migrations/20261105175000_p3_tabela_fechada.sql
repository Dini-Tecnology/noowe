-- P3: as políticas genéricas de promotions deixavam a cozinha ler os cupons e o Gerente escrever direto, sem validar nem auditar.
drop policy authenticated_select_by_restaurant on public.promotions;
drop policy authenticated_insert_by_restaurant_manager on public.promotions;
drop policy authenticated_update_by_restaurant_manager on public.promotions;
drop policy authenticated_delete_by_restaurant_manager on public.promotions;
