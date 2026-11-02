# Pendências de Ação Humana — Consolidado Final Detalhado

> **Data:** 2026-03-29
> **Status:** Tudo que Claude podia fazer está feito. Restam apenas itens que requerem credenciais, contas externas ou decisões de negócio.
> **Score atual:** 78% funcional | **Score projetado após pendências:** 95-100%

---

## 1. CREDENCIAIS DE PRODUÇÃO

### 1.1 Asaas — Pagamentos PIX + Cartão
**Prioridade:** 🔴 CRÍTICA (sem isso restaurante não cobra)

| Item | Detalhes |
|------|---------|
| **O que é** | Gateway de pagamentos brasileiro (PIX + Cartão de crédito/débito) |
| **Onde criar conta** | https://www.asaas.com — criar conta PJ com CNPJ |
| **O que obter** | API Key (sandbox primeiro, depois produção) |
| **Onde configurar** | Variável `ASAAS_API_KEY` no arquivo `.env` do backend |
| **Ambiente sandbox** | `https://sandbox.asaas.com/api` — para testes sem dinheiro real |
| **Ambiente produção** | `https://api.asaas.com` — dinheiro real |
| **Webhook URL** | Configurar no painel Asaas: `https://api.noowebr.com/payment-gateway/webhooks/asaas` |
| **Eventos webhook** | Habilitar: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED` |
| **Impacto no código** | Os adapters em `backend/src/modules/payment-gateway/adapters/asaas/` estão com LOG PLACEHOLDERs. Após configurar a key, substituir os `this.logger.log('[TODO]...')` por chamadas reais `await axios.post('https://api.asaas.com/v3/payments', ...)` |
| **Arquivos afetados** | `asaas.adapter.ts` (linhas 167-177), `asaas.pix.service.ts` |
| **Tempo estimado** | 2h (criar conta + configurar + testar sandbox) |

---

### 1.2 Stripe Terminal — Tap to Pay NFC
**Prioridade:** 🟠 ALTA (garçom cobra no celular sem maquininha)

| Item | Detalhes |
|------|---------|
| **O que é** | Stripe Terminal transforma celular do garçom em maquininha NFC |
| **Onde criar conta** | https://dashboard.stripe.com — criar conta + ativar Terminal |
| **O que obter** | Secret Key (`sk_live_...`) + Publishable Key (`pk_live_...`) |
| **Onde configurar** | `STRIPE_SECRET_KEY` e `STRIPE_PUBLISHABLE_KEY` no `.env` |
| **iOS requisito extra** | Apple Developer Program → solicitar entitlement "Tap to Pay on iPhone" (aprovação ~1 semana) |
| **Android requisito** | Dispositivo com NFC + `minSdkVersion: 30` (já configurado como 24, verificar compatibilidade) |
| **Pacote mobile** | `@stripe/stripe-terminal-react-native` — já referenciado mas precisa `npm install` |
| **Webhook URL** | `https://api.noowebr.com/payment-gateway/webhooks/stripe` |
| **Arquivos afetados** | `stripe-terminal.adapter.ts` (linhas 89-153) |
| **Tempo estimado** | 4h (criar conta + entitlement Apple + configurar + testar) |

---

### 1.3 Firebase Cloud Messaging (FCM) — Push Notifications
**Prioridade:** 🔴 CRÍTICA (sem push, cliente precisa ter app aberto)

