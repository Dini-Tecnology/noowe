# ACOES HUMANAS PENDENTES PARA PUBLICACAO
## Plataforma Okinawa - Client App + Restaurant App
### Gerado em: 07/04/2026

> Este documento lista TODAS as acoes que requerem intervencao humana
> (credenciais, contas externas, assets visuais, documentos legais, deploys).
> Os itens de codigo ja foram corrigidos automaticamente pelo Claude Code.

---

## PRIORIDADE 1 - BLOQUEANTES (Sem esses, impossivel publicar)

### 1.1 Contas de Desenvolvedor

| # | Acao | Detalhes | Custo | Onde fazer |
|---|------|---------|-------|------------|
| 1 | Criar conta Apple Developer | Necessaria para submeter ao App Store. Usar email corporativo. Processo leva 24-48h para aprovacao. | $99/ano | https://developer.apple.com/programs/enroll/ |
| 2 | Criar conta Google Play Developer | Necessaria para submeter ao Play Store. Pagamento unico. | $25 | https://play.google.com/console/signup |
| 3 | Criar projeto no Expo (EAS) | Rodar `eas init` em cada app para obter projectId real. | Gratis | Terminal: `cd platform/mobile/apps/client && npx eas init` e `cd platform/mobile/apps/restaurant && npx eas init` |

### 1.2 Credenciais EAS (Build/Submit)

| # | Arquivo | Campo | Valor Atual | O que colocar | Como obter |
|---|---------|-------|-------------|---------------|------------|
| 4 | `mobile/eas.json` linha 36 | appleId | `APPLE_ID_PLACEHOLDER` | Email da Apple Developer Account | Conta Apple Developer (item 1) |
| 5 | `mobile/eas.json` linha 37 | ascAppId | `ASC_APP_ID_PLACEHOLDER` | ID numerico do app no App Store Connect | Criar app em https://appstoreconnect.apple.com > My Apps > + |
| 6 | `mobile/eas.json` linha 38 | appleTeamId | `APPLE_TEAM_ID_PLACEHOLDER` | Team ID (10 caracteres alfanumericos) | https://developer.apple.com/account > Membership > Team ID |
| 7 | `mobile/apps/client/app.json` linha 89 | projectId | `your-project-id` | UUID gerado pelo EAS | Rodar `npx eas init` no diretorio do client app |
| 8 | `mobile/apps/restaurant/app.json` linha 72 | projectId | `your-project-id` | UUID gerado pelo EAS | Rodar `npx eas init` no diretorio do restaurant app |

### 1.3 Chaves de API do Backend (Producao)

