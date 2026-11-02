# NOOWE Platform — Checklist de Credenciais para Sprints 7-8
**Data:** 2026-04-03
**Status:** Sprints 1-6 completos. Sprints 7-8 bloqueados por credenciais externas.
**Responsavel:** Product Owner / CTO

---

## VISAO GERAL

A arquitetura de integracao esta 100% pronta:
- Adapters com interface definida (metodos, DTOs, error handling)
- Webhook controllers com validacao de assinatura implementada
- Retry logic e circuit breaker patterns prontos
- Testes unitarios com mocks prontos

**So falta:** substituir `[ADAPTER_STUB]` por chamadas HTTP reais com credenciais validas.

---

## SPRINT 7 — Credenciais Necessarias (Deadline: Semana 12)

### 1. ASAAS (Pagamentos — Cartao + PIX + Boleto)

| Item | O que fazer | URL | Status |
|------|------------|-----|--------|
| Criar conta sandbox | Acessar site, cadastrar como empresa | https://sandbox.asaas.com/register | [ ] |
| Obter API Key | Dashboard → Integrações → API Key | Apos registro | [ ] |
| Configurar webhook URL | Dashboard → Integrações → Webhooks → Adicionar | `https://SEU_DOMINIO/api/v1/payment-gateway/webhooks/asaas` | [ ] |
| Copiar webhook token | Gerado automaticamente ao criar webhook | Salvar como `ASAAS_WEBHOOK_TOKEN` | [ ] |
| Testar no sandbox | Criar cobranca teste com cartao 5162 3063 4911 9915 | Validar que webhook chega | [ ] |

**Variaveis .env a preencher:**
```
ASAAS_API_KEY=<api_key_do_sandbox>
ASAAS_WEBHOOK_TOKEN=<token_do_webhook>
ASAAS_ENVIRONMENT=sandbox
```

**Arquivos que serao alterados:**
- `backend/src/modules/payment-gateway/adapters/asaas/asaas.adapter.ts`
- `backend/src/modules/payment-gateway/adapters/asaas/asaas.pix.service.ts`

**Documentacao Asaas:**
- API Reference: https://docs.asaas.com/reference
- Webhooks: https://docs.asaas.com/docs/webhooks
- Sandbox cartoes teste: https://docs.asaas.com/docs/sandbox

---

### 2. FOCUS NFe (Emissao Fiscal — NFC-e) — ver ADR-030

| Item | O que fazer | URL | Status |
|------|------------|-----|--------|
| Criar conta homologacao | Contatar comercial Focus NFe | https://focusnfe.com.br/contato | [ ] |
| Cadastrar a empresa | Painel Focus → Empresa: certificado A1 e CSC ficam na Focus | Necessario certificado digital | [ ] |
| Obter token da empresa | Um token por ambiente (homologacao e producao) | Apos aprovacao | [ ] |
| Provisionar no NOOWE | Config > Fiscal no app, ou `service_fiscal_configure`: grava a configuracao e guarda o token no Vault | Ver `ACOES_HUMANAS_PUBLICACAO.md` 1.9 | [ ] |
| Testar emissao | Fechar uma conta em homologacao e ver a nota `authorized` em `fiscal_documents` | Validar numero e chave no recibo | [ ] |

**Nao ha variavel de ambiente nem webhook:** o token e por restaurante, no Vault, e a NFC-e e sincrona.

**Pre-requisito critico:** Certificado Digital A1 (formato .pfx/.p12)
- Emitido por AC credenciada (Certisign, Serasa, etc.)
- Valido (nao expirado)
- Pode ser o certificado da propria empresa para testes

**Codigo:** `platform/supabase/functions/_shared/fiscal/focus.ts`, `platform/supabase/functions/fiscal-emit/`

**Documentacao Focus NFe:** https://doc.focusnfe.com.br/reference/nfce

---

### 3. TWILIO ou AWS SNS (SMS/OTP para Login por Telefone)

#### Opcao A: Twilio (Recomendado — mais simples)

| Item | O que fazer | URL | Status |
|------|------------|-----|--------|
| Criar conta trial | Registrar com email | https://www.twilio.com/try-twilio | [ ] |
| Verificar numero | Twilio trial exige verificar numeros destino | Console → Verified Numbers | [ ] |
| Obter Account SID | Console → Account Info | Apos registro | [ ] |
| Obter Auth Token | Console → Account Info | Apos registro | [ ] |
| Comprar numero BR | Console → Phone Numbers → Buy (+55) | ~$1/mes para trial | [ ] |
| Testar envio SMS | Enviar SMS teste para numero verificado | Validar que chega | [ ] |

