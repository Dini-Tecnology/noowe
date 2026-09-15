# NOOWE — Restaurant Technology Platform

> **Bilingual Documentation** — This document is available in both English and Portuguese.
> **Documentação Bilíngue** — Este documento está disponível em inglês e português.

---

## Table of Contents / Índice

- [English](#english)
- [Português](#português)

---

# English

## Overview

NOOWE is a comprehensive **in-person experience platform** designed to modernize and optimize hospitality operations. Unlike food delivery apps, NOOWE focuses exclusively on **physical dining experiences**, creating seamless connections between customers and establishments through technology.

### Mission Statement

> *"To be a user-centric experience platform that connects users with commercial establishments by intermediating and enabling incredible experiences."*

The platform is NOT a restaurant-focused tool, but rather centers on creating **exceptional user experiences** and meaningful connections.

### Platform Components

| Component | Technology | Scope |
|-----------|------------|-------|
| **Client Mobile App** | React Native 0.74 / Expo 51 | 61 screens — discovery, ordering, reservations, payments, loyalty |
| **Restaurant Mobile App** | React Native 0.74 / Expo 51 | 81 screens — KDS, floor management, analytics, CRM, fiscal |
| **Backend/Data Platform** | Supabase Auth + Postgres + RLS | Auth, profiles, roles, policies, realtime-ready data |
| **Site (Web)** | React + Vite + Tailwind | Institutional landing page + interactive demo |

### Platform Numbers

| Metric | Count |
|--------|------:|
| Total mobile screens | **142** |
| Supabase migrations | **46+** |
| RLS-protected data domains | **Core profiles, roles, restaurants, leads, generated tables** |
| WebSocket gateways | **9** |
| Database entities | **96** |
| Database migrations | **45** |
| Backend test files | **137** |
| i18n keys (per language) | **2,800+** |
| Languages supported | **3** (PT-BR, EN-US, ES-ES) |
| CI/CD workflows | **6** |
| Documentation files | **53** |
| Total .tsx files (mobile) | **898** |
| Accessibility labels | **681+** |

### Competitive Differentiation

NOOWE's market advantage is built on three pillars:

1. **Total Integration** — Centralizes 8+ fragmented tools (loyalty, KDS, payments, reservations, BI, fiscal, CRM, stock) into one ecosystem
2. **UX-First Defensibility** — 142 native screens optimized for behavioral habits and intuitive operations
3. **Natural Lock-in** — Deep data integration that increases switching costs through accumulated insights

## Supported Service Types

The platform dynamically adapts to **11 distinct service types** via a feature registry (`service-type.registry.ts`):

| Service Type | Description | Key Features |
|--------------|-------------|--------------|
| **Fine Dining** | Premium experience with personalized service | Sommelier, wine pairing, dress code |
| **Quick Service** | Fast food with minimal wait times | Counter ordering, pickup codes |
| **Fast Casual** | Quality food with quick turnaround | Hybrid ordering, customization |
| **Café / Bakery** | Coffee shops and bakeries | Tab system, stamp cards, auto-award |
| **Buffet** | Self-service with weight-based pricing | Covers-based pricing, check-in |
| **Drive-Thru** | Vehicle-based ordering | GPS queue, proximity sorting |
| **Food Truck** | Mobile food vendors | Real-time GPS tracking, geolocation |
| **Chef's Table** | Exclusive tasting experiences | Chef approval workflow, capacity enforcement, pre-pay |
| **Casual Dining** | Relaxed full-service restaurants | Waitlist, flexible reservations |
| **Pub & Bar** | Drinks-focused establishments | Tab management, cover charge, invite QR, happy hour |
| **Club & Balada** | Nightclubs and venues | Entry tickets, VIP tables, area selector, promoters, birthday packages |

## Platform Capabilities

| Capability | Description |
|------------|-------------|
| **Order Management** | Complete order lifecycle with real-time WebSocket tracking, pickup codes, post-payment automation |
| **KDS Brain** | Autonomous kitchen orchestration: auto-fire, convergence, routing, self-learning, analytics |
| **Table Management** | Real-time floor plan with auto-free after payment, state machine (Occupied→Cleaning→Available) |
| **Reservation System** | Advanced booking with guest management, chef approval (Chef's Table), reminders, no-show detection |
| **Digital Payments** | Wallet, PIX, Credit/Debit, Apple Pay, Google Pay, TAP to Pay, Cash with manual confirmation |
| **Payment Gateway** | Asaas + Stripe Terminal adapters, webhook processing, reconciliation |
| **Split Payment** | 4 flexible modes: Individual, Equal, Selective, Fixed Amount |
| **Loyalty Program** | Points-based rewards with tier progression, stamp cards with auto-award and redemption |
| **Financial Brain** | Cash register, COGS tracking, NFC-e fiscal, forecast, accounts payable, reconciliation |
| **Analytics & CRM** | Business intelligence, customer profiles, visit tracking, exportable reports |
| **Integrations** | iFood, Rappi, UberEats adapters with capacity management and status sync |
| **Stock Management** | Stock items, alerts, receive/adjust flows, purchase import (XML/manual) |
| **Multi-role RBAC** | 7-tier access control: Owner, Manager, Waiter, Chef, Barman, Cook, Maître |
| **i18n** | 3 languages (PT-BR, EN-US, ES-ES) with 2,800+ keys per language |
| **Accessibility** | 681+ accessibility labels across 133 files, accessible component wrappers |
| **LGPD Compliance** | Consent tracking, data export, data retention, re-consent (HTTP 451), account deletion |

## Key Features

### Customer Application (61 Screens)

**Discovery & Onboarding:**
- Restaurant discovery with real geolocation (expo-location), maps, and filters
- QR code scanning for seamless table check-in (identifies tables, menus, invitations)
- Passwordless-first authentication: Welcome → Phone Auth (OTP) → Biometric Enrollment
- Social login (Google, Apple) with real RSA-SHA256 signature verification
- Fully internationalized onboarding with cuisine/dietary preference selection

**Ordering & Payments:**
- Real-time menu browsing with category filtering, search, and dish builder (5-step customization)
- **Unified Payment Screen** with 3 tabs: Checkout, Split Details, Tip Selection
- **4 Split Payment Modes**: Individual, Equal, Selective by item, Fixed amount
- **6 Payment Methods**: Apple Pay, Google Pay, PIX QR, Credit/Debit, TAP to Pay, Wallet
- Quick reorder from order history
- Digital receipts with auto-generated receipt numbers
- Post-order review prompt (5-star rating modal on completion)

**Reservations & Loyalty:**
- Advanced reservation system with guest invitation via QR/link, group booking
- Virtual queue with real-time WebSocket position updates
- Digital wallet with transaction history and balance management
- Loyalty program with points, tiers, stamp cards, and reward redemption button
- Favorites management for quick restaurant access
- Coupon/promotion redemption

**Service-Type Specific:**
- **Pub/Bar**: Tab management, round builder, cover charge display, tab invite QR (FAB + modal)
- **Club**: Area selector (Pista/VIP/Rooftop), virtual queue, birthday booking with dynamic pricing, VIP tables, lineup
- **Buffet**: Check-in flow
- **Waitlist**: Family mode, activities, entry choice

**Engagement:**
- Push notifications for order status, reservation reminders, promotions
- Reviews and ratings with photo uploads
- Geolocation tracking for nearby restaurant discovery
- AI pairing assistant

### Restaurant Application (81 Screens)

**Dashboard & Analytics:**
- Real-time dashboard with live metrics (revenue, orders, occupancy)
- **Role-Adaptive Dashboard** — Content adapts to staff role (7 roles):
  - **Owner**: Revenue KPIs, customer count, average ticket, financial reports
  - **Manager**: Active orders, approvals, daily reports, promotions management
  - **Waiter**: My tables, tips today, pending calls, order management, payment collection
  - **Chef**: KDS queue depth, prep status, SLA metrics, chef approvals (Chef's Table)
  - **Barman**: Drink orders, recipes, completion rate, bar KDS
  - **Cook**: Station management, cook KDS
  - **Maître**: Reservations, waitlist, floor flow, occupancy, VIP alerts

**KDS Brain (Autonomous Kitchen):**
- **Brain Router**: Automatic order routing to correct stations
- **Auto-Fire**: Course sequencing with 30s cron
- **Auto-Sync**: Convergence checking for multi-course orders
- **Self-Learning**: Weekly cron for prep time suggestions based on analytics
- **Chef View**: Unified overview of all stations
- **KDS Analytics**: Prep time trends, station efficiency, SLA compliance
- Station settings and brain configuration screens

**Financial Brain:**
- **Cash Register**: Open/close sessions, movements, cash count
- **COGS Tracking**: Ingredients, recipes, margin dashboard
- **Fiscal**: NFC-e emission via Focus NFe, fiscal setup, document management
- **Forecast**: Revenue prediction and trend analysis
- **Bills**: Accounts payable management
- **Financial Reports**: Multi-format export (PDF, Excel)

**Floor & Reservations:**
- Interactive floor plan with table detail management
- Reservation calendar with guest counts and special requests
- Waitlist management with auto-advance after payment
- Table status tracking (Available, Occupied, Reserved, Cleaning)
- Maître dashboard with floor flow visualization

**Operations:**
- Service calls management (waiter calls, help requests)
- Tips distribution and management
- Staff management and HR
- QR code generation (batch + individual)
- Service configuration hub (12 config screens)
- Setup hub for initial restaurant configuration
- Integration settings (iFood, Rappi, UberEats)
- Customer CRM dashboard
- Stock management with alerts
- Cost control with recipe/margin tracking

**Service-Type Specific:**
- **Drive-Thru**: Lane management with proximity-based sorting (Haversine)
- **Food Truck**: Real-time GPS sharing (expo-location, 30s interval)
- **Chef's Table**: Chef approval workflow for reservations
- **Club**: Door management, queue management, VIP table management, promoter dashboard

### Data Platform Modules

**Core Services (Modules 1-20):**

| # | Module | Description |
|---|--------|-------------|
| 1 | **Auth** | Supabase Auth, email confirmation, recovery, refresh sessions, OAuth-ready providers |
| 2 | **Identity** | Profiles, MFA-ready metadata, AES-256-GCM encryption, password policy via Supabase |
| 3 | **Users** | Profile management, preferences, data export, data retention, account deletion |
| 4 | **User Roles** | RBAC implementation (7 roles, restaurant-scoped) |
| 5 | **Restaurants** | Restaurant CRUD, service configuration |
| 6 | **Orders** | Order lifecycle, pickup codes, post-payment automation, stock deduction |
| 7 | **Payments** | Wallet, transactions, 4-mode split payment, refunds, cashback |
| 8 | **Payment Gateway** | Asaas + Stripe Terminal + Wallet adapters, webhook processing, gateway routing |
| 9 | **Reservations** | Booking, guest management, chef approval, reminders (cron), no-show detection |
| 10 | **Tables** | Floor plan, table status, auto-free after payment |
| 11 | **Tabs** | Tab management, happy hour, round tracking |
| 12 | **Menu Items** | Menu management, categories, prep time, station assignment |
| 13 | **Menu Customization** | Customization groups with JSONB options |
| 14 | **Club** | Club features, VIP tables, virtual queue, promoters, birthday packages |
| 15 | **Loyalty** | Points, tiers, rewards, stamp cards, cashback service |
| 16 | **Promotions** | Stamp cards, promotional campaigns |
| 17 | **Tips** | Gratuity distribution and management |
| 18 | **Reviews** | Ratings, review moderation |
| 19 | **Favorites** | User favorites management |
| 20 | **Notifications** | Push notifications (FCM), WebSocket real-time |

**Operations & Intelligence (Modules 21-40):**

| # | Module | Description |
|---|--------|-------------|
| 21 | **Analytics** | Business intelligence, metrics, aggregation, forecasting |
| 22 | **Financial** | Reports, transactions, multi-format export, event listener |
| 23 | **Financial Brain** | Forecast service, accounting export |
| 24 | **Cash Register** | Sessions, movements, cash count |
| 25 | **Cost Control** | Ingredients, recipes, COGS, margin tracking |
| 26 | **Fiscal** | NFC-e via Focus NFe + SEFAZ direct, fiscal config, onboarding |
| 27 | **KDS Brain** | Brain router, auto-fire, auto-sync, analytics, self-learning, cook stations |
| 28 | **Stock** | Stock items, alerts, receive/adjust flows |
| 29 | **Purchase Import** | XML/manual import, confirmation |
| 30 | **Customer CRM** | Customer profiles, visit tracking |
| 31 | **Integrations** | iFood/Rappi/UberEats adapters, capacity manager, status sync |
| 32 | **Reconciliation** | Delivery settlements, payment reconciliation |
| 33 | **Accounts Payable** | Bills management, payment tracking |
| 34 | **HR** | Staff management, scheduling, attendance |
| 35 | **AI** | AI-powered features (pairing, recommendations) via OpenAI |
| 36 | **QR Code** | QR generation, validation, deep linking |
| 37 | **Webhooks** | External integrations (delivery, signatures) |
| 38 | **Events** | WebSocket event handling (Socket.IO) |
| 39 | **Fraud Detection** | Fraud rule engine and detection |
| 40 | **Incident Response** | Security incident workflow |

**Infrastructure (Modules 41-54):**

| # | Module | Description |
|---|--------|-------------|
| 41 | **i18n** | Internationalization (PT-BR/EN-US/ES-ES) |
| 42 | **Health** | System health checks, circuit breaker, readiness probes |
| 43 | **Service Config** | Config Hub (JSONB, 11 endpoints, WebSocket) |
| 44 | **Approvals** | Manager approval workflows (WebSocket) |
| 45 | **Inventory** | 3-tier stock inventory management |
| 46 | **Recipes** | Drink recipes with seed data |
| 47 | **Restaurant Waitlist** | Smart waitlist with WebSocket, auto-advance |
| 48 | **Calls** | Service calls (waiter, help) with WebSocket |
| 49 | **Addresses** | User address management |
| 50 | **Receipts** | Receipt generation with auto receipt_number |
| 51 | **Geofencing** | Haversine distance calculations |
| 52 | **Legal** | Privacy policy, terms of service (i18n), consent tracking, re-consent (HTTP 451) |
| 53 | **Metrics** | Application performance metrics |
| 54 | **Admin** | Administrative operations |

### WebSocket Gateways (9)

| Gateway | Namespace | Purpose |
|---------|-----------|---------|
| OrdersGateway | `/orders` | Order status updates, new orders, item status |
| TabsGateway | `/tabs` | Tab updates, round additions, closure |
| ReservationsGateway | `/reservations` | Reservation creation, status changes, reminders |
| WaitlistGateway | `/waitlist` | Queue position updates, auto-advance |
| CallsGateway | `/calls` | Waiter calls, acknowledgments |
| EventsGateway | `/events` | Payment completed, cashback, general events |
| ApprovalsGateway | `/approvals` | Manager approval requests/responses |
| ServiceConfigGateway | `/service-config` | Configuration changes broadcast |
| ClubQueueGateway | `/queue` | Club queue position, called status |

## Technology Stack

### Backend / Data Platform

| Technology | Version | Purpose |
|------------|---------|---------|
| Supabase Auth | Managed | Email/password auth, confirmation, recovery, refresh sessions |
| TypeScript | 5.x | Programming language |
| PostgreSQL | 16.x | Primary database (+ PostGIS for spatial data) |
| Row Level Security | PostgreSQL | Per-user and per-role data access policies |
| Supabase Realtime | Managed | Real-time data updates where enabled |
| Redis | 7.x | Optional caching and queues for non-auth workloads |
| SQL migrations | Supabase CLI | Schema, triggers, roles, claims hook, RLS policies |
| Bull | 4.x | Job queue processing |
| Swagger | 8.x | API documentation (conditional via env) |
| Helmet | latest | Security headers (CSP, HSTS, X-Frame) |

### Mobile

| Technology | Version | Purpose |
|------------|---------|---------|
| React Native | 0.74.x | Mobile framework |
| Expo | 51.x | Development platform |
| TypeScript | 5.x | Programming language |
| React Navigation | 6.x | Navigation (Tab + Stack + Drawer) |
| React Native Paper | 5.12.x | UI components |
| TanStack Query | 5.x | Data fetching & caching |
| React Hook Form | 7.x | Form management |
| Zod | 4.x | Schema validation |
| Zustand | — | State management |
| Socket.IO Client | 4.8.x | Real-time updates |
| expo-location | — | GPS tracking (Food Truck, geofencing) |
| expo-haptics | — | Haptic feedback |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| Docker | Multi-stage production containerization (4 stages, non-root user) |
| Docker Compose | Local orchestration with resource limits |
| GitHub Actions | 6 CI/CD pipelines (ci, backend-ci, mobile-ci, security-audit, deploy, smoke-tests) |
| PostgreSQL + PostGIS | Spatial data support (Haversine distance) |
| Redis | Session, cache, queue, Socket.IO adapter |
| EAS Build | Expo Application Services for mobile builds |

## Architecture

### High-Level System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                            CLIENTS                                    │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐ │
│  │  Client App      │    │  Restaurant App  │    │  Site (Web)    │ │
│  │  React Native    │    │  React Native    │    │  React + Vite  │ │
│  │  61 screens      │    │  81 screens      │    │  Landing page  │ │
│  └────────┬─────────┘    └────────┬─────────┘    └───────┬────────┘ │
└───────────┼───────────────────────┼──────────────────────┼──────────┘
            └───────────────────────┼──────────────────────┘
                                    │ HTTPS + WSS
                     ┌──────────────▼──────────────┐
                     │      Supabase Platform       │
                     │  Auth · Postgres · Realtime  │
                     │  RLS Policies · SQL Hooks    │
                     │  RBAC Claims · Edge-ready    │
                     └──────┬──────────┬────────────┘
                            │          │
               ┌────────────▼┐   ┌────▼─────────┐   ┌───────────────┐
               │ PostgreSQL  │   │    Redis      │   │  External     │
               │  + PostGIS  │   │ Cache+Queue   │   │  Services     │
               │  RLS enabled│   │ Realtime fanout│  │ Asaas, OpenAI │
               │  45 migrations│  │ Bull Queues  │   │ FCM, Twilio   │
               └─────────────┘   └──────────────┘   └───────────────┘
```

### Security Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     WAF / DDoS Protection                         │
├──────────────────────────────────────────────────────────────────┤
│                     TLS 1.3 / HSTS (1 year, preload)              │
├──────────────────────────────────────────────────────────────────┤
│                     Rate Limiting (100/min, 5/15min auth)         │
├──────────────────────────────────────────────────────────────────┤
│  Helmet CSP │ CSRF (double-submit) │ CORS (explicit, creds=off)  │
├──────────────────────────────────────────────────────────────────┤
│ Supabase Auth│ RBAC claims + RLS   │  Input validation            │
├──────────────────────────────────────────────────────────────────┤
│  AES-256-GCM (PII) │ Managed passwords │ Service role server-only  │
├──────────────────────────────────────────────────────────────────┤
│  Account enum fix   │ Fraud detection │ Incident response        │
├──────────────────────────────────────────────────────────────────┤
│  Structured Logging │ Correlation ID │  Query timeout (30s)       │
├──────────────────────────────────────────────────────────────────┤
│                     PostgreSQL (Encrypted at rest)                 │
└──────────────────────────────────────────────────────────────────┘
```

### LGPD / Data Protection

| Feature | Status | Details |
|---------|:------:|---------|
| Consent tracking | ✅ | SHA-256 version hash, device_id, IP |
| Data export | ✅ | Full JSON export (profile, orders, payments, consent history) |
| Data retention | ✅ | Automated cron (3AM), configurable periods |
| Re-consent | ✅ | HTTP 451 middleware when terms updated |
| Account deletion | ✅ | 30-day grace period, PII anonymization |
| Privacy policy | ✅ | 3 languages (PT-BR, EN-US, ES-ES) |

### Project Structure

```
project_okinawa/
├── platform/
│   ├── supabase/                        # Supabase schema and migrations
│   │   └── migrations/                  # Profiles, roles, hooks, RLS policies
│   │
│   └── mobile/
│       ├── apps/
│       │   ├── client/                  # Customer app (61 screens)
│       │   │   ├── src/screens/         # 28 screen categories
│       │   │   ├── src/navigation/      # Tab + Stack navigators
│       │   │   └── src/hooks/           # App-specific hooks
│       │   └── restaurant/              # Restaurant staff app (81 screens)
│       │       ├── src/screens/         # 38 screen categories
│       │       ├── src/navigation/      # Role-filtered Drawer + Stack
│       │       └── src/services/        # Socket, auth services
│       └── shared/                      # Shared code between apps
│           ├── components/              # Design system (20+ components + a11y wrappers)
│           ├── hooks/                   # useAuth, useOrders, useWebSocket, useI18n
│           ├── services/               # API service (247+ methods), offline payment
│           ├── contexts/               # ThemeContext (light/dark), AuthContext
│           ├── i18n/                   # 3 languages, 2,800+ keys each
│           ├── theme/                  # Design tokens (colors, spacing, typography, shadows)
│           └── config/                 # Sentry, analytics, accessibility
│
├── site/                               # Institutional website (React + Vite)
├── docs/                               # 53 documentation files
│
├── .github/workflows/                  # 6 CI/CD pipelines
│   ├── ci.yml                          # Main CI
│   ├── mobile-ci.yml                   # Mobile lint, typecheck, test, bundle size
│   ├── security-audit.yml              # npm audit, dependency check
│   ├── deploy.yml                      # CD pipeline (build → staging → prod)
│   └── smoke-tests.yml                 # Post-deploy health verification
│
└── CLAUDE.md                           # AI assistant instructions
```

## Security Hardening

The platform has undergone **5 rounds of security audit** (PRR Sprints) with comprehensive remediations:

| Remediation | Status | Details |
|-------------|:------:|---------|
| Supabase Auth | ✅ | Email confirmation, recovery, refresh sessions, PKCE clients |
| RLS Policies | ✅ | Per-user and per-role access policies in Postgres |
| Role Claims | ✅ | Roles exposed through Supabase custom access-token hook |
| AES-256-GCM Field Encryption | ✅ | MFA secrets, PIX keys, card data encrypted at rest |
| Account Enumeration Fix | ✅ | Generic message on registration (no "email exists" leak) |
| Service Role Isolation | ✅ | `service_role` restricted to trusted server-side jobs only |
| CORS Credentials | ✅ | Default `false` (opt-in only) |
| CSP Hardening | ✅ | Strict CSP, HSTS 1yr + preload |
| Trusted Proxy Validation | ✅ | X-Forwarded-For validated before rate limiting |
| Query Timeout | ✅ | `statement_timeout=30s`, `idle_in_transaction=60s` |
| Swagger in Production | ✅ | Disabled by default (`SWAGGER_ENABLED=false`) |
| Log Data Masking | ✅ | Payment data removed from logs |
| Docker Non-Root | ✅ | Non-root containers where custom services are used |
| Fraud Detection | ✅ | Rule engine for suspicious activity |
| Incident Response | ✅ | Security incident workflow module |

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker and Docker Compose
- Git
- iOS Simulator (macOS) or Android Studio

### Quick Installation

```bash
# Clone the repository
git clone https://github.com/dinipedro/project_okinawa.git
cd project_okinawa

# Install site dependencies
cd site && npm install

# Install mobile dependencies
cd ../platform/mobile && npm install
```

### Start Infrastructure

```bash
# Start local Supabase (requires Supabase CLI)
supabase start

# Run database migrations (migrations are in platform/supabase/migrations)
cd platform
supabase db push

# Configure the Supabase Auth custom access token hook:
# public.custom_access_token_hook
```

### Run Applications

```bash
# Terminal 1 — Site
cd site
npm run dev

# Terminal 2 — Client Mobile App
cd platform/mobile/apps/client
npx expo start

# Terminal 3 — Restaurant Mobile App
cd platform/mobile/apps/restaurant
npx expo start
```

### Environment Variables

```bash
# Required Supabase client variables
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-or-anon-key>
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>

# Server-only variables when running trusted jobs or admin scripts
DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=<server-only-never-public>
FIELD_ENCRYPTION_KEY=<min-32-chars-for-AES-256>

# Optional (required for specific features)
OPENAI_API_KEY=<for-AI-features>
ASAAS_API_KEY=<for-payment-gateway>
FCM_SERVER_KEY=<for-push-notifications>
SENDGRID_API_KEY=<for-transactional-emails>
TWILIO_ACCOUNT_SID=<for-SMS-if-enabled>
TWILIO_AUTH_TOKEN=<for-SMS-if-enabled>
```

## API Reference

### Authentication

```bash
supabase.auth.signUp()               # Email/password signup + email confirmation
supabase.auth.signInWithPassword()    # Email/password login
supabase.auth.signOut()               # Logout
supabase.auth.resetPasswordForEmail() # Password recovery
supabase.auth.updateUser()            # Password reset after recovery session
supabase.auth.refreshSession()        # Refresh token/session rotation
supabase.auth.onAuthStateChange()     # Client session persistence and listeners
```

Roles and route authorization are enforced by Supabase Auth claims plus Postgres RLS.
See `docs/SUPABASE_AUTH_FLOW.md` for the migrations, trigger, claims hook, and client flow.

### Core Endpoints (539 total)

```bash
# Restaurants
GET    /api/v1/restaurants              # List restaurants (geo-filtered)
GET    /api/v1/restaurants/:id          # Get restaurant details

# Orders
GET    /api/v1/orders                   # List orders
POST   /api/v1/orders                   # Create order
PATCH  /api/v1/orders/:id/status        # Update order status
POST   /api/v1/orders/:id/confirm-cash  # Confirm cash payment

# Reservations
GET    /api/v1/reservations             # List reservations
POST   /api/v1/reservations             # Create reservation
PATCH  /api/v1/reservations/:id/chef-approve  # Chef approval (Chef's Table)

# Payments
POST   /api/v1/payments                 # Process payment
POST   /api/v1/payments/split           # Split payment (4 modes)
POST   /api/v1/payments/refund          # Process refund

# KDS Brain
GET    /api/v1/kds-brain/stations       # List cook stations
POST   /api/v1/kds-brain/bump           # Bump order item
GET    /api/v1/kds-brain/chef-overview   # Chef unified view

# Financial
GET    /api/v1/financial/reports         # Financial reports
POST   /api/v1/cash-register/open        # Open cash register session
POST   /api/v1/fiscal/emit               # Emit NFC-e

# Loyalty
GET    /api/v1/loyalty/points            # Get loyalty points
POST   /api/v1/loyalty/stamp-cards/:id/redeem  # Redeem stamp card reward

# Legal (LGPD)
GET    /api/v1/legal/privacy-policy      # Privacy policy (i18n)
GET    /api/v1/legal/terms-of-service    # Terms of service (i18n)
GET    /api/v1/users/me/data-export      # Export user data (LGPD)
DELETE /api/v1/users/me                  # Delete account (30-day grace)
```

Full API documentation available at `/docs` when `SWAGGER_ENABLED=true`.

### WebSocket Events

```typescript
// Orders (namespace: /orders)
'order:created'            // New order placed
'order:status_changed'     // Order status update
'order:item_status_changed'// Item status from KDS

// Reservations (namespace: /reservations)
'reservation:created'      // New reservation
'reservation:updated'      // Status change
'reservation:reminder'     // Upcoming reservation reminder

// Tables & Waitlist
'table:status_changed'     // Table availability change
'waitlist:position_update' // Queue position update
'waitlist:called'          // Your turn notification

// Payments & Events
'payment:completed'        // Payment processed
'cashback:credited'        // Cashback applied

// Operations
'waiter:called'            // Waiter call notification
'call:acknowledged'        // Call acknowledged by staff

// Club
'queue:positionUpdate'     // Club queue position
'queue:called'             // Called to enter
```

## Testing

```bash
# Run backend tests
cd platform/backend && npm run test

# Run backend tests with coverage
cd platform/backend && npm run test:cov

# Run mobile tests
cd platform/mobile && npm run test

# Run specific test suites
npx jest --testPathPattern='auth'           # Auth tests only
npx jest --testPathPattern='validation'     # Config validation tests
```

**Coverage thresholds** (enforced in CI):
- Lines: 70%
- Functions: 60%
- Branches: 50%
- Statements: 70%

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Detailed system architecture |
| [SERVICE_TYPES.md](docs/SERVICE_TYPES.md) | 11 service types specification |
| [KDS-SYSTEM.md](docs/KDS-SYSTEM.md) | KDS Brain autonomous kitchen documentation |
| [FINANCIAL-SYSTEM.md](docs/FINANCIAL-SYSTEM.md) | Financial Brain system documentation |
| [PRODUCTION-READINESS-AUDIT-FINAL.md](docs/PRODUCTION-READINESS-AUDIT-FINAL.md) | 10-domain production audit |
| [PRODUCTION-DEPLOYMENT-GUIDE.md](docs/PRODUCTION-DEPLOYMENT-GUIDE.md) | Deployment guide with env vars |
| [HUMAN-ACTION-REQUIRED.md](docs/HUMAN-ACTION-REQUIRED.md) | Remaining human actions for go-live |
| [SECURITY.md](docs/SECURITY.md) | Security policy and practices |
| [DISASTER-RECOVERY.md](docs/DISASTER-RECOVERY.md) | DR procedures |
| [RUNBOOK.md](docs/RUNBOOK.md) | Operational runbook |
| [POST-MORTEM-PROCESS.md](docs/POST-MORTEM-PROCESS.md) | Incident post-mortem process |
| [DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) | Development workflows and patterns |
| [BOUNDED_CONTEXTS.md](docs/BOUNDED_CONTEXTS.md) | Domain bounded contexts |
| [RESTAURANT_STAFF_ROLES.md](docs/RESTAURANT_STAFF_ROLES.md) | 7-tier RBAC specification |
| [OWASP_CHECKLIST.md](docs/OWASP_CHECKLIST.md) | OWASP Top 10 compliance |
| [SCALING_STRATEGY.md](docs/SCALING_STRATEGY.md) | 10x–100x scaling roadmap |
| [DPA-TEMPLATE.md](docs/DPA-TEMPLATE.md) | Data Processing Agreement template |
| [RIPD-TEMPLATE.md](docs/RIPD-TEMPLATE.md) | Data Protection Impact Assessment |
| [WAF-CONFIGURATION.md](docs/WAF-CONFIGURATION.md) | WAF configuration guide |

## Contributing

We welcome contributions to NOOWE. Please read our [Contributing Guide](CONTRIBUTING.md) for details on:

- Code of conduct
- Development process
- Coding standards (semantic tokens, DTOs, DI patterns)
- Commit conventions (Conventional Commits)
- Pull request process
- Branch strategy (main → develop → feature/*)

## License

This project is proprietary software. All rights reserved.

Copyright (c) 2024–2026 Pedro Dini

Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited without express written permission from the copyright holder.

## Support

For technical support or inquiries:

- Review the [documentation](docs/)
- Check existing [issues](https://github.com/dinipedro/project_okinawa/issues)
- Create a new issue with detailed information

---

# Português

## Visão Geral

O NOOWE é uma plataforma abrangente de **experiência presencial** projetada para modernizar e otimizar operações de hospitalidade. Diferente de apps de delivery, o NOOWE foca exclusivamente em **experiências físicas**, criando conexões entre clientes e estabelecimentos através da tecnologia.

### Declaração de Missão

> *"Ser uma plataforma de experiência centrada no usuário que conecta pessoas com estabelecimentos comerciais, intermediando e possibilitando experiências incríveis."*

A plataforma NÃO é uma ferramenta focada em restaurantes, mas sim centrada em criar **experiências de usuário excepcionais** e conexões significativas.

### Componentes da Plataforma

| Componente | Tecnologia | Escopo |
|------------|------------|--------|
| **App Mobile Cliente** | React Native 0.74 / Expo 51 | 61 telas — descoberta, pedidos, reservas, pagamentos, fidelidade |
| **App Mobile Restaurante** | React Native 0.74 / Expo 51 | 81 telas — KDS, salão, analytics, CRM, fiscal |
| **Plataforma de Dados** | Supabase Auth + Postgres + RLS | Autenticação, perfis, roles, policies e realtime |
| **Site (Web)** | React + Vite + Tailwind | Landing page institucional + demo interativo |

### Números da Plataforma

| Métrica | Quantidade |
|---------|----------:|
| Total de telas mobile | **142** |
| Módulos backend | **54** |
| Endpoints REST API | **539** |
| Gateways WebSocket | **9** |
| Entidades de banco | **96** |
| Migrações de banco | **45** |
| Arquivos de teste backend | **137** |
| Chaves i18n (por idioma) | **2.800+** |
| Idiomas suportados | **3** (PT-BR, EN-US, ES-ES) |
| Workflows CI/CD | **6** |
| Arquivos de documentação | **53** |
| Total de arquivos .tsx (mobile) | **898** |
| Labels de acessibilidade | **681+** |

### Diferenciação Competitiva

A vantagem de mercado do NOOWE é construída em três pilares:

1. **Integração Total** — Centraliza 8+ ferramentas fragmentadas (fidelidade, KDS, pagamentos, reservas, BI, fiscal, CRM, estoque) em um ecossistema
2. **Defensibilidade UX-First** — 142 telas nativas otimizadas para hábitos comportamentais e operações intuitivas
3. **Lock-in Natural** — Integração profunda de dados que aumenta custos de troca através de insights acumulados

## Tipos de Serviço Suportados

A plataforma se adapta dinamicamente a **11 tipos distintos de serviço** via registro de funcionalidades (`service-type.registry.ts`):

| Tipo de Serviço | Descrição | Recursos Principais |
|-----------------|-----------|---------------------|
| **Fine Dining** | Experiência premium com serviço personalizado | Sommelier, harmonização, dress code |
| **Quick Service** | Fast food com tempo mínimo de espera | Pedido no balcão, códigos de retirada |
| **Fast Casual** | Comida de qualidade com rapidez | Pedido híbrido, personalização |
| **Café / Padaria** | Cafeterias e padarias | Comanda, cartões de selo, resgate automático |
| **Buffet** | Self-service com preço por peso | Precificação por cobertura, check-in |
| **Drive-Thru** | Pedidos para veículos | Fila GPS, ordenação por proximidade |
| **Food Truck** | Vendedores ambulantes | Rastreamento GPS em tempo real, geolocalização |
| **Chef's Table** | Experiências exclusivas de degustação | Aprovação do chef, controle de capacidade, pré-pagamento |
| **Casual Dining** | Restaurantes full-service relaxados | Waitlist, reservas flexíveis |
| **Pub & Bar** | Estabelecimentos focados em bebidas | Comanda, couvert, QR de convite, happy hour |
| **Club & Balada** | Casas noturnas e venues | Ingressos, mesas VIP, seletor de área, promoters, aniversário |

## Capacidades da Plataforma

| Capacidade | Descrição |
|------------|-----------|
| **Gestão de Pedidos** | Ciclo completo com rastreamento WebSocket, códigos de retirada, automação pós-pagamento |
| **KDS Brain** | Orquestração autônoma de cozinha: auto-fire, convergência, roteamento, self-learning, analytics |
| **Gestão de Mesas** | Planta em tempo real com liberação automática pós-pagamento, máquina de estados |
| **Sistema de Reservas** | Reservas avançadas com gestão de convidados, aprovação do chef, lembretes, detecção de no-show |
| **Pagamentos Digitais** | Wallet, PIX, Crédito/Débito, Apple Pay, Google Pay, TAP to Pay, Dinheiro com confirmação |
| **Gateway de Pagamento** | Adaptadores Asaas + Stripe Terminal, processamento de webhooks, reconciliação |
| **Divisão de Pagamento** | 4 modos: Individual, Igual, Seletivo, Valor Fixo |
| **Programa de Fidelidade** | Pontos com níveis, cartões de selo com resgate automático e botão de resgate |
| **Cérebro Financeiro** | Caixa registradora, COGS, NFC-e fiscal, previsão, contas a pagar, reconciliação |
| **Analytics e CRM** | Business intelligence, perfis de clientes, rastreamento de visitas |
| **Integrações** | Adaptadores iFood, Rappi, UberEats com gestão de capacidade e sync de status |
| **Gestão de Estoque** | Items de estoque, alertas, recebimento/ajuste, importação de compras |
| **RBAC Multi-função** | 7 níveis: Dono, Gerente, Garçom, Chef, Barman, Cozinheiro, Maître |
| **i18n** | 3 idiomas (PT-BR, EN-US, ES-ES) com 2.800+ chaves por idioma |
| **Acessibilidade** | 681+ labels em 133 arquivos, wrappers de componentes acessíveis |
| **Conformidade LGPD** | Rastreamento de consentimento, exportação de dados, retenção, re-consentimento (HTTP 451), exclusão |

## Funcionalidades Principais

### Aplicativo do Cliente (61 Telas)

**Descoberta e Onboarding:**
- Descoberta de restaurantes com geolocalização real (expo-location), mapas e filtros
- Escaneamento de QR code para check-in (identifica mesas, cardápios, convites)
- Autenticação passwordless-first: Boas-vindas → Telefone (OTP) → Biometria
- Login social (Google, Apple) com verificação criptográfica RSA-SHA256
- Onboarding internacionalizado com seleção de culinária/preferências alimentares

**Pedidos e Pagamentos:**
- Navegação de cardápio com filtros, busca e montador de pratos (5 etapas de personalização)
- **Tela de Pagamento Unificada** com 3 abas: Checkout, Divisão, Gorjeta
- **4 Modos de Divisão**: Individual, Igual, Seletivo por item, Valor fixo
- **6 Métodos de Pagamento**: Apple Pay, Google Pay, PIX QR, Débito/Crédito, TAP to Pay, Carteira
- Recibos digitais com número automático
- Prompt de avaliação pós-pedido (modal 5 estrelas ao completar)

**Reservas e Fidelidade:**
- Sistema de reservas com convite de convidados via QR/link, reserva em grupo
- Fila virtual com atualização de posição em tempo real via WebSocket
- Carteira digital com histórico e gestão de saldo
- Fidelidade com pontos, níveis, cartões de selo e botão de resgate
- Cupons e promoções

**Específico por Tipo de Serviço:**
- **Pub/Bar**: Comanda, montador de rodada, exibição de couvert, QR de convite para comanda
- **Club**: Seletor de área (Pista/VIP/Rooftop), fila virtual, aniversário com preço dinâmico
- **Buffet**: Fluxo de check-in
- **Waitlist**: Modo família, atividades, escolha de entrada

### Aplicativo do Restaurante (81 Telas)

**Dashboard e Analytics:**
- Dashboard em tempo real com métricas ao vivo
- **Dashboard Adaptativo por Cargo** (7 cargos):
  - **Dono**: KPIs de receita, contagem de clientes, ticket médio, relatórios
  - **Gerente**: Pedidos ativos, aprovações, relatórios diários, promoções
  - **Garçom**: Mesas, gorjetas, chamadas, pedidos, cobrança
  - **Chef**: Fila KDS, status, SLA, aprovações Chef's Table
  - **Barman**: Bebidas, receitas, taxa de conclusão, KDS bar
  - **Cozinheiro**: Gestão de estação, KDS cozinha
  - **Maître**: Reservas, waitlist, fluxo de salão, VIP

**KDS Brain (Cozinha Autônoma):**
- **Brain Router**: Roteamento automático para estações corretas
- **Auto-Fire**: Sequenciamento de cursos com cron 30s
- **Auto-Sync**: Verificação de convergência para pedidos multi-curso
- **Self-Learning**: Cron semanal para sugestões de tempo baseadas em analytics
- **Chef View**: Visão unificada de todas as estações
- **KDS Analytics**: Tendências de preparo, eficiência, conformidade SLA

**Cérebro Financeiro:**
- **Caixa Registradora**: Abertura/fechamento, movimentações, contagem
- **Controle de Custos**: Ingredientes, receitas, dashboard de margens
- **Fiscal**: Emissão NFC-e via Focus NFe, configuração fiscal
- **Previsão**: Predição de receita e análise de tendências
- **Contas a Pagar**: Gestão de boletos
- **Relatórios Financeiros**: Exportação multi-formato (PDF, Excel)

**Salão e Reservas:**
- Planta interativa com gestão detalhada de mesas
- Calendário de reservas com contagem de convidados
- Waitlist com avanço automático após pagamento
- Dashboard do Maître com visualização de fluxo

**Operações:**
- Gestão de chamadas (garçom, ajuda)
- Distribuição de gorjetas
- Gestão de equipe e RH
- Geração de QR codes (lote + individual)
- Hub de configuração de serviço (12 telas de config)
- Configurações de integração (iFood, Rappi, UberEats)
- Dashboard CRM de clientes
- Gestão de estoque com alertas
- Controle de custos com receitas/margens
- **Drive-Thru**: Gestão de fila com ordenação por proximidade
- **Food Truck**: Compartilhamento GPS em tempo real
- **Chef's Table**: Aprovação do chef para reservas
- **Club**: Porta, fila, mesas VIP, promoter

### Módulos da Plataforma de Dados

**Módulos Core (1-20):**

| # | Módulo | Descrição |
|---|--------|-----------|
| 1 | **Auth** | Supabase Auth, confirmação de e-mail, recuperação, refresh de sessão e OAuth |
| 2 | **Identity** | Perfis, metadados MFA-ready, criptografia AES-256-GCM e política de senha via Supabase |
| 3 | **Users** | Perfis, preferências, exportação de dados, retenção, exclusão |
| 4 | **User Roles** | RBAC (7 cargos, escopo por restaurante) |
| 5 | **Restaurants** | CRUD, configuração de serviço |
| 6 | **Orders** | Ciclo de vida, códigos de retirada, automação pós-pagamento |
| 7 | **Payments** | Wallet, transações, split 4 modos, estornos, cashback |
| 8 | **Payment Gateway** | Adaptadores Asaas + Stripe Terminal + Wallet, webhooks |
| 9 | **Reservations** | Reservas, convidados, aprovação chef, lembretes (cron), no-show |
| 10 | **Tables** | Planta, status, liberação automática |
| 11 | **Tabs** | Comandas, happy hour, rodadas |
| 12 | **Menu Items** | Cardápio, categorias, tempo de preparo, estação |
| 13 | **Menu Customization** | Grupos de personalização com opções JSONB |
| 14 | **Club** | VIP, fila virtual, promoters, pacotes de aniversário |
| 15 | **Loyalty** | Pontos, níveis, selo, cashback |
| 16 | **Promotions** | Cartões de selo, campanhas |
| 17 | **Tips** | Distribuição de gorjetas |
| 18 | **Reviews** | Avaliações, moderação |
| 19 | **Favorites** | Favoritos do usuário |
| 20 | **Notifications** | Push (FCM), WebSocket tempo real |

**Operações e Inteligência (21-40):**

| # | Módulo | Descrição |
|---|--------|-----------|
| 21 | **Analytics** | BI, métricas, agregação, previsão |
| 22 | **Financial** | Relatórios, transações, exportação |
| 23 | **Financial Brain** | Previsão, exportação contábil |
| 24 | **Cash Register** | Sessões, movimentações, contagem |
| 25 | **Cost Control** | Ingredientes, receitas, COGS, margens |
| 26 | **Fiscal** | NFC-e via Focus NFe + SEFAZ, configuração |
| 27 | **KDS Brain** | Roteamento, auto-fire, sync, analytics, self-learning |
| 28 | **Stock** | Itens de estoque, alertas, movimentações |
| 29 | **Purchase Import** | Importação XML/manual |
| 30 | **Customer CRM** | Perfis de clientes, rastreamento de visitas |
| 31 | **Integrations** | iFood/Rappi/UberEats, capacidade, sync |
| 32 | **Reconciliation** | Liquidações de delivery |
| 33 | **Accounts Payable** | Gestão de boletos |
| 34 | **HR** | Equipe, escala, presença |
| 35 | **AI** | IA (harmonização, recomendações) via OpenAI |
| 36 | **QR Code** | Geração, validação, deep linking |
| 37 | **Webhooks** | Integrações externas |
| 38 | **Events** | Eventos WebSocket (Socket.IO) |
| 39 | **Fraud Detection** | Motor de regras de fraude |
| 40 | **Incident Response** | Workflow de incidentes de segurança |

**Infraestrutura (41-54):**

| # | Módulo | Descrição |
|---|--------|-----------|
| 41 | **i18n** | Internacionalização (PT-BR/EN-US/ES-ES) |
| 42 | **Health** | Health checks, circuit breaker, probes |
| 43 | **Service Config** | Config Hub (JSONB, 11 endpoints, WS) |
| 44 | **Approvals** | Aprovações de gerente (WS) |
| 45 | **Inventory** | Estoque 3 camadas |
| 46 | **Recipes** | Receitas de drinks com seeds |
| 47 | **Restaurant Waitlist** | Fila inteligente com WebSocket, avanço automático |
| 48 | **Calls** | Chamadas de serviço (WS) |
| 49 | **Addresses** | Endereços do usuário |
| 50 | **Receipts** | Recibos com numeração automática |
| 51 | **Geofencing** | Cálculos de distância Haversine |
| 52 | **Legal** | Política de privacidade, termos (i18n), consentimento, re-consentimento (HTTP 451) |
| 53 | **Metrics** | Métricas de performance |
| 54 | **Admin** | Operações administrativas |

### Gateways WebSocket (9)

| Gateway | Namespace | Finalidade |
|---------|-----------|------------|
| OrdersGateway | `/orders` | Status de pedidos, novos pedidos |
| TabsGateway | `/tabs` | Atualizações de comanda, rodadas |
| ReservationsGateway | `/reservations` | Reservas, lembretes |
| WaitlistGateway | `/waitlist` | Posição na fila, avanço automático |
| CallsGateway | `/calls` | Chamadas de garçom |
| EventsGateway | `/events` | Pagamentos, cashback, eventos gerais |
| ApprovalsGateway | `/approvals` | Aprovações de gerente |
| ServiceConfigGateway | `/service-config` | Broadcast de configurações |
| ClubQueueGateway | `/queue` | Posição na fila do club |

## Conformidade LGPD

| Funcionalidade | Status | Detalhes |
|----------------|:------:|---------|
| Rastreamento de consentimento | ✅ | Hash SHA-256, device_id, IP |
| Exportação de dados | ✅ | JSON completo (perfil, pedidos, pagamentos, histórico de consentimento) |
| Retenção de dados | ✅ | Cron automatizado (3AM), períodos configuráveis |
| Re-consentimento | ✅ | Middleware HTTP 451 quando termos atualizados |
| Exclusão de conta | ✅ | Período de carência de 30 dias, anonimização de PII |
| Política de privacidade | ✅ | 3 idiomas (PT-BR, EN-US, ES-ES) |

## Testes

```bash
# Testes do backend
cd platform/backend && npm run test

# Testes com cobertura
cd platform/backend && npm run test:cov

# Testes mobile
cd platform/mobile && npm run test
```

**Thresholds de cobertura** (aplicados na CI):
- Linhas: 70%
- Funções: 60%
- Branches: 50%
- Statements: 70%

## Documentação

| Documento | Descrição |
|----------|-----------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura detalhada do sistema |
| [SERVICE_TYPES.md](docs/SERVICE_TYPES.md) | Especificação dos 11 tipos de serviço |
| [KDS-SYSTEM.md](docs/KDS-SYSTEM.md) | Documentação do KDS Brain |
| [FINANCIAL-SYSTEM.md](docs/FINANCIAL-SYSTEM.md) | Documentação do Cérebro Financeiro |
| [PRODUCTION-READINESS-AUDIT-FINAL.md](docs/PRODUCTION-READINESS-AUDIT-FINAL.md) | Auditoria de produção 10 domínios |
| [PRODUCTION-DEPLOYMENT-GUIDE.md](docs/PRODUCTION-DEPLOYMENT-GUIDE.md) | Guia de deploy com variáveis |
| [HUMAN-ACTION-REQUIRED.md](docs/HUMAN-ACTION-REQUIRED.md) | Ações humanas pendentes para go-live |
| [SECURITY.md](docs/SECURITY.md) | Política de segurança |
| [DISASTER-RECOVERY.md](docs/DISASTER-RECOVERY.md) | Procedimentos de DR |
| [RUNBOOK.md](docs/RUNBOOK.md) | Runbook operacional |
| [POST-MORTEM-PROCESS.md](docs/POST-MORTEM-PROCESS.md) | Processo de post-mortem |
| [DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) | Guia de desenvolvimento |
| [DPA-TEMPLATE.md](docs/DPA-TEMPLATE.md) | Template de DPA |
| [RIPD-TEMPLATE.md](docs/RIPD-TEMPLATE.md) | Template de RIPD/DPIA |

## Contribuindo

Contribuições são bem-vindas. Leia nosso [Guia de Contribuição](CONTRIBUTING.md) para detalhes sobre:

- Código de conduta
- Processo de desenvolvimento
- Padrões de código (semantic tokens, DTOs, DI patterns)
- Convenções de commit (Conventional Commits)
- Processo de pull request
- Estratégia de branches (main → develop → feature/*)

## Licença

Este projeto é software proprietário. Todos os direitos reservados.

Copyright (c) 2024–2026 Pedro Dini

A cópia, modificação, distribuição ou uso não autorizado deste software, por qualquer meio, é estritamente proibido sem permissão expressa por escrito do detentor dos direitos autorais.

## Suporte

Para suporte técnico ou dúvidas:

- Revise a [documentação](docs/)
- Verifique [issues existentes](https://github.com/dinipedro/project_okinawa/issues)
- Crie uma nova issue com informações detalhadas
