# Security Policy

> **Bilingual Documentation** — This document is available in both English and Portuguese.
> **Documentação Bilíngue** — Este documento está disponível em inglês e português.

---

## Table of Contents

- [English](#english)
- [Português](#português)

---

# English

## Introduction

Project Okinawa implements enterprise-grade security measures to protect user data, ensure system integrity, and maintain service availability. This document outlines the platform's security policies, architecture, practices, and incident response procedures.

This software is proprietary and all intellectual property rights belong exclusively to the copyright holder. Unauthorized access, distribution, or modification is strictly prohibited.

## Supported Versions

| Version | Security Support | Status |
|---------|------------------|--------|
| 1.x.x | Active support with regular security updates | Current |
| < 1.0 | No security support | Deprecated |

Security patches are released as follows:

- **Critical vulnerabilities**: Within 24 hours
- **High severity**: Within 7 days
- **Medium severity**: Within 30 days
- **Low severity**: Next scheduled release

## Security Architecture

### Defense in Depth (7 Layers)

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: WAF / DDoS Protection (CloudFront / Cloudflare)    │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: TLS 1.3 / HSTS / Certificate Pinning              │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3: Rate Limiting (Throttler per endpoint type)        │
├─────────────────────────────────────────────────────────────┤
│  LAYER 4: CSRF Protection (double-submit, no fallbacks)      │
├─────────────────────────────────────────────────────────────┤
│  LAYER 5: Authentication + RBAC (JWT JTI + 6-tier roles)     │
├─────────────────────────────────────────────────────────────┤
│  LAYER 6: Input Validation (class-validator, whitelist)       │
├─────────────────────────────────────────────────────────────┤
│  LAYER 7: Audit & Monitoring (Structured Logging, Sentry)    │
├─────────────────────────────────────────────────────────────┤
│  DATABASE: Encrypted at rest (PostgreSQL native + AES-256)   │
└─────────────────────────────────────────────────────────────┘
```

### Security Principles

1. **Least Privilege** — Components have minimum necessary permissions
2. **Defense in Depth** — 7 security layers from WAF to database encryption
3. **Fail Secure** — The system fails to a secure state; no hardcoded fallbacks
4. **Separation of Concerns** — The Identity Module is the canonical source of truth for all credentials
5. **Audit Everything** — Comprehensive logging with correlation IDs across all services

## Authentication and Authorization

### Identity Module (Canonical Source)

The Identity Module (`IdentityModule`) is the single source of truth for all credential management:

| Service | Purpose |
|---------|---------|
| `CredentialService` | Password hashing (bcrypt cost 12), validation, history |
| `MfaService` | TOTP-based MFA with recovery codes |
| `TokenBlacklistService` | JTI-based hybrid blacklisting (Redis hot + PostgreSQL cold) |
| `AuditLogService` | Security event logging (login, logout, failed attempts) |
| `PasswordPolicyService` | History tracking (last 5), complexity enforcement |

### JWT Authentication

```typescript
// JWT Configuration
{
  algorithm: 'HS256',           // Explicit — prevents algorithm confusion attacks
  accessTokenExpiresIn: '15m',  // Short-lived
  refreshTokenExpiresIn: '7d',  // Longer-lived with rotation
  issuer: 'okinawa-api',
  audience: 'noowe-clients'
}

// JWT Payload includes unique JTI for secure blacklisting
{
  sub: 'user-id',
  email: 'user@example.com',
  jti: 'unique-token-identifier', // UUID — enables precise revocation
  family: 'token-family-id',      // Refresh only — rotation detection
  iat: timestamp,
  exp: timestamp
}
```

**Security Features:**

- Explicit algorithm specification to prevent algorithm confusion attacks
- Short-lived access tokens (15 minutes)
- Refresh token rotation with family tracking for reuse detection
- JTI-based token blacklisting — hybrid Redis (hot) + PostgreSQL (cold)
- Token validation checks JTI against blacklist on every request
- Issuer and audience validation
- Separate JTI for access and refresh tokens

### Token Blacklisting Strategy (Hybrid)

```
┌─────────────────────────────────────────────────────────────┐
│                 TOKEN BLACKLIST (HYBRID)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  REDIS (Hot Path — sub-millisecond)                          │
│  Key: blacklist:{jti} | TTL: matches token expiry            │
│  → Real-time validation on EVERY request                     │
│                                                               │
│  POSTGRESQL (Cold Path — persistent)                         │
│  Table: token_blacklist | Columns: jti, user_id, reason      │
│  → Audit trail + Redis failure fallback                      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Token Management

| Token Type | Expiration | Storage | Blacklisting | Purpose |
|------------|------------|---------|:------------:|---------|
| Access Token | 15 minutes | Memory | Redis + PG | API authentication |
| Refresh Token | 7 days | Secure storage | Redis + PG | Token renewal |

### OAuth Integration

| Provider | Token Validation | Security |
|----------|------------------|----------|
| **Google OAuth 2.0** | `oauth2.googleapis.com/tokeninfo` | OpenID Connect compliant |
| **Apple Sign In** | Apple JWKS (RSA-SHA256 public keys) | Privacy-focused, key rotation |

**Apple Sign-In Verification Chain:**
1. Fetch JWKS from `https://appleid.apple.com/auth/keys`
2. Match key by `kid` header claim
3. Verify signature using RSA-SHA256 public key
4. Validate `iss`, `aud`, `exp` claims
5. Extract user data (email only on first login)

### Password Security

- **Hashing**: bcrypt with cost factor **12**
- **Minimum Requirements**:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character
- **Password History**: Prevents reuse of last 5 passwords
- **Expiration**: Configurable password expiry policy

### Multi-Factor Authentication (MFA)

- TOTP-based second factor (RFC 6238)
- Recovery codes for account recovery
- Optional enforcement per user role
- Managed by `MfaService` in the Identity Module

### Role-Based Access Control (6-Tier RBAC)

| Tier | Role | Permissions |
|:----:|------|-------------|
| 1 | **OWNER** | Full control — all operations, financial, staff management |
| 2 | **MANAGER** | Operations & approval — cancellations, refunds, reports |
| 3 | **MAÎTRE** | Reservations, floor plan, queue management, guest check-in |
| 4 | **CHEF** | Kitchen KDS — view food orders, update preparation status |
| 5 | **WAITER** | Table service — view orders, update status, manage tables |
| 6 | **BARMAN** | Bar KDS — view drink orders, update preparation status |

**Access Control Features:**
- Restaurant-scoped permissions (no cross-tenant access)
- Sensitive actions (cancellations, refunds) require MANAGER or OWNER approval
- Resource ownership validation via `OwnershipGuard`
- Navigation dynamically restricted based on role

## Data Protection

### Encryption

**Data at Rest:**
- Database encryption using PostgreSQL native encryption
- Sensitive fields encrypted at application level
- Backup encryption with AES-256

**Data in Transit:**
- TLS 1.3 for all connections
- Certificate pinning in mobile applications
- HSTS enforcement (max-age: 31536000, includeSubDomains)

### Sensitive Data Handling

| Data Type | Protection Method |
|-----------|-------------------|
| Passwords | bcrypt hash (cost 12) — Identity Module |
| Payment tokens | Encrypted, tokenized |
| Personal information | Application-level encryption |
| Session tokens | Secure, HttpOnly cookies |
| API keys | Environment variables, never in code |
| JWT secrets | Environment variables (32+ chars, no fallbacks) |

### Data Retention

- Active user data: Retained while account is active
- Inactive accounts: Anonymized after 2 years
- Transaction logs: Retained for 7 years (compliance)
- Audit logs: Retained for 5 years

### GDPR / LGPD Compliance

- Right to access: Export personal data
- Right to erasure: Data deletion requests
- Right to portability: Machine-readable export
- Consent management: Explicit opt-in

## Network Security

### CORS Configuration

```typescript
// Production CORS — explicitly configured origins only
{
  origin: ['https://app.okinawa.com', 'https://restaurant.okinawa.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-CSRF-Token',
    'X-Idempotency-Key',
    'X-Request-ID'
  ]
}
```

**Security Notes:**
- Never use wildcard (`*`) in production
- Origin validation rejects malformed URLs
- HTTP origins rejected in production

### Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 5 requests | 15 minutes |
| API General | 100 requests | 1 minute |
| Password Reset | 3 requests | 1 hour |
| File Upload | 10 requests | 1 minute |
| OTP Request | 3 per phone | 15 minutes |

### Security Headers (Helmet.js)

```typescript
{
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}
```

### CSRF Protection

- Double-submit cookie pattern with **httpOnly cookies** for both secret and token
- Requires `CSRF_SECRET` or `JWT_SECRET` — no hardcoded fallbacks
- Token rotation per session
- SameSite cookie attribute (strict mode)
- Origin/Referer validation
- CSRF token exposed via `X-CSRF-Token` header for JavaScript access

## Application Security

### Input Validation

All input is validated using class-validator decorators with `whitelist: true`:

```typescript
@IsEmail()
email: string;

@IsString()
@MinLength(8)
@MaxLength(128)
@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;':"\\,.<>\/?`~])/)
password: string;
```

**Validation Rules:**
- Whitelist validation (only allowed fields)
- Type coercion with strict validation
- Maximum payload size limits
- File type validation for uploads

### SQL Injection Prevention

- TypeORM parameterized queries
- No raw SQL queries without explicit parameterization
- Query logging in development for review

### XSS Prevention

- Output encoding by default
- Content Security Policy headers (Helmet.js)
- Strict input sanitization
- React / React Native automatic escaping

### Secure File Handling

- File type validation via magic bytes
- Maximum file size limits
- Virus scanning for uploads
- Separate storage for user uploads
- Signed URLs for access

### Dependency Security

- Regular `npm audit` execution
- CI/CD pipeline blocks on high/critical vulnerabilities
- Automated dependency updates via Dependabot
- No production dependencies with known vulnerabilities

## Infrastructure Security

### Container Security

```dockerfile
FROM node:20-alpine AS production
USER node                                    # Non-root execution
WORKDIR /app
COPY --chown=node:node . .
ENV JWT_SECRET=${JWT_SECRET:?required}       # Fail on missing vars
ENV DB_HOST=${DB_HOST:?required}
```

- Non-root container execution
- Minimal base images (Alpine)
- No secrets in images
- Image vulnerability scanning
- Required environment variables validated at container start

### Database Security

- Network isolation (private subnet)
- Strong password policy
- Encrypted connections (SSL/TLS)
- Regular security patching
- Automated backups with encryption

### Redis Security

- Password authentication required
- Network isolation
- TLS for connections in production
- Memory limits configured

### Secrets Management

| Secret Type | Storage Method | Validation |
|-------------|----------------|------------|
| Database credentials | Environment variables | Required at startup |
| API keys | Environment variables | Required at startup |
| JWT secrets | Environment variables (32+ chars) | Required — no fallbacks |
| CSRF secrets | Environment variables | Required — no fallbacks |
| OAuth secrets | Environment variables | Required |

### API Documentation

- Swagger/OpenAPI is **disabled in production** via `NODE_ENV` check
- Only available in development and staging environments

## Logging & Monitoring

### Structured Logging

All logs are JSON-structured with correlation IDs via `StructuredLoggerService`:

```json
{
  "timestamp": "2025-02-24T10:30:00.000Z",
  "level": "warn",
  "message": "Failed login attempt",
  "context": "AuthService",
  "correlationId": "req-uuid-123",
  "metadata": {
    "email": "user@example.com",
    "ip": "192.168.1.1",
    "reason": "invalid_password"
  }
}
```

### Distributed Tracing

- Tracing via `TracingModule.forRoot()` with configurable sampling rate (10% in production)
- Span export routed through `StructuredLoggerService`

### Audit Trail

All security-relevant actions are logged via `AuditLogService` in the Identity Module:

- Authentication events (success/failure)
- Authorization decisions
- Data access and modifications
- Administrative actions
- Configuration changes
- Token blacklisting events

Log format includes: timestamp (ISO 8601), user identifier, action, resource, IP address, result, and correlation ID.

## Payment Security

### Split Payment Architecture Security

| Measure | Implementation |
|---------|----------------|
| **Token-based Payments** | Payment tokens used instead of raw card data |
| **Guest Isolation** | Each guest's payment is isolated and tracked separately |
| **Real-time Validation** | Payment amounts validated against order totals |
| **Audit Trail** | Complete payment history with timestamps per guest |

### Staff Access Controls

Restaurant staff can:
- ✅ View payment progress per guest
- ✅ See which items are assigned to each guest
- ✅ Prompt guests for payment
- ❌ Modify guest item assignments
- ❌ Process payments on behalf of guests without authorization

## Reporting Vulnerabilities

### Responsible Disclosure

If you discover a security vulnerability, please report it responsibly:

1. **DO NOT** create public GitHub issues for security vulnerabilities
2. **DO NOT** publicly disclose the vulnerability before it is fixed
3. **DO** provide detailed information to help reproduce the issue

### Reporting Process

**Email:** security@okinawa-project.com

**Include in your report:**

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested remediation (if any)
- Your contact information for follow-up

### Response Timeline

| Phase | Timeline |
|-------|----------|
| Initial acknowledgment | 48 hours |
| Severity assessment | 7 days |
| Remediation (Critical) | 24–48 hours |
| Remediation (High) | 7 days |
| Remediation (Medium) | 30 days |
| Remediation (Low) | 90 days |
| Disclosure coordination | After fix deployed |

### Scope

**In Scope:**

- Backend API (NestJS — 26 modules)
- Identity Module (credentials, tokens, audit)
- Mobile applications (React Native)
- Database security
- Authentication/Authorization vulnerabilities
- Data exposure vulnerabilities
- Payment processing security
- WebSocket security
- Infrastructure configuration

**Out of Scope:**

- Social engineering attacks
- Physical security attacks
- Denial of Service (DoS/DDoS) attacks
- Third-party service vulnerabilities
- Issues in dependencies (report upstream)

## Security Best Practices

### For Developers

1. **Never Commit Secrets**
   ```bash
   cp .env.example .env
   # Configure secrets locally — .env is in .gitignore
   ```

2. **Use Strong Secrets**
   ```bash
   openssl rand -base64 32
   ```

3. **Validate All Input**
   ```typescript
   @IsString()
   @IsNotEmpty()
   @MaxLength(100)
   name: string;
   ```

4. **Use Parameterized Queries**
   ```typescript
   // ✅ Correct
   await repository.find({ where: { id } });
   // ❌ Never
   await repository.query(`SELECT * FROM users WHERE id = ${id}`);
   ```

5. **Implement Proper Authorization**
   ```typescript
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles(Role.MANAGER, Role.OWNER)
   async sensitiveOperation() {}
   ```

6. **Log Security Events**
   ```typescript
   this.logger.warn('Failed login attempt', { email, ip });
   ```

7. **Keep Dependencies Updated**
   ```bash
   npm audit
   ```

### For Operations

1. **Environment Isolation** — Separate dev, staging, production with different credentials
2. **Monitoring & Alerting** — Failed auth alerts, rate limit thresholds, error rate monitoring
3. **Regular Security Audits** — Quarterly penetration testing, annual security audit
4. **Backup & Recovery** — Daily automated backups, encrypted storage, tested recovery procedures

## Compliance

### Standards and Frameworks

- **PCI DSS** — Payment card data security
- **LGPD** — Brazilian data protection law
- **GDPR** — European data protection regulation
- **SOC 2** — Service organization controls

## Incident Response

### Incident Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| Critical | Active exploitation, data breach | Immediate |
| High | Vulnerability with exploit available | 4 hours |
| Medium | Potential security weakness | 24 hours |
| Low | Minor security improvement | 1 week |

### Response Procedure

1. **Detection**: Automated monitoring or manual report
2. **Triage**: Assess severity and impact
3. **Containment**: Isolate affected systems
4. **Investigation**: Determine root cause
5. **Remediation**: Fix vulnerability
6. **Recovery**: Restore normal operations
7. **Post-mortem**: Document lessons learned

### Communication

- Internal team notification via secure channels
- Affected users notified within 72 hours (if applicable)
- Regulatory notification as required
- Public disclosure after remediation (if warranted)


---

# Português

## Introdução

O Project Okinawa implementa medidas de segurança de nível empresarial para proteger dados de usuários, garantir a integridade do sistema e manter a disponibilidade do serviço. Este documento descreve as políticas, arquitetura, práticas e procedimentos de resposta a incidentes de segurança da plataforma.

## Arquitetura de Segurança

### Defesa em Profundidade (7 Camadas)

```
┌─────────────────────────────────────────────────────────────┐
│  CAMADA 1: WAF / Proteção DDoS (CloudFront / Cloudflare)     │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 2: TLS 1.3 / HSTS / Certificate Pinning              │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 3: Rate Limiting (Throttler por tipo de endpoint)     │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 4: Proteção CSRF (double-submit, sem fallbacks)       │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 5: Autenticação + RBAC (JWT JTI + 6 níveis)          │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 6: Validação de Entrada (class-validator, whitelist)  │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 7: Auditoria & Monitoramento (Structured Logging)     │
├─────────────────────────────────────────────────────────────┤
│  BANCO: Criptografado em repouso (PostgreSQL + AES-256)       │
└─────────────────────────────────────────────────────────────┘
```

## Autenticação e Autorização

### Módulo de Identidade (Fonte Canônica)

| Serviço | Propósito |
|---------|-----------|
| `CredentialService` | Hashing de senhas (bcrypt custo 12), validação, histórico |
| `MfaService` | MFA baseado em TOTP com códigos de recuperação |
| `TokenBlacklistService` | Blacklisting JTI híbrido (Redis + PostgreSQL) |
| `AuditLogService` | Log de eventos de segurança |
| `PasswordPolicyService` | Histórico (últimas 5), regras de complexidade |

### Autenticação JWT

- Algoritmo HS256 explícito (previne ataques de confusão de algoritmo)
- Access tokens de 15 minutos
- Refresh tokens de 7 dias com rotação e detecção de reuso (family)
- Blacklisting JTI via Redis (hot) + PostgreSQL (cold)
- Validação de JTI em cada requisição
- Validação de issuer e audience

### OAuth

| Provedor | Validação | Segurança |
|----------|-----------|-----------|
| **Google OAuth 2.0** | tokeninfo endpoint | OpenID Connect |
| **Apple Sign In** | JWKS (RSA-SHA256) | Rotação de chaves, privacidade |

### RBAC (6 Níveis)

| Nível | Papel | Permissões |
|:-----:|-------|------------|
| 1 | **OWNER** | Controle total |
| 2 | **MANAGER** | Operações, aprovações, relatórios |
| 3 | **MAÎTRE** | Reservas, mapa, fila |
| 4 | **CHEF** | KDS Cozinha |
| 5 | **WAITER** | Serviço de mesa |
| 6 | **BARMAN** | KDS Bar |

Ações sensíveis (cancelamentos, reembolsos) requerem aprovação de MANAGER ou OWNER.

## Proteção de Dados

### Criptografia

**Dados em Repouso:** PostgreSQL nativo + AES-256 para backups
**Dados em Trânsito:** TLS 1.3 + certificate pinning + HSTS

### Tratamento de Dados Sensíveis

| Tipo de Dado | Método de Proteção |
|--------------|-------------------|
| Senhas | Hash bcrypt (custo 12) — Módulo Identity |
| Tokens de pagamento | Criptografados, tokenizados |
| Informações pessoais | Criptografia no nível da aplicação |
| Tokens de sessão | Cookies seguros, HttpOnly |
| Chaves de API | Variáveis de ambiente, nunca no código |
| Segredos JWT | Variáveis de ambiente (32+ chars, sem fallbacks) |

### Conformidade LGPD / GDPR

- Direito de acesso, exclusão e portabilidade
- Gestão de consentimento explícito
- Retenção: dados ativos enquanto conta ativa; anonimização após 2 anos
- Logs de auditoria: 5 anos | Logs de transação: 7 anos

## Segurança de Rede

### CORS

- Apenas origens explicitamente configuradas em produção
- Nunca usar wildcard (`*`)
- Headers permitidos: `Content-Type`, `Authorization`, `X-CSRF-Token`, `X-Idempotency-Key`, `X-Request-ID`

### Proteção CSRF

- Double-submit cookie com cookies **httpOnly**
- Requer `CSRF_SECRET` ou `JWT_SECRET` — sem fallbacks hardcoded
- SameSite=Strict, validação Origin/Referer

### Rate Limiting

| Tipo de Endpoint | Limite | Janela |
|------------------|--------|--------|
| Autenticação | 5 requisições | 15 minutos |
| API Geral | 100 requisições | 1 minuto |
| Reset de Senha | 3 requisições | 1 hora |
| Upload de Arquivo | 10 requisições | 1 minuto |
| Requisição OTP | 3 por telefone | 15 minutos |

## Segurança da Aplicação

- Validação whitelist com class-validator
- Queries parametrizadas TypeORM (prevenção SQL injection)
- CSP via Helmet.js (prevenção XSS)
- Validação de tipo de arquivo via magic bytes
- CI/CD bloqueia em vulnerabilidades high/critical

## Segurança de Infraestrutura

- Containers non-root (Alpine)
- Variáveis de ambiente obrigatórias validadas no startup do container
- Swagger desabilitado em produção
- Banco isolado em subnet privada com SSL/TLS
- Redis com autenticação e TLS em produção

## Logging & Monitoramento

- `StructuredLoggerService` com correlation IDs em JSON
- `TracingModule` com sampling configurável (10% em produção)
- `AuditLogService` (Módulo Identity) para eventos de segurança
- Sentry para monitoramento de erros

## Segurança de Pagamentos

- Tokens de pagamento (nunca dados de cartão raw)
- Isolamento de pagamento por convidado
- Validação em tempo real contra totais do pedido
- Trilha de auditoria completa
- Staff pode ver mas não modificar seleções de pagamento

## Reportando Vulnerabilidades

**Email:** security@okinawa-project.com

1. **NÃO** crie issues públicas no GitHub
2. **NÃO** divulgue publicamente antes da correção
3. **FORNEÇA** informações detalhadas para reprodução

### Cronograma de Resposta

| Fase | Prazo |
|------|-------|
| Confirmação inicial | 48 horas |
| Avaliação de severidade | 7 dias |
| Remediação (Crítica) | 24–48 horas |
| Remediação (Alta) | 7 dias |
| Remediação (Média) | 30 dias |
| Remediação (Baixa) | 90 dias |


---

**Document Version:** 3.1
**Last Updated:** February 2025
**Review Cycle:** Quarterly

**Versão do Documento:** 3.1
**Última Atualização:** Fevereiro 2025
**Ciclo de Revisão:** Trimestral