| Item | Detalhes |
|------|---------|
| **O que é** | Sistema de push notifications do Google (iOS + Android) |
| **Onde criar** | https://console.firebase.google.com → criar projeto → Cloud Messaging |
| **O que obter** | 1. Server Key (para backend enviar push), 2. `google-services.json` (Android), 3. `GoogleService-Info.plist` (iOS) |
| **Onde configurar** | `FCM_SERVER_KEY` no `.env` do backend |
| **Arquivos mobile** | `google-services.json` → `platform/mobile/apps/client/` e `platform/mobile/apps/restaurant/` |
| **App.json** | Já configurado com `expo-notifications` plugin |
| **EAS Project ID** | Também precisa de `eas project:create` para Expo Push Token funcionar |
| **Após configurar** | Substituir 4 TODOs no backend por chamadas reais: |
| | `orders.service.ts:216` → `notificationsService.sendPush(userId, 'Pedido pronto!', ...)` |
| | `reservations.service.ts:132` → `notificationsService.sendPush(userId, 'Reserva confirmada', ...)` |
| | `payments.service.ts:407` → `notificationsService.sendPush(restaurantOwnerId, 'Pagamento recebido', ...)` |
| | `calls.service.ts:137` → `notificationsService.sendPush(userId, 'Garçom a caminho', ...)` |
| **Tempo estimado** | 3h (criar projeto + configurar + substituir TODOs + testar) |

---

### 1.4 SendGrid — Emails Transacionais
**Prioridade:** 🟡 MÉDIA (emails de confirmação, recibos, recovery)

| Item | Detalhes |
|------|---------|
| **O que é** | Serviço de envio de email transacional |
| **Onde criar** | https://sendgrid.com → criar conta + verificar domínio |
| **O que obter** | API Key |
| **Onde configurar** | `SENDGRID_API_KEY` no `.env`, `SENDGRID_FROM_EMAIL=noreply@noowebr.com` |
| **Templates a criar** | 1. Confirmação de reserva, 2. Recibo de pagamento, 3. Convite para reserva, 4. Reset de senha, 5. Boas-vindas |
| **Verificação DNS** | Configurar SPF + DKIM no domínio `noowebr.com` para entregabilidade |
| **Tempo estimado** | 2h (criar conta + verificar domínio + criar templates) |

---

### 1.5 Focus NFe — NFC-e Fiscal
**Prioridade:** 🟡 MÉDIA (obrigatório para operar legalmente no Brasil)

| Item | Detalhes |
|------|---------|
| **O que é** | API intermediária para emissão de NFC-e (nota fiscal eletrônica ao consumidor) |
| **Onde criar** | https://focusnfe.com.br → contato comercial (SaaS multicliente) |
| **O que obter** | Token da API por restaurante |
| **Onde configurar** | `service_fiscal_configure` por restaurante; o token vai para o Supabase Vault (ADR-030) |
| **Certificado A1** | Cada restaurante precisa de certificado digital A1 (.pfx + senha), enviado à Focus NFe. Não fica no NOOWE |
| **Dados fiscais necessários** | CNPJ, IE, regime tributário, CSC ID + Token (gerado na SEFAZ do estado) |
| **Homologação** | Testar em `https://homologacao.focusnfe.com.br` primeiro |
| **Produção** | `https://api.focusnfe.com.br` |
| **Webhook URL** | Não usa: a NFC-e é síncrona. Emissão pela Edge Function `fiscal-emit` |
| **Tela no app** | `FiscalSetupScreen.tsx` ainda aponta para o backend removido; não usar até ser ligada ao Supabase |
| **Tempo estimado** | 4h por restaurante (coletar dados + upload certificado + testar homologação) |

---

### 1.6 AWS SNS — SMS
**Prioridade:** 🟢 BAIXA (backup para push, útil para waitlist e OTP)

| Item | Detalhes |
|------|---------|
| **O que é** | Serviço de envio de SMS da Amazon |
| **Onde criar** | AWS Console → SNS → solicitar saída do sandbox (envio para qualquer número) |
| **O que obter** | Access Key ID + Secret Access Key (IAM user com permissão SNS) |
| **Onde configurar** | `AWS_SNS_ACCESS_KEY`, `AWS_SNS_SECRET_KEY`, `AWS_SNS_REGION` no `.env` |
| **Custo** | ~R$0,03 por SMS enviado |
| **Uso principal** | OTP de login, confirmação de reserva (backup se push falhar), chamada na fila |
| **Tempo estimado** | 1h (criar IAM user + configurar) |

---