**Variaveis .env a preencher:**
```
TWILIO_ACCOUNT_SID=<account_sid>
TWILIO_AUTH_TOKEN=<auth_token>
TWILIO_PHONE_NUMBER=<+55XXXXXXXXXXX>
SMS_PROVIDER=twilio
```

#### Opcao B: AWS SNS (Se ja usa AWS)

| Item | O que fazer | URL | Status |
|------|------------|-----|--------|
| Criar IAM user com permissao SNS | IAM Console → Users → Add | AWS Console | [ ] |
| Configurar SNS para SMS | SNS Console → Text messaging → Sandbox | Solicitar saida do sandbox para producao | [ ] |
| Obter Access Key + Secret | IAM → User → Security Credentials | Apos criar user | [ ] |

**Variaveis .env:**
```
AWS_SNS_ACCESS_KEY=<access_key>
AWS_SNS_SECRET_KEY=<secret_key>
AWS_SNS_REGION=us-east-1
SMS_PROVIDER=aws_sns
```

**Arquivo que sera alterado:**
- `backend/src/modules/auth/services/auth.service.ts` (substituir NotImplementedException)
- Possivelmente criar `backend/src/modules/auth/services/sms.service.ts`

---

## SPRINT 8 — Credenciais Necessarias (Deadline: Semana 14)

### 4. STRIPE TERMINAL (Tap to Pay — Pagamento Presencial)

| Item | O que fazer | URL | Status |
|------|------------|-----|--------|
| Criar conta Stripe | Registrar como empresa | https://dashboard.stripe.com/register | [ ] |
| Ativar Terminal | Dashboard → Terminal → Get Started | Requer aprovacao | [ ] |
| Obter Secret Key (test) | Dashboard → Developers → API Keys → sk_test_* | Apos registro | [ ] |
| Obter Publishable Key | Dashboard → Developers → API Keys → pk_test_* | Apos registro | [ ] |
| Configurar webhook | Dashboard → Developers → Webhooks → Add endpoint | `https://SEU_DOMINIO/api/v1/payment-gateway/webhooks/stripe` | [ ] |
| Obter webhook secret | Gerado ao criar endpoint (whsec_*) | Salvar como `STRIPE_WEBHOOK_SECRET` | [ ] |
| Solicitar Apple entitlement | Developer.apple.com → Entitlements → Tap to Pay | Requer aprovacao Apple (~2-4 semanas) | [ ] |
| Registrar location | API: POST /v1/terminal/locations | Necessario para readers | [ ] |

**Variaveis .env:**
```
STRIPE_SECRET_KEY=<sk_test_xxx>
STRIPE_PUBLISHABLE_KEY=<pk_test_xxx>
STRIPE_WEBHOOK_SECRET=<whsec_xxx>
STRIPE_TERMINAL_LOCATION_ID=<tml_xxx>
```

**ATENCAO:** Apple Tap to Pay entitlement leva 2-4 semanas. Solicitar ANTES do Sprint 8.

**Arquivo que sera alterado:**
- `backend/src/modules/payment-gateway/adapters/stripe-terminal/stripe-terminal.adapter.ts`

---

### 5. iFOOD (Integracao Delivery)

| Item | O que fazer | URL | Status |
|------|------------|-----|--------|
| Cadastrar como parceiro | Portal do Parceiro iFood | https://portal.ifood.com.br | [ ] |
| Solicitar acesso API | Portal → Integrações → API | Requer aprovacao (~1-2 semanas) | [ ] |
| Obter Client ID | Portal → Integrações → Credenciais | Apos aprovacao | [ ] |
| Obter Client Secret | Portal → Integrações → Credenciais | Apos aprovacao | [ ] |
| Configurar webhook URL | Portal → Integrações → Webhooks | `https://SEU_DOMINIO/api/v1/integrations/webhooks/ifood/orders` | [ ] |
| Configurar IP whitelist | Portal → Integrações → IPs permitidos | IP do servidor backend | [ ] |
| Vincular restaurante teste | Portal → Restaurantes → Vincular | Necessario merchant_id | [ ] |

