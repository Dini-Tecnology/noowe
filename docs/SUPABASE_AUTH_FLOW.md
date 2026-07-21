# Supabase Auth Flow

Este projeto usa Supabase Auth como única camada de autenticação. Não há emissão de JWT próprio, guards NestJS, strategies Passport ou refresh token custom no fluxo atual.

## Fluxos

- Cadastro: `supabase.auth.signUp()` com `emailRedirectTo` para `/auth/callback` no site ou deep link Expo no mobile. Com confirmação de e-mail ativa, o usuário só recebe sessão após confirmar.
- Login: `supabase.auth.signInWithPassword()`.
- Logout: `supabase.auth.signOut()`.
- Recuperação de senha (web): `supabase.auth.resetPasswordForEmail()` redireciona para `/auth/reset-password`.
- Recuperação de senha (mobile): a Edge Function `register-with-resend` (action `password-reset`) gera um link de recuperação via `admin.generateLink({ type: 'recovery' })` e envia o e-mail com template NOOWE pela Resend. O link é um deep link direto do app (`<scheme>://auth/reset-password?token_hash=...&type=recovery`), sem passar por `/auth/v1/verify` no navegador. O app valida o `token_hash` com `verifyOtp({ token_hash, type: 'recovery' })`.
- Redefinição de senha: `supabase.auth.updateUser({ password })`.
- Sessão: clients usam `persistSession: true` e `autoRefreshToken: true`; o mobile também restaura a sessão Supabase no boot antes de abrir rotas protegidas.

## Perfil e Roles

A migration `platform/supabase/migrations/20260622120000_supabase_auth_roles_rls.sql` cria:

- `public.roles`: catálogo de roles (`customer`, `waiter`, `barman`, `chef`, `maitre`, `manager`, `owner`, `admin`).
- `public.profile_roles`: roles globais ou opcionais por restaurante.
- Trigger `on_auth_user_profile_sync` em `auth.users`: cria/atualiza `public.users`, `public.profiles` e atribui role global `customer` por padrão.
- `public.custom_access_token_hook(event jsonb)`: hook para expor `app_role`, `roles` e `restaurant_ids` no access token do Supabase.

Para ativar custom claims, configure no Dashboard Supabase:

`Authentication > Hooks > Custom Access Token` usando `public.custom_access_token_hook`.

## RLS

RLS é habilitado em todas as tabelas `public`. As policies principais são:

- Usuário lê/atualiza o próprio `profiles`.
- `admin` lê/atualiza perfis e lê painéis administrativos.
- `owner`/`manager` gerenciam roles do restaurante.
- Tabelas com `restaurant_id` ganham policies por staff do restaurante, com escrita restrita a `owner`/`manager` ou `admin`.
- Tabelas com `user_id`/`customer_id` ganham policies de dono da linha.
- Tabelas sensíveis sem policy explícita ficam inacessíveis via `anon`/`authenticated` apesar de RLS estar habilitado.

## Chaves

- Browser e mobile usam somente `VITE_SUPABASE_PUBLISHABLE_KEY`/`VITE_SUPABASE_ANON_KEY` ou `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` é permitido apenas em Edge Functions, jobs ou scripts server-side controlados.
- Nunca exponha `service_role` no Vite, Expo ou bundle client-side.
