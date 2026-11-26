-- O índice único e a FK de user_consents estavam só na migration que usou "create table if not exists" depois da tabela gerada,
-- e não chegaram ao banco. accept_legal_terms depende do índice para não duplicar o aceite.
create unique index if not exists uq_user_consents_active on public.user_consents (user_id, consent_type, version) where revoked_at is null;
alter table public.user_consents drop constraint if exists user_consents_user_id_fkey;
alter table public.user_consents add constraint user_consents_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
-- A tabela gerada exigia ip_address e não tinha default em accepted_at. O aceite vem da RPC, com a hora do banco; IP não é coletado.
alter table public.user_consents alter column ip_address drop not null, alter column accepted_at set default now();