| # | Variavel | Servico | Para que serve | Como obter |
|---|----------|---------|----------------|------------|
| 9 | `ASAAS_API_KEY` | Asaas | Processar pagamentos PIX/cartao/boleto | https://www.asaas.com > Configuracoes > Integracao > Chave de API |
| 10 | `ASAAS_ENVIRONMENT` | Asaas | Ambiente (sandbox/production) | Usar `sandbox` para testes, `production` para loja |
| 11 | `SENDGRID_API_KEY` | SendGrid | Enviar emails (reset senha, recibos) | https://app.sendgrid.com > Settings > API Keys > Create |
| 12 | `SENDGRID_FROM_EMAIL` | SendGrid | Email remetente | Configurar Sender Identity no SendGrid |
| 13 | `TWILIO_ACCOUNT_SID` | Twilio | Enviar OTP por WhatsApp/SMS | https://console.twilio.com > Account Info |
| 14 | `TWILIO_AUTH_TOKEN` | Twilio | Autenticacao Twilio | https://console.twilio.com > Account Info |
| 15 | `TWILIO_PHONE_NUMBER` | Twilio | Numero remetente SMS | Comprar numero em https://console.twilio.com > Phone Numbers |
| 16 | `TWILIO_SERVICE_SID` | Twilio | Twilio Verify Service (OTP) | Criar Verify Service em https://console.twilio.com > Verify |
| 17 | `OPENAI_API_KEY` | OpenAI | Analise de sentimento em reviews | https://platform.openai.com > API Keys |
| 18 | `FCM_SERVER_KEY` | Firebase | Push notifications | Firebase Console > Project Settings > Cloud Messaging |
| 19 | `SENTRY_DSN` | Sentry | Monitoramento de erros | https://sentry.io > Projects > Client Keys (DSN) |
| 20 | `GOOGLE_CLIENT_ID` | Google OAuth | Login com Google | Google Cloud Console > APIs & Services > Credentials |
| 21 | `GOOGLE_CLIENT_SECRET` | Google OAuth | Login com Google | Mesmo lugar que item 20 |
| 22 | `APPLE_CLIENT_ID` | Apple Sign-In | Login com Apple | Apple Developer > Identifiers > Services IDs |
| 23 | `APPLE_TEAM_ID` | Apple Sign-In | Team ID | Apple Developer > Membership |
| 24 | `APPLE_KEY_ID` | Apple Sign-In | Key para tokens | Apple Developer > Keys > Sign In with Apple |
| 25 | `APPLE_PRIVATE_KEY` | Apple Sign-In | Chave privada (.p8) | Baixar ao criar a Key (item 24) |
| 26 | `QR_SECRET_KEY` | Interno | Assinar QR codes | Gerar: `openssl rand -hex 32` |
| 27 | `FIELD_ENCRYPTION_KEY` | Interno | Criptografia AES-256 de dados sensiveis | Gerar: `openssl rand -hex 32` |
| 28 | `JWT_SECRET` | Interno | Assinar tokens JWT | Gerar: `openssl rand -hex 32` |
| 29 | `JWT_REFRESH_SECRET` | Interno | Assinar refresh tokens | Gerar: `openssl rand -hex 32` (diferente do JWT_SECRET) |
| 30 | `CSRF_SECRET` | Interno | Protecao CSRF | Gerar: `openssl rand -hex 32` (diferente dos anteriores) |

### 1.4 Firebase (Push Notifications)

| # | Acao | Detalhes | Arquivos afetados |
|---|------|---------|-------------------|
| 31 | Criar projeto Firebase | https://console.firebase.google.com > Add Project > "Okinawa" | — |
| 32 | Registrar app Android (client) | Package: `com.noowe.client` | Baixar `google-services.json` para `mobile/apps/client/` |
| 33 | Registrar app Android (restaurant) | Package: `com.noowe.restaurant` | Baixar `google-services.json` para `mobile/apps/restaurant/` |
| 34 | Registrar app iOS (client) | Bundle ID: `com.noowe.client` | Baixar `GoogleService-Info.plist` para `mobile/apps/client/ios/` |
| 35 | Registrar app iOS (restaurant) | Bundle ID: `com.noowe.restaurant` | Baixar `GoogleService-Info.plist` para `mobile/apps/restaurant/ios/` |
| 36 | Ativar Cloud Messaging | Firebase Console > Project Settings > Cloud Messaging > Enable | Copiar Server Key para `FCM_SERVER_KEY` no .env |
| 37 | Ativar Firebase Analytics | Firebase Console > Analytics > Enable | Ja declarado no PrivacyInfo.xcprivacy |

### 1.5 Implementar Sign in with Apple (BLOQUEANTE)

| # | Acao | Detalhes |
|---|------|---------|
| 38 | Criar Apple Services ID | Apple Developer > Identifiers > Services IDs > criar `com.noowe.client.signin` |
| 39 | Configurar Sign In with Apple | Apple Developer > Identifiers > App IDs > `com.noowe.client` > Capabilities > Sign In with Apple > Enable |
| 40 | Criar Key para Sign In with Apple | Apple Developer > Keys > + > Sign In with Apple > configurar com o App ID |
| 41 | Implementar no codigo | Ja existe `expo-apple-authentication` no package.json. Precisa conectar ao WelcomeScreen de ambos os apps. O servico `socialAuthService.signInWithApple()` ja existe no shared code. |

> **NOTA**: O codigo do Sign in with Apple ja existe parcialmente no `shared/services/social-auth.ts`. O que falta e a configuracao na Apple Developer Account (itens 38-40) e verificar que o WelcomeScreen esta chamando o metodo corretamente.

### 1.6 Completar Integracao Asaas (Pagamentos)