**Variaveis .env:**
```
IFOOD_CLIENT_ID=<client_id>
IFOOD_CLIENT_SECRET=<client_secret>
IFOOD_MERCHANT_ID=<merchant_id>
IFOOD_ENVIRONMENT=sandbox
```

**Arquivo que sera alterado:**
- `backend/src/modules/integrations/platforms/ifood/ifood.adapter.ts`

---

### 6. RAPPI (Integracao Delivery)

| Item | O que fazer | URL | Status |
|------|------------|-----|--------|
| Cadastrar como parceiro | Contatar representante Rappi | https://partners.rappi.com | [ ] |
| Solicitar acesso API | Via representante comercial | Email para integracao@rappi.com | [ ] |
| Obter API Key | Fornecido pelo time de integracao | Apos aprovacao | [ ] |
| Obter Store ID | Fornecido pelo time de integracao | Identificador da loja | [ ] |
| Configurar webhook | Via time de integracao Rappi | Fornecer URL do webhook | [ ] |

**Variaveis .env:**
```
RAPPI_API_KEY=<api_key>
RAPPI_STORE_ID=<store_id>
RAPPI_ENVIRONMENT=sandbox
```

**Arquivo que sera alterado:**
- `backend/src/modules/integrations/platforms/rappi/rappi.adapter.ts`

**Nota:** Rappi tem processo mais manual. Iniciar contato com 4+ semanas de antecedencia.

---

### 7. UBER EATS (Integracao Delivery)

| Item | O que fazer | URL | Status |
|------|------------|-----|--------|
| Cadastrar no Uber Developer | Criar app no Uber Developer Portal | https://developer.uber.com | [ ] |
| Solicitar acesso Eats API | Portal → My Apps → Eats API | Requer aprovacao | [ ] |
| Obter Client ID | Portal → App → Credentials | Apos aprovacao | [ ] |
| Obter Client Secret | Portal → App → Credentials | Apos aprovacao | [ ] |
| Configurar webhook | Portal → Webhooks → Add | `https://SEU_DOMINIO/api/v1/integrations/webhooks/ubereats/orders` | [ ] |
| Vincular restaurante | Portal → Stores → Link | Necessario store_id | [ ] |

**Variaveis .env:**
```
UBEREATS_CLIENT_ID=<client_id>
UBEREATS_CLIENT_SECRET=<client_secret>
UBEREATS_STORE_ID=<store_id>
UBEREATS_ENVIRONMENT=sandbox
```

**Arquivo que sera alterado:**
- `backend/src/modules/integrations/platforms/ubereats/ubereats.adapter.ts`

---

### 8. FIREBASE (Push Notifications via FCM)

| Item | O que fazer | URL | Status |
|------|------------|-----|--------|
| Criar projeto Firebase | Firebase Console → Add Project | https://console.firebase.google.com | [ ] |
| Registrar app Android | Project Settings → Add App → Android | Package: com.noowe.client / com.noowe.restaurant | [ ] |
| Registrar app iOS | Project Settings → Add App → iOS | Bundle ID do app | [ ] |
| Baixar google-services.json | Project Settings → Android app → Download | Colocar em `mobile/apps/*/` | [ ] |
| Baixar GoogleService-Info.plist | Project Settings → iOS app → Download | Colocar em `mobile/apps/*/ios/` | [ ] |
| Obter Server Key (FCM) | Project Settings → Cloud Messaging → Server Key | Ou usar service account JSON | [ ] |
| Configurar APNs (iOS) | Project Settings → Cloud Messaging → Apple app → Upload APNs key (.p8) | Requer Apple Developer account | [ ] |
| Testar push em device | Enviar push teste via Console | Validar que chega | [ ] |

**Variaveis .env:**
```
FCM_PROJECT_ID=<project_id>
FCM_SERVER_KEY=<server_key>
# OU para v2 API:
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**Arquivos que serao criados/alterados:**
- `mobile/apps/client/google-services.json` (novo)
- `mobile/apps/restaurant/google-services.json` (novo)
- `mobile/apps/client/ios/GoogleService-Info.plist` (novo)
- `mobile/apps/restaurant/ios/GoogleService-Info.plist` (novo)
- `backend/src/modules/notifications/push-notification.service.ts` (novo ou existente)

**ATENCAO:** APNs key (.p8) requer Apple Developer Program ($99/ano). Solicitar ANTES.

---

## TIMELINE SUGERIDA

```
Semana 10 (AGORA):
  [ ] Iniciar cadastro Asaas sandbox
  [ ] Iniciar contato Focus NFe
  [ ] Criar conta Twilio trial
  [ ] Criar projeto Firebase
  [ ] Solicitar Apple Tap to Pay entitlement (2-4 sem lead time)
  [ ] Iniciar contato Rappi (4+ sem lead time)

