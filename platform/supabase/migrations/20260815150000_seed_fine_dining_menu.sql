-- Seeds a real (non-mocked) menu for the Fine Dining test restaurant "Atelier Noowe"
-- (id b1000000-0000-4000-8000-000000000001), covering entradas, pratos principais,
-- sobremesas and bebidas so the cardápio screen has production-like data to render.

do $$
declare
  v_restaurant_id uuid := 'b1000000-0000-4000-8000-000000000001';
  v_cat_entradas uuid;
  v_cat_principais uuid;
  v_cat_sobremesas uuid;
  v_cat_bebidas uuid;
begin
  if not exists (select 1 from public.restaurants where id = v_restaurant_id) then
    raise notice 'Restaurant % not found, skipping fine dining menu seed', v_restaurant_id;
    return;
  end if;

  if exists (select 1 from public.menu_categories where restaurant_id = v_restaurant_id) then
    raise notice 'Menu already seeded for restaurant %, skipping', v_restaurant_id;
    return;
  end if;

  insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
  values (v_restaurant_id, 'Entradas', 'Para abrir a experiência à mesa', 10, 'leaf-outline')
  returning id into v_cat_entradas;

  insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
  values (v_restaurant_id, 'Pratos Principais', 'Criações autorais do chef', 20, 'restaurant-outline')
  returning id into v_cat_principais;

  insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
  values (v_restaurant_id, 'Sobremesas', 'Finais doces e assinados', 30, 'ice-cream-outline')
  returning id into v_cat_sobremesas;

  insert into public.menu_categories (restaurant_id, name, description, display_order, icon)
  values (v_restaurant_id, 'Bebidas', 'Vinhos, coquetéis e não alcoólicos', 40, 'wine-outline')
  returning id into v_cat_bebidas;

  insert into public.menu_items
    (restaurant_id, category_id, name, description, price, course, preparation_time, estimated_prep_minutes, display_order, is_popular, dietary_info)
  values
    (v_restaurant_id, v_cat_entradas, 'Tartare de Atum com Gergelim', 'Atum fresco cortado à faca, molho de soja trufado e crocante de gergelim', 68.00, 'starter', 15, 15, 10, true, '["sem lactose"]'::jsonb),
    (v_restaurant_id, v_cat_entradas, 'Carpaccio de Filé Mignon', 'Lâminas finas de filé, alcaparras, lascas de parmesão e azeite trufado', 58.00, 'starter', 12, 12, 20, false, null),
    (v_restaurant_id, v_cat_entradas, 'Burrata Artesanal com Tomates Confit', 'Burrata cremosa, tomates confitados e pesto de manjericão', 52.00, 'starter', 10, 10, 30, false, '["vegetariano"]'::jsonb),
    (v_restaurant_id, v_cat_entradas, 'Vieiras Grelhadas ao Vinho Branco', 'Vieiras seladas, redução de vinho branco e purê de couve-flor', 74.00, 'starter', 18, 18, 40, false, null),

    (v_restaurant_id, v_cat_principais, 'Filé Mignon ao Molho Madeira', 'Medalhão grelhado, molho madeira, purê de batatas trufado e legumes salteados', 128.00, 'main', 25, 25, 10, true, null),
    (v_restaurant_id, v_cat_principais, 'Risoto de Funghi Porcini', 'Arbóreo cremoso, cogumelos porcini, parmesão envelhecido e trufa negra', 96.00, 'main', 22, 22, 20, true, '["vegetariano"]'::jsonb),
    (v_restaurant_id, v_cat_principais, 'Salmão Grelhado ao Molho de Maracujá', 'Filé de salmão selado, molho de maracujá e aspargos grelhados', 108.00, 'main', 20, 20, 30, false, '["sem glúten"]'::jsonb),
    (v_restaurant_id, v_cat_principais, 'Costela Bovina 12 Horas', 'Costela cozida lentamente, farofa crocante e polenta cremosa', 134.00, 'main', 30, 30, 40, false, null),
    (v_restaurant_id, v_cat_principais, 'Robalo em Crosta de Ervas', 'Robalo assado, crosta de ervas finas e legumes da estação', 116.00, 'main', 24, 24, 50, false, '["sem glúten"]'::jsonb),

    (v_restaurant_id, v_cat_sobremesas, 'Petit Gâteau com Sorvete de Baunilha', 'Bolo de chocolate meio amargo com centro derretido e sorvete artesanal', 42.00, 'dessert', 15, 15, 10, true, null),
    (v_restaurant_id, v_cat_sobremesas, 'Crème Brûlée de Baunilha Bourbon', 'Creme aveludado com crosta de açúcar caramelizada', 38.00, 'dessert', 10, 10, 20, false, '["sem glúten"]'::jsonb),
    (v_restaurant_id, v_cat_sobremesas, 'Tiramisù Clássico', 'Camadas de mascarpone, café espresso e cacau em pó', 40.00, 'dessert', 8, 8, 30, false, null),

    (v_restaurant_id, v_cat_bebidas, 'Malbec Reserva — Taça', 'Vinho tinto argentino, corpo encorpado e notas de frutas vermelhas', 48.00, 'drink', 3, 3, 10, true, null),
    (v_restaurant_id, v_cat_bebidas, 'Chardonnay — Taça', 'Vinho branco encorpado com notas amanteigadas', 44.00, 'drink', 3, 3, 20, false, null),
    (v_restaurant_id, v_cat_bebidas, 'Coquetel Old Fashioned', 'Bourbon, angostura, açúcar e casca de laranja', 38.00, 'drink', 5, 5, 30, false, null),
    (v_restaurant_id, v_cat_bebidas, 'Água com Gás 500ml', 'Água mineral com gás', 14.00, 'drink', 1, 1, 40, false, null),
    (v_restaurant_id, v_cat_bebidas, 'Suco Natural da Estação', 'Suco de fruta fresca preparado na hora', 22.00, 'drink', 5, 5, 50, false, '["vegano"]'::jsonb);
end $$;