| # | Acao | Detalhes |
|---|------|---------|
| 42 | Criar conta Asaas | https://www.asaas.com > Criar conta empresa |
| 43 | Obter API Key de sandbox | Asaas > Configuracoes > Integracao > Gerar chave sandbox |
| 44 | Testar endpoints de pagamento | Usar sandbox para testar: criacao de cobranca PIX, cartao, boleto |
| 45 | Implementar webhook Asaas | Configurar URL do webhook no painel Asaas apontando para `https://api.SEU_DOMINIO/api/v1/webhooks/asaas` |
| 46 | Substituir stubs por chamadas reais | Arquivo: `backend/src/modules/payment-gateway/adapters/asaas/asaas.adapter.ts` - remover mocks e implementar chamadas HTTP reais para a API Asaas v3 |
| 47 | Obter API Key de producao | Apenas quando pronto para produzir |

### 1.7 Documentos Legais

| # | Acao | Detalhes | URL sugerida |
|---|------|---------|-------------|
| 48 | Redigir Politica de Privacidade | Deve cobrir: dados coletados (nome, email, telefone, localizacao, pagamentos), como sao usados, com quem sao compartilhados, LGPD compliance, como solicitar exclusao, Firebase Analytics e Sentry disclosure | `https://noowebr.com/privacidade` |
| 49 | Redigir Termos de Uso | Deve cobrir: descricao do servico, responsabilidades, pagamentos, cancelamentos, propriedade intelectual, limitacao de responsabilidade | `https://noowebr.com/termos` |
| 50 | Hospedar documentos em URL publica | HTTPS obrigatorio, sem login. Pode ser pagina do site, Google Docs publico, ou pagina estatica | Dominio: `noowebr.com` |
| 51 | Atualizar URLs no backend | Arquivo: `backend/src/modules/legal/legal-content/` - verificar se as URLs reais estao configuradas | — |

### 1.8 Infraestrutura de Producao