Semana 11:
  [ ] Completar setup Asaas (API key + webhook)
  [ ] Completar setup Twilio (SID + token + numero)
  [ ] Completar setup Firebase (google-services.json + APNs)

Semana 12 (Inicio Sprint 7):
  [ ] Asaas API key disponivel → implementar adapter real
  [ ] Focus NFe token disponivel → validar o adapter em homologacao
  [ ] Twilio/SNS credenciais → implementar phone auth
  [ ] Testar fluxo completo: pagamento → NFC-e → notificacao

Semana 13:
  [ ] Solicitar acesso APIs iFood e UberEats
  [ ] Completar setup Stripe Terminal
  [ ] Apple entitlement esperado (solicitado semana 10)

Semana 14 (Inicio Sprint 8):
  [ ] Stripe Terminal credenciais → implementar adapter real
  [ ] iFood credenciais → implementar adapter real
  [ ] Rappi credenciais → implementar adapter real
  [ ] UberEats credenciais → implementar adapter real
  [ ] Firebase completo → implementar push real
  [ ] Regression test completo

Semana 16 (Fim Sprint 8):
  [ ] Todos os adapters funcionals em sandbox
  [ ] Todos os testes end-to-end passando
  [ ] Ready for staging deployment
```

---

## RESUMO POR PROVIDER

| Provider | Sprint | Tipo | Lead Time | Custo Sandbox | Prioridade |
|----------|--------|------|-----------|---------------|------------|
| **Asaas** | 7 | Pagamentos | 1 dia | Gratis | 🔴 Critico |
| **Focus NFe** | 7 | Fiscal | 3-5 dias | Gratis (homologacao) | 🔴 Critico |
| **Twilio** | 7 | SMS/OTP | 1 dia | $1/mes trial | 🔴 Critico |
| **Stripe Terminal** | 8 | Tap to Pay | 1-2 dias + Apple 2-4 sem | Gratis (test mode) | 🟡 Alto |
| **Firebase** | 8 | Push | 1 dia | Gratis (Spark plan) | 🟡 Alto |
| **iFood** | 8 | Delivery | 1-2 semanas | Gratis (sandbox) | 🟡 Alto |
| **Rappi** | 8 | Delivery | 4+ semanas | Gratis (sandbox) | 🟡 Alto |
| **UberEats** | 8 | Delivery | 1-2 semanas | Gratis (sandbox) | 🟡 Alto |

---

## QUANDO CREDENCIAIS ESTIVEREM PRONTAS

Para cada provider, o processo de implementacao e:

1. **Adicionar credenciais ao .env** (nao commitar — .env esta no .gitignore)
2. **Abrir o adapter stub** (marcado com `[ADAPTER_STUB]`)
3. **Substituir cada metodo stub** por chamada HTTP real usando as credenciais
4. **Rodar os testes** (mocks ja existem em *.spec.ts)
5. **Testar end-to-end** no sandbox do provider
6. **Commitar** com mensagem descritiva

A arquitetura (DTOs, interfaces, webhook handlers, error handling, retry logic) ja esta 100% implementada. O trabalho restante e puramente "conectar os fios" com credenciais reais.

---

## CONTATOS UTEIS

| Provider | Suporte | Email | Telefone |
|----------|---------|-------|----------|
| Asaas | Chat no dashboard | suporte@asaas.com | (47) 3028-5888 |
| Focus NFe | Chat/Email | suporte@focusnfe.com.br | (48) 3024-6001 |
| Twilio | Console + Docs | - | - |
| Stripe | Dashboard chat | - | - |
| iFood | Portal do Parceiro | integracao@ifood.com.br | - |
| Rappi | Via representante | integracao@rappi.com | - |
| UberEats | Developer portal | - | - |
| Firebase | Google Cloud support | - | - |
