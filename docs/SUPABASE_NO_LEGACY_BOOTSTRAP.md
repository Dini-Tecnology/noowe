# Supabase Bootstrap Sem Banco Legado

Guia para iniciar a operação no Supabase quando o banco antigo não está mais acessível.

## Objetivo

- Subir o ambiente operacional no Supabase sem importar dados históricos.
- Criar um usuário administrador inicial.
- Criar o primeiro restaurante e vínculo de papel `owner`.
- Preencher `app_metadata` para suportar JWT/RLS desde o primeiro login.

## Pré-requisitos

- Schema consolidado já aplicado no Supabase (migrations em `platform/supabase/migrations`).
- Tabelas `public.users` (espelho de `auth.users`, sincronizado por trigger), `profiles`, `restaurants` e `user_roles` existentes.
- Chave `service_role` disponível com segurança.

## Variáveis de ambiente

No shell, aponte para o projeto Supabase:

```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_SECRET_KEY="<secret-key>"

$env:BOOTSTRAP_ADMIN_EMAIL="owner@seu-dominio.com"
$env:BOOTSTRAP_ADMIN_PASSWORD="<senha-forte>"
$env:BOOTSTRAP_ADMIN_FULL_NAME="Owner Admin"

$env:BOOTSTRAP_RESTAURANT_NAME="Meu Restaurante"
$env:BOOTSTRAP_RESTAURANT_SERVICE_TYPE="restaurant"
$env:BOOTSTRAP_RESTAURANT_PHONE="+5511999999999"
$env:BOOTSTRAP_RESTAURANT_EMAIL="contato@seu-dominio.com"
$env:BOOTSTRAP_RESTAURANT_ADDRESS="Av. Principal, 100"
$env:BOOTSTRAP_RESTAURANT_CITY="Sao Paulo"
$env:BOOTSTRAP_RESTAURANT_STATE="SP"
$env:BOOTSTRAP_RESTAURANT_ZIP_CODE="01000-000"
```

## Execução

No backend:

```powershell
cd platform/backend
npm run supabase:bootstrap:no-legacy
```

O script (`src/scripts/supabase-bootstrap-no-legacy.ts`) executa:

1. Cria (ou reutiliza) usuário no `auth.users` (o trigger popula `public.users` quando a migration `20260427115000_public_users_auth_sync.sql` está aplicada).
2. Upsert em `profiles` com `id` igual ao `auth.users.id`.
3. Cria o primeiro `restaurant` para esse owner (ou reutiliza existente do mesmo owner).
4. Garante `user_roles` com `role = owner`.
5. Atualiza `app_metadata` com:
   - `roles: ["owner"]`
   - `restaurant_ids: ["<restaurant-id>"]`
   - `bootstrap: true`

## Pós-bootstrap (obrigatório)

- Fazer login com o usuário admin no app.
- Confirmar que o token JWT já contém `app_metadata.roles` e `app_metadata.restaurant_ids`.
- Rodar smoke tests:
  - login
  - listagem/edição do restaurante inicial
  - criação de pedido básico
  - alteração de status
- Revisar RLS para as tabelas de negócio antes de abrir acesso de clientes reais.

## Segurança

- Nunca usar `SUPABASE_SERVICE_ROLE_KEY` no mobile/frontend.
- A chave publishable (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) e para cliente, nao para rotas admin.
- O bootstrap usa chave de servidor: `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY` como compatibilidade).
- `public.users` e somente espelho de identidade: clientes autenticados podem ler linhas permitidas por RLS, mas nao devem inserir ou atualizar essa tabela diretamente.
- Não commitar senha de bootstrap nem chaves no repositório.
- Após validação, rotacionar a senha inicial do usuário owner.