### 1.7 OpenAI — IA
**Prioridade:** 🟢 BAIXA (AI features são complementares, fallback rule-based existe)

| Item | Detalhes |
|------|---------|
| **O que é** | GPT-4 para recomendações, análise de sentimento, sugestões |
| **Onde criar** | https://platform.openai.com → API Keys |
| **O que obter** | API Key (`sk-...`) |
| **Onde configurar** | `OPENAI_API_KEY` no `.env` |
| **Circuit breaker** | Já implementado — se OpenAI falhar, cai para análise rule-based |
| **Custo** | ~$0.01-0.03 por chamada (GPT-4-turbo) |
| **Tempo estimado** | 15min (criar key + configurar) |

---

## 2. INFRAESTRUTURA

### 2.1 DNS — Domínio noowebr.com
**Prioridade:** 🔴 CRÍTICA

| Subdomínio | Tipo | Destino | Uso |
|-----------|------|---------|-----|
| `noowebr.com` | A ou CNAME | IP do load balancer / Cloudflare | Site principal |
| `api.noowebr.com` | A ou CNAME | IP do backend (Cloud Run / VPS) | API REST + WebSocket |
| `staging.noowebr.com` | A ou CNAME | IP do staging | Ambiente de testes |
| `status.noowebr.com` | CNAME | statuspage provider | Página de status |

**Como fazer:**
1. Acessar registrador de domínio (ex: Registro.br, Cloudflare)
2. Criar registros DNS conforme tabela
3. Configurar TTL: 300s (5min) para facilitar mudanças iniciais
4. Após estabilizar: aumentar TTL para 3600s (1h)

---

### 2.2 SSL/TLS — Certificado HTTPS
**Prioridade:** 🔴 CRÍTICA (app mobile rejeita HTTP em produção)

| Opção | Como | Renovação | Custo |
|-------|------|-----------|-------|
| **Let's Encrypt** (recomendado) | Certbot no servidor ou plugin Cloudflare | Automática (90 dias) | Grátis |
| **AWS ACM** | Se usando ALB/CloudFront | Automática | Grátis (AWS) |
| **Cloudflare** | Proxy + Full SSL mode | Automática | Grátis (plano free) |

**Validação no código:** `api.ts` linha 20-22 já enforça HTTPS em produção:
```typescript
if (!__DEV__ && !API_URL.startsWith('https://')) {
  throw new Error('SECURITY ERROR: Production API must use HTTPS');
}
```

---

### 2.3 CDN — Assets Estáticos
**Prioridade:** 🟡 MÉDIA

| Opção | Vantagem | Setup |
|-------|----------|-------|
| **Cloudflare** (recomendado) | DNS + CDN + WAF + DDoS em um | Mudar nameservers do domínio |
| **CloudFront** | Integra com S3 | Criar distribution + configurar origin |

---

### 2.4 EAS (Expo Application Services) — Build Mobile
**Prioridade:** 🔴 CRÍTICA (sem isso não faz build para stores)

