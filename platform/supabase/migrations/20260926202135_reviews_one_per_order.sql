-- Uma avaliação por pedido. O RPC customer_create_review já checa antes de
-- inserir, mas a checagem sozinha tem janela de corrida (duplo toque, retry).
create unique index if not exists uq_reviews_user_order_active
  on public.reviews (user_id, order_id)
  where order_id is not null and deleted_at is null;
