# Revalidação LGPD — 26/11/2026

Revalida os 10 itens críticos de `docs/AUDITORIA-LGPD-CONFORMIDADE.md` (escrita para o backend antigo)
contra o código atual: apps `platform/mobile/apps/client` e `restaurant`, `platform/mobile/shared`,
`platform/supabase/migrations`, `platform/supabase/functions` e `site/`. Nada foi implementado aqui.
Isto é leitura de código; não é parecer jurídico.

| # | Item | Status |
|---|------|--------|
| 1 | Registro de aceite dos Termos (versão + data) | atende (26/11) |
| 2 | Verificação de idade (art. 14) | parcial |
| 3 | Portabilidade (art. 18, V) | atende |
| 4 | Opt-in explícito de marketing | atende |
| 5 | Antifraude (Termos §8-B) | parcial |
| 6 | Rotinas de retenção/eliminação | atende para contas excluídas (26/11); prazos por tabela pendentes |
| 7 | Banner de cookies no site | atende |
| 8 | Plano de resposta a incidentes | atende (26/11; nomes a preencher) |
| 9 | Limites da carteira digital (Termos §9.5) | atende (valores a conferir) |
| 10 | Anonimização antes de IA | não se aplica hoje |

## 1. Registro de aceite dos Termos — parcial
**Evidência:** a tabela `public.user_consents` (`consent_type`, `version`, `accepted_at`, `revoked_at`) existe em
`platform/supabase/migrations/20260620212500_auth_supabase_roles_context.sql` e é lida em `export_user_data`
(`20260710132000_lgpd_data_rights_rpc.sql`). Mas **nenhum código grava nela**. O cadastro
(`platform/mobile/shared/screens/auth/PhoneRegisterScreen.tsx` → `platform/mobile/shared/services/supabase-auth.ts`, cerca da l. 436)
só faz um `update` em `profiles` a partir do cliente, com `accepted_terms_version` / `accepted_privacy_version`. A data vira
`updated_at`, e cada edição de perfil a sobrescreve. Existe também `platform/mobile/shared/screens/legal/ReConsentScreen.tsx`.
**Falta:** uma RPC `security definer` que grave em `user_consents` (versão, `now()` do servidor, origem/app) a cada
aceite e re-aceite. O cliente não deve escrever versão nem data direto em `profiles`.
**Atualização 26/11 — atende:** `public.accept_legal_terms(terms, privacy)` (migration `20261126620000_lgpd_cpf_aceite_retencao.sql`,
índice/FK em `20261126620100_user_consents_unico.sql`) grava `terms_of_service` e `privacy_policy` com `now()` do banco.
`user_consents` ficou só leitura do próprio usuário (insert/update/delete revogados). O cadastro dos dois apps chama a RPC
(`shared/services/otp-auth.ts`) e não grava mais versão em `profiles`. Versão vigente em um lugar só, `shared/config/legal.ts`;
ao abrir o app, quem não aceitou a vigente vê `ReConsentScreen`, que também grava pela RPC. Testes: `tests/110_*.sql`,
`apps/client/src/__tests__/production.legalConsent.test.ts`. Origem/app e IP não são gravados.

## 2. Verificação de idade — parcial
**Evidência:** `PhoneRegisterScreen.tsx` tem `isAtLeast18()` e exige data de nascimento. `profiles.birth_date` é gravado
pelo cliente. Não achei nenhuma checagem no servidor (constraint, trigger ou RPC).
**Falta:** validar idade mínima no servidor ao gravar `birth_date`/concluir o cadastro, com o limite parametrizado. Também
falta decidir a política para menores: bloquear, ou pedir consentimento do responsável (art. 14).

## 3. Portabilidade — atende
**Evidência:** `public.export_user_data()` em `20260710132000_lgpd_data_rights_rpc.sql`, chamada por
`customerBackend.exportUserData()` (`apps/client/src/services/customer-backend.ts`) em
`apps/client/src/screens/production/PrivacyScreen.tsx`.
**Sugestão:** conferir se o JSON cobre as tabelas criadas depois de 07/2026 (carteira, cupons, fidelidade, convites,
notas fiscais).