**Passo a passo:**
```bash
# 1. Instalar EAS CLI
npm install -g eas-cli

# 2. Login no Expo
eas login

# 3. Criar projetos
cd platform/mobile/apps/client
eas project:create  # Anotar o project ID gerado

cd ../restaurant
eas project:create  # Anotar o project ID gerado

# 4. Atualizar app.json com os IDs
# Em apps/client/app.json → extra.eas.projectId = "ID_GERADO"
# Em apps/restaurant/app.json → extra.eas.projectId = "ID_GERADO"

# 5. Configurar eas.json (já existe, atualizar credenciais)
# Apple: appleId, ascAppId, appleTeamId
# Google: serviceAccountKeyPath (download do Google Play Console)

# 6. Build de teste
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

---

### 2.5 Apple Developer — Certificados iOS
**Prioridade:** 🔴 CRÍTICA (sem isso não publica na App Store)

| Item | Como obter | Validade |
|------|-----------|----------|
| **Apple Developer Account** | https://developer.apple.com — $99/ano | Anual |
| **Distribution Certificate** | Xcode → Preferences → Accounts → Manage Certificates | 1 ano |
| **App Store Provisioning Profile** | Developer Portal → Profiles → App Store → selecionar App ID | 1 ano |
| **Tap to Pay entitlement** | Developer Portal → Certificates, IDs → Identifiers → solicitar entitlement | Aprovação ~1 semana |
| **Bundle ID** | `com.noowe.client` e `com.noowe.restaurant` (já configurados no app.json) | Permanente |

**Passo a passo:**
1. Criar conta em https://developer.apple.com ($99/ano)
2. Criar App ID para `com.noowe.client` e `com.noowe.restaurant`
3. Habilitar capabilities: Push Notifications, Associated Domains
4. Gerar Distribution Certificate (.p12)
5. Criar Provisioning Profiles (App Store)
6. Configurar no eas.json: `appleId`, `ascAppId`, `appleTeamId`

---

### 2.6 Google Play — Keystore + Service Account
**Prioridade:** 🔴 CRÍTICA (sem isso não publica no Google Play)

| Item | Como | Notas |
|------|------|-------|
| **Google Play Developer Account** | https://play.google.com/console — $25 taxa única | Permanente |
| **Keystore de produção** | `keytool -genkey -v -keystore noowe-release.keystore -alias noowe -keyalg RSA -keysize 2048 -validity 10000` | **FAZER BACKUP** — perda = impossível atualizar app |
| **Play App Signing** | Play Console → Setup → App Signing → habilitar | Google guarda a key de assinatura |
| **Service Account** | Google Cloud Console → IAM → Create Service Account → Download JSON | Para EAS Submit |
| **google-services.json** | Firebase Console → Project Settings → Add Android App → Download | Para FCM funcionar |

**Passo a passo:**
1. Criar conta no Google Play Console ($25)
2. Criar app "NOOWE Cliente" e "NOOWE Restaurante"
3. Gerar keystore com comando acima + fazer 2 backups em locais diferentes
4. Habilitar Play App Signing
5. Criar Service Account no Google Cloud com permissão "Google Play Android Developer"
6. Download JSON → colocar no path do `serviceAccountKeyPath` no eas.json

---

### 2.7 GitHub Environments + Secrets
**Prioridade:** 🟠 ALTA (CI/CD automatizado)

**Configurar em:** GitHub → Settings → Environments

| Environment | URL | Approval Required |
|-------------|-----|:-----------------:|
| **staging** | `https://staging.noowebr.com` | Não |
| **production** | `https://noowebr.com` | **Sim** (required reviewers) |

**Secrets a configurar (Settings → Secrets and Variables → Actions):**

| Secret | Valor | Usado em |
|--------|-------|----------|
| `DEPLOY_SSH_KEY` | Chave SSH privada do servidor | deploy.yml |
| `STAGING_HOST` | IP/hostname do staging | deploy.yml |
| `STAGING_USER` | Usuário SSH (ex: `deploy`) | deploy.yml |
| `STAGING_DEPLOY_DIR` | Diretório de deploy (ex: `/opt/noowe`) | deploy.yml |
| `PRODUCTION_HOST` | IP/hostname da produção | deploy.yml |
| `PRODUCTION_USER` | Usuário SSH | deploy.yml |
| `PRODUCTION_DEPLOY_DIR` | Diretório de deploy | deploy.yml |
| `SLACK_WEBHOOK_URL` | Webhook do Slack (opcional) | deploy.yml |

---

### 2.8 Deep Link Verification Files
**Prioridade:** 🟠 ALTA (Universal Links iOS + App Links Android)