| # | Acao | Detalhes |
|---|------|---------|
| 52 | Provisionar servidor/instancia | Opcoes: AWS EC2/ECS, DigitalOcean, Render, Railway. Recomendado: AWS com Docker |
| 53 | Provisionar PostgreSQL | Opcoes: AWS RDS, Supabase, Neon. Min 2 vCPU, 4GB RAM para producao |
| 54 | Provisionar Redis | Opcoes: AWS ElastiCache, Redis Cloud, Upstash |
| 55 | Configurar dominio API | Ex: `api.noowebr.com` com certificado SSL (Let's Encrypt ou AWS ACM) |
| 56 | Configurar DNS | Apontar `api.noowebr.com` para o servidor |
| 57 | Executar migrations | `npm run migration:run` no backend com banco de producao |
| 58 | Configurar CORS_ORIGIN | No .env de producao: `CORS_ORIGIN=https://noowebr.com` |
| 59 | Executar seed inicial | `npm run seed` para dados base (se aplicavel) |

---

### 1.9 Emissao fiscal (NFC-e) — ADR-030

| # | Acao | Detalhes |
|---|------|---------|
| 1 | Contratar a Focus NFe | Conta e token de **homologacao** primeiro. A emissao real ainda nao foi testada contra a Focus. |
| 2 | Validar com a contabilidade | Taxa de servico na nota, `tipo_integracao`, regime e tributacao padrao (ADR-030, "Valores provisorios"). |
| 3 | Cadastrar cada restaurante na Focus | Certificado A1 e CSC ficam la. O CSC e gerado na SEFAZ do estado. |
| 4 | Ativar `pg_cron` e `pg_net` no projeto | A migration tenta habilitar. Se `pg_cron` falhar, habilite no painel e rode `select private.fiscal_schedule_sweep();`. Sem isso a falha do emissor nao e reprocessada sozinha. |
| 5 | Vault com `project_url` e `service_role_key` | Os mesmos do push (`configure_customer_push_dispatch`). Sem eles a nota fica pendente, sem ser enviada. |
| 6 | Publicar a Edge Function | `supabase functions deploy fiscal-emit` |
| 7 | Provisionar o restaurante | Dono ou gerente cadastra pelo app, em Config > Fiscal, sempre em homologacao. Sem o app, chamada com service role:<br>`select public.service_fiscal_configure('<restaurant_id>', '{"cnpj":"...","razaoSocial":"...","stateCode":"SP","regimeTributario":"simples_nacional","environment":"homologation","taxDefaults":{"ncm":"21069090","icms_origem":"0","icms_situacao_tributaria":"102","pis_situacao_tributaria":"49","cofins_situacao_tributaria":"49"}}'::jsonb, '<token>');`<br>Os valores tributarios sao exemplo: use os da contabilidade. |
| 8 | Conferir a migration | `20261102100000_fiscal_emission` recusa rodar se `fiscal_configs` ou `fiscal_documents` tiverem linhas do backend antigo. Revise os dados e mova segredos para o Vault antes. |
| 9 | Promover a producao | So depois de nota autorizada em homologacao: reconfigure por service role com `"environment":"production"` e o token de producao. O app nao muda o ambiente. |

---

## PRIORIDADE 2 - ALTOS (Podem causar rejeicao ou problemas)

### 2.1 Assets Visuais para as Lojas

| # | Asset | Especificacao | Para que |
|---|-------|--------------|---------|
| 60 | App Icon Client (iOS) | 1024x1024 PNG sem transparencia, sem bordas arredondadas | App Store |
| 61 | App Icon Client (Android) | 512x512 PNG + Adaptive Icon (foreground 108x108) | Play Store |
| 62 | App Icon Restaurant (iOS) | 1024x1024 PNG sem transparencia | App Store |
| 63 | App Icon Restaurant (Android) | 512x512 PNG + Adaptive Icon | Play Store |
| 64 | Feature Graphic Client | 1024x500 PNG ou JPEG | Play Store (obrigatorio) |
| 65 | Feature Graphic Restaurant | 1024x500 PNG ou JPEG | Play Store (obrigatorio) |
| 66 | Screenshots Client iPhone 6.7" | Min 3, recomendado 6. Resolucao: 1290x2796 | App Store (obrigatorio) |
| 67 | Screenshots Client iPhone 6.5" | Min 3. Resolucao: 1242x2688 | App Store (obrigatorio) |
| 68 | Screenshots Client Android | Min 2, recomendado 4-8. Min 320px, max 3840px | Play Store |
| 69 | Screenshots Restaurant (mesmas specs) | Para cada tipo de tela | Ambas lojas |

### 2.2 Metadados das Lojas

| # | Campo | Client App | Restaurant App |
|---|-------|-----------|----------------|
| 70 | Nome (max 30 chars) | "Okinawa - Restaurantes" | "Okinawa Restaurante" |
| 71 | Subtitulo iOS (max 30 chars) | "Peca, pague, avalie" | "Gestao inteligente" |
| 72 | Descricao curta (max 80 chars) | "Encontre restaurantes, faca pedidos e pague sem esperar" | "Gerencie pedidos, reservas, estoque e equipe" |
| 73 | Descricao completa (max 4000 chars) | Redigir texto completo descrevendo funcionalidades | Redigir texto completo |
| 74 | Keywords iOS (max 100 chars) | "restaurante,pedido,delivery,reserva,pix,qrcode,mesa,comida" | "gestao,restaurante,pedidos,kds,cozinha,estoque,financeiro" |
| 75 | Categoria primaria | Food & Drink | Food & Drink |
| 76 | Categoria secundaria | Lifestyle | Business |
| 77 | Content Rating | Preencher questionario (sem conteudo adulto) | Preencher questionario |
| 78 | Privacy Policy URL | `https://noowebr.com/privacidade` | `https://noowebr.com/privacidade` |
| 79 | Support URL | `https://noowebr.com/suporte` ou email | Mesmo |

### 2.3 Conta de Teste para Revisores

| # | Acao | Detalhes |
|---|------|---------|
| 80 | Criar usuario teste Client App | Email: `reviewer@okinawa.app` ou telefone de teste. Deve estar funcional no backend de staging/producao |
| 81 | Criar usuario teste Restaurant App | Com role OWNER e restaurante pre-configurado com menu, mesas, etc |
| 82 | Documentar credenciais | Incluir na submissao: email/telefone + instrucoes de login |
| 83 | Popular dados de teste | Restaurantes, menu items, pedidos de exemplo para o revisor ver |

### 2.4 CI/CD Pipeline

| # | Acao | Detalhes |
|---|------|---------|
| 84 | Criar GitHub Actions workflow | Para backend: lint, test, build Docker, deploy |
| 85 | Criar EAS Build workflow | Para mobile: `eas build --platform all --profile production` |
| 86 | Configurar secrets no GitHub | DATABASE_URL, JWT_SECRET, ASAAS_API_KEY, etc. |
| 87 | Configurar auto-deploy | Push to main -> deploy backend + trigger EAS build |

### 2.5 Deep Links e Dominios

| # | Acao | Detalhes |
|---|------|---------|
| 88 | Configurar Apple Universal Links | Hospedar `apple-app-site-association` em `https://noowebr.com/.well-known/` |
| 89 | Configurar Android App Links | Hospedar `assetlinks.json` em `https://noowebr.com/.well-known/` |
| 90 | Verificar dominios no App Store Connect | Domains > noowebr.com |

---

## PRIORIDADE 3 - MEDIOS (Melhoram qualidade)

| # | Acao | Detalhes |
|---|------|---------|
| 91 | Configurar Sentry para ambos os apps | Criar projeto Sentry, obter DSN, configurar em SENTRY_DSN |
| 92 | Configurar Firebase Analytics | Ativar no console Firebase, verificar eventos customizados |
| 93 | Testar fluxo completo de pagamento em sandbox | PIX, cartao, boleto - ponta a ponta |
| 94 | Testar fluxo de OTP (WhatsApp + SMS) | Com Twilio sandbox |
| 95 | Testar biometria em dispositivos reais | Face ID (iPhone), Touch ID, Fingerprint (Android) |
| 96 | Testar push notifications E2E | Enviar push do backend, receber no app |
| 97 | Testar deep links em ambas plataformas | Abrir URL no navegador, verificar que abre o app |
| 98 | Executar `npm audit` em todos os packages | Corrigir vulnerabilidades encontradas |
| 99 | Rodar testes automatizados | `npm test` no backend e em ambos os apps mobile |

---

## PRIORIDADE 4 - BAIXOS (Pos-lancamento)

| # | Acao | Detalhes |
|---|------|---------|
| 100 | Configurar monitoramento de uptime | Pingdom, UptimeRobot, ou AWS CloudWatch |
| 101 | Configurar backup automatico do banco | RDS automated backups ou pg_dump cron |
| 102 | Configurar log aggregation | CloudWatch Logs, Datadog, ou ELK Stack |
| 103 | Implementar certificate pinning | Seguranca adicional para prevenir MITM |
| 104 | Otimizar imagens dos assets | Comprimir PNGs, usar WebP onde possivel |
| 105 | Configurar CDN para assets estaticos | CloudFront ou similar para imagens do menu |

---

## RESUMO RAPIDO

| Prioridade | Total de Acoes | Estimativa de Tempo |
|-----------|---------------|---------------------|
| BLOQUEANTES | 59 acoes | 2-3 semanas |
| ALTOS | 31 acoes | 1-2 semanas |
| MEDIOS | 9 acoes | 3-5 dias |
| BAIXOS | 6 acoes | Pos-lancamento |
| **TOTAL** | **105 acoes** | **4-6 semanas** |

---

## ORDEM SUGERIDA DE EXECUCAO

```
SEMANA 1:
- Criar contas (Apple Developer, Google Play, Firebase, Asaas, Twilio, SendGrid)
- Gerar todas as chaves de API e secrets internos
- Configurar Firebase (google-services.json, GoogleService-Info.plist)
- Configurar Apple Sign In (Apple Developer portal)
- Provisionar infraestrutura de producao

SEMANA 2:
- Preencher todos os placeholders no eas.json e app.json
- Implementar integracao real do Asaas (substituir stubs)
- Redigir e hospedar Politica de Privacidade e Termos de Uso
- Testar OTP, pagamentos, push notifications em sandbox

SEMANA 3:
- Criar assets visuais (icones, screenshots, feature graphics)
- Preencher metadados nas lojas (App Store Connect, Play Console)
- Criar contas de teste para revisores
- Popular dados de teste no backend de staging
- Configurar CI/CD

SEMANA 4:
- Testes finais E2E em dispositivos reais
- Submeter build de teste via EAS para ambas lojas
- Corrigir quaisquer problemas encontrados
- Submeter versao final para revisao

SEMANA 5-6 (buffer):
- Responder a feedbacks dos revisores
- Correcoes de rejeicao (se houver)
- Launch!
```