## 4. Opt-in de marketing — atende
**Evidência:** `profiles.marketing_consent boolean not null default false` (migration 20260620212500). O cadastro
começa com `marketingConsent = false` (`PhoneRegisterScreen.tsx`) e mostra um opt-in separado.
**Sugestão:** registrar também em `user_consents` (item 1), para ter histórico do opt-in e da revogação.

## 5. Antifraude — parcial
**Evidência:** rate limit nas Edge Functions (`20260624121000_edge_function_rate_limits.sql`), QR assinado/validado
(`20260814090000_service_type_fixes_and_qr_security.sql`), idempotência de pedido e pagamento, `audit_log` das ações
sensíveis.
**Falta:** não existe regra de risco por usuário/cartão (velocidade, chargeback, bloqueio de conta), nem fila de revisão. O
que o §8-B dos Termos promete precisa ser confrontado com isso, ou o texto precisa ser ajustado.

## 6. Retenção/eliminação — parcial
**Evidência:** `request_account_deletion()` anonimiza o perfil na hora e agenda `deletion_scheduled_for = now() + 30 days`.
O próprio comentário da função diz que o purge físico depois da carência "needs a scheduled job, out of scope". Os jobs
`cron.schedule` que existem (fiscal, motor de eventos, NFS-e) não tratam de retenção.
**Falta:** um job pg_cron que execute o purge vencido (incluindo `auth.users`, tokens biométricos e push tokens), e
prazos de retenção por tabela (logs, convites, notificações) vindos de parâmetro, não de literal.
**Atualização 26/11 — atende para contas excluídas:** `private.purge_deleted_accounts()` roda no pg_cron `account-purge` (diário,
06:30 UTC). Carência em `private.noowe_company.account_deletion_grace_days` (30), usada também por `request_account_deletion`.
Conta sem registro financeiro/fiscal: `auth.users` apagado em cascata. Com registro: login desfeito (identities, sessões,
tokens, MFA), endereços, tokens biométricos/push, favoritos, notificações, cartões salvos, CPF guardado, avaliações, convites e
papéis apagados; perfil anônimo fica como referência de pedidos, pagamentos, notas, carteira, gorjetas, auditoria e
consentimentos. Teste em `tests/110_*.sql`. Continua pendente: prazos de retenção por tabela (logs, convites, notificações).

## 7. Banner de cookies — atende
**Evidência:** `site/src/components/CookieConsent.tsx` montado em `site/src/App.tsx`, com as opções "aceitar todos" e
"rejeitar não essenciais". Não achei script de analytics/tags em `site/`.
**Sugestão:** quando entrar algum analytics, carregar só depois do consentimento.

## 8. Plano de resposta a incidentes — não atende
**Evidência:** não há documento em `docs/` nem runbook. Os resultados para "incident" no código são tabelas geradas e a
simulação do site.
**Falta:** um documento com responsáveis (encarregado/DPO), canal, prazo de comunicação à ANPD e aos titulares, e um
playbook para vazamento por RLS ou Realtime.
**Atualização 26/11 — atende:** `docs/PLANO-RESPOSTA-INCIDENTES.md` (papéis, detecção, contenção, ANPD/titulares em 3 dias úteis,
registro por 5 anos, revisão). Falta preencher nome/e-mail do encarregado e o canal interno.

## 9. Limites da carteira — atende (valores a conferir)
**Evidência:** `20260928104000_wallet_transfer_by_username.sql` bloqueia acima de `daily_limit`, `monthly_limit` e
`max_balance` da carteira. A carteira está em `20260814233000_customer_wallet_backend.sql`.
**Falta:** conferir se os valores padrão batem com o §9.5 dos Termos e se recarga/pagamento (não só transferência)
respeitam os mesmos tetos.

## 10. Anonimização antes de IA — não se aplica hoje
**Evidência:** nenhuma Edge Function nem serviço chama provedor de IA (OpenAI etc.). Procurei em `platform/supabase/functions`,
`platform/mobile/shared/services` e `apps/*/src`. `apps/client/src/screens/ai/AIPairingAssistantScreen.tsx` não faz
chamada de rede.
**Falta (quando houver IA):** remover ou pseudonimizar dados pessoais no servidor antes do envio, e citar o provedor na
Política como operador/transferência internacional.