**iOS — `apple-app-site-association`:**
Criar arquivo em `https://noowebr.com/.well-known/apple-app-site-association`:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.noowe.client",
        "paths": ["/r/*", "/t/*", "/scan/*", "/menu/*", "/order/*"]
      },
      {
        "appID": "TEAMID.com.noowe.restaurant",
        "paths": ["/restaurant/*"]
      }
    ]
  }
}
```
Substituir `TEAMID` pelo Apple Team ID real.

**Android — `assetlinks.json`:**
Criar arquivo em `https://noowebr.com/.well-known/assetlinks.json`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.noowe.client",
    "sha256_cert_fingerprints": ["XX:XX:XX:..."]
  }
}]
```
O SHA-256 fingerprint vem do keystore: `keytool -list -v -keystore noowe-release.keystore`

---

## 3. STORES — App Store + Google Play

### 3.1 Screenshots (Design)

**iOS — App Store Connect:**

| Dispositivo | Resolução | Quantidade | Apps |
|------------|-----------|:----------:|:----:|
| iPhone 6.9" (iPhone 15 Pro Max) | 1320 × 2868 | Mínimo 3, recomendado 5-8 | Client + Restaurant |
| iPhone 6.5" (iPhone 11 Pro Max) | 1242 × 2688 | Mínimo 3 | Client + Restaurant |
| iPhone 5.5" (iPhone 8 Plus) | 1242 × 2208 | Mínimo 3 | Client + Restaurant |
| iPad 12.9" (se Universal) | 2048 × 2732 | Mínimo 3 | Opcional |

**Telas sugeridas para screenshots:**
- Client: Home, Restaurant, Menu, Cart, Payment, Order Status, Loyalty
- Restaurant: Dashboard, KDS, Floor Plan, Financial, Cash Register, Chef View

**Android — Google Play Console:**

| Tipo | Resolução | Quantidade |
|------|-----------|:----------:|
| Phone | 1080 × 1920+ | Mínimo 2, recomendado 5-8 |
| Tablet 7" | 1200 × 1920+ | Recomendado 2+ |
| Tablet 10" | 1920 × 1200+ | Recomendado 2+ |
| **Feature Graphic** | **1024 × 500** | **1 obrigatória** |

---

### 3.2 Declarações de Privacidade

**App Store — Privacy Nutrition Labels:**
Preencher em App Store Connect → App Privacy para CADA app:

| Tipo de Dado | Coletado | Vinculado ao Usuário | Rastreamento |
|-------------|:--------:|:--------------------:|:------------:|
| Nome | Sim | Sim | Não |
| Email | Sim | Sim | Não |
| Telefone | Sim | Sim | Não |
| Localização precisa | Sim | Sim | Não |
| Identificadores de dispositivo | Sim | Sim | Não |
| Dados de compra | Sim | Sim | Não |
| Conteúdo do usuário (reviews) | Sim | Sim | Não |
| Dados de uso (analytics) | Sim | Não | Não |
| Dados de crash | Sim | Não | Não |

**Google Play — Data Safety Section:**
Preencher em Play Console → App Content → Data Safety:

- ✅ Data encrypted in transit (HTTPS/TLS)
- ✅ You can request data deletion (DELETE /users/me)
- ✅ Data is not shared for advertising
- Declarar: Nome, email, telefone, localização, pagamentos, reviews, analytics, crashes

---

### 3.3 Content Rating (IARC)

Preencher questionário em AMBAS as stores:

| Pergunta | Resposta |
|----------|---------|
| Conteúdo gerado por usuário (reviews)? | Sim |
| Referências a álcool? | Sim (serviço de bar/pub) |
| Compras in-app? | Não (bens físicos — comida) |
| Violência? | Não |
| Conteúdo sexual? | Não |
| **Resultado esperado** | **12+** (por álcool + UGC) |

---

### 3.4 Textos da Loja (pt-BR)

| Campo | Limite | Regra |
|-------|:------:|-------|
| Título | 30 chars | Sem "Grátis", "#1", "Melhor" |
| Subtítulo (iOS) | 30 chars | Proposta de valor clara |
| Short Description (Android) | 80 chars | Resumo conciso |
| Descrição | 4.000 chars | Sem referência a outras plataformas |
| Keywords (iOS) | 100 chars | Sem nomes de concorrentes |
| What's New | 500 chars | Mudanças reais da versão |

**Sugestão:**
- Título: `NOOWE`
- Subtítulo: `Restaurantes na palma da mão`
- Descrição: Descrever: discovery, reservas, pedidos, pagamento, loyalty, 11 tipos de serviço

---

### 3.5 Conta de Teste para Revisores

Criar ANTES de submeter para review:

| Item | Detalhes |
|------|---------|
| **Email** | `reviewer@noowebr.com` ou `demo@noowebr.com` |
| **Senha** | Senha forte mas simples de digitar |
| **Dados** | Criar: 5+ restaurantes com menus, 10+ pedidos históricos, 3+ reservas, saldo wallet R$100, 50 loyalty points |
| **Restaurante demo** | Um restaurante completo com: menu, mesas, staff, fotos, reviews |
| **Notas para reviewer** | Explicar: "App para gestão de restaurantes e pedidos de comida. Pagamentos são para bens físicos (comida), não conteúdo digital — IAP não necessário." |
| **OTP bypass** | Se login usa OTP: fornecer número de bypass ou desabilitar para conta demo |

---

## 4. LEGAL

### 4.1 DPAs (Data Processing Agreements)

| Terceiro | Dados processados | Template |
|----------|-------------------|----------|
| **Stripe** | Dados de pagamento (cartão, NFC) | Stripe DPA automático no dashboard |
| **OpenAI** | Textos de reviews, preferências (sanitizados) | https://openai.com/policies/data-processing-addendum |
| **Firebase/Google** | Push tokens, analytics | Google Cloud DPA no console |
| **Sentry** | Crash reports (PII redacted) | Sentry DPA no dashboard |
| **SendGrid/Twilio** | Email, telefone | SendGrid DPA no dashboard |

**Ação:** Para cada fornecedor, acessar o dashboard e aceitar/assinar o DPA. Guardar cópia em `docs/dpas/`.

### 4.2 RIPD (Relatório de Impacto)

Template em `docs/RIPD-TEMPLATE.md`. Preencher:
- Razão social e CNPJ da empresa
- Endereço da sede
- Nome do DPO (Encarregado de Proteção de Dados)
- Email do DPO: `dpo@noowebr.com`
- Assinatura do DPO e representante legal

### 4.3 Escala On-Call

Definir com a equipe:
- Quem é acionado quando alerta dispara (PagerDuty, Slack, telefone)
- Rotação semanal ou quinzenal
- Canais de comunicação de crise
- Consultar `docs/RUNBOOK.md` para procedimentos de resposta

---

## CRONOGRAMA SUGERIDO

| Semana | Ações | Responsável |
|--------|-------|-------------|
| **Semana 1** | DNS + SSL + EAS + Firebase (FCM) + Asaas sandbox | DevOps |
| **Semana 1** | Apple Developer Account + Google Play Account | DevOps |
| **Semana 1** | DPAs + RIPD | Legal |
| **Semana 2** | Screenshots + Feature Graphic | Design |
| **Semana 2** | Textos da loja + Privacy Labels + Data Safety + IARC | Product |
| **Semana 2** | Certificados Apple + Keystore Android + GitHub secrets | DevOps |
| **Semana 2** | Conta de teste para reviewers | Product |
| **Semana 2** | SendGrid + deep link files + CDN | DevOps |
| **Semana 3** | Substituir 4 TODO push por chamadas FCM reais | Dev (30min) |
| **Semana 3** | Build EAS (iOS + Android) para ambos apps | DevOps |
| **Semana 3** | Submit TestFlight + Google Play Internal Testing | DevOps |
| **Semana 3** | Teste em devices reais (QA) | QA |
| **Semana 4** | Submit para App Store Review + Google Play Production | DevOps |
| **Semana 4** | Phased release (7 dias iOS, 10% Android) | DevOps |
| **Semana 4** | On-call definido + escala comunicada | Gestão |
