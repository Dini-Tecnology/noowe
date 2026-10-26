-- O papel anon herdava EXECUTE por privilégio padrão do Supabase; pagar a mesa exige usuário autenticado.
revoke all on function public.customer_pay_table_bill(uuid,numeric,text,numeric,text,uuid,uuid[]) from anon;
