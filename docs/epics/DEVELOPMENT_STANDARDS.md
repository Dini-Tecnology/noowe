# DEVELOPMENT STANDARDS — NOOWE Platform

> Documento de referência obrigatório para todos os agentes de desenvolvimento.
> Versão: 1.0 | Data: 2026-03-23

---

## Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Convenções de Nomenclatura](#2-convenções-de-nomenclatura)
3. [Estrutura de Arquivos por Camada](#3-estrutura-de-arquivos-por-camada)
4. [Padrão de Internacionalização (i18n)](#4-padrão-de-internacionalização-i18n)
5. [Design System — Tokens e Padrões Visuais](#5-design-system--tokens-e-padrões-visuais)
6. [Padrões UX e Usabilidade](#6-padrões-ux-e-usabilidade)
7. [Padrões de Componentes React Native](#7-padrões-de-componentes-react-native)
8. [Padrões de Backend NestJS](#8-padrões-de-backend-nestjs)
9. [Fluxo de Testes (Testing)](#9-fluxo-de-testes-testing)
10. [Referências de Design — Como Usar](#10-referências-de-design--como-usar)
11. [Git Workflow](#11-git-workflow)
12. [Formato de Documentação de Épico](#12-formato-de-documentação-de-épico)
13. [Checklist de Definition of Done (DoD)](#13-checklist-de-definition-of-done-dod)
14. [Glossário NOOWE](#14-glossário-noowe)

---

## 1. Visão Geral da Arquitetura

### Diagrama de Sistema

```
┌──────────────────────────────────────────────────────────────────────┐
│                          NOOWE PLATFORM                              │
│                                                                      │
│  ┌──────────────────┐          ┌──────────────────────────────────┐  │
│  │  Mobile Client   │          │       Mobile Restaurant          │  │
│  │  (React Native)  │          │        (React Native)            │  │
│  │                  │          │                                  │  │
│  │  /mobile/apps/   │          │  /mobile/apps/restaurant/        │  │
│  │  client/src/     │          │  src/                            │  │
│  │                  │          │                                  │  │
│  │  Screens:        │          │  Screens:                        │  │
│  │  - Auth          │          │  - Dashboard                     │  │
│  │  - Home          │          │  - Orders / KDS                  │  │
│  │  - Explore       │          │  - Tables / Floor Plan           │  │
│  │  - Order         │          │  - Reservations                  │  │
│  │  - Profile       │          │  - Financial / Reports           │  │
│  │  - Loyalty       │          │  - Menu Management               │  │
│  │  - Payment       │          │  - Staff Management              │  │
│  └────────┬─────────┘          └──────────────┬───────────────────┘  │
│           │                                   │                      │
│           │    HTTPS REST + WebSocket (WS)    │                      │
│           └──────────────┬────────────────────┘                      │
│                          │                                           │
│           ┌──────────────▼────────────────────┐                      │
│           │         NestJS Backend             │                      │
│           │      /backend/src/modules/         │                      │
│           │                                   │                      │
│           │  REST API  │  Socket.IO Gateway    │                      │
│           │  (27 mods) │  (Events Module)      │                      │
│           │            │                       │                      │
│           │  Guards:   │  Rooms:               │                      │
│           │  JWT + RBAC│  restaurant:{id}      │                      │
│           │            │  order:{id}           │                      │
│           └──────────────────────────────────┘                      │
│                  │               │              │                     │
│           ┌──────▼──────┐  ┌────▼────┐  ┌──────▼──────┐             │
│           │ PostgreSQL  │  │  Redis  │  │  Bull Queue │             │
│           │     16      │  │    7    │  │  (jobs)     │             │
│           │  +PostGIS   │  │ (cache) │  │             │             │
│           └─────────────┘  └─────────┘  └─────────────┘             │
└──────────────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados — Criação de Pedido

```
Cliente seleciona itens
         │
         ▼
Mobile Client: POST /orders (REST)
         │
         ▼
Backend: OrdersController.create()
         │
         ▼
Backend: OrdersService.create() — DB Transaction
         │
         ├──► Salva Order + OrderItems no PostgreSQL
         │
         ├──► EventsGateway.notifyNewOrder()
         │         │
         │         ▼
         │    Socket.IO emit → room: restaurant:{id}
         │         │
         │         ▼
         │    Mobile Restaurant recebe 'new-order' event
         │    → Atualiza KDS em tempo real
         │
         └──► Retorna Order para Mobile Client
```

### Módulos do Backend (27 módulos NestJS)

Os módulos estão organizados em `/backend/src/modules/`:

- **Core:** auth, users, restaurants, orders, menu-items, tables
- **Operacional:** reservations, kds, floor-plan, waiters
- **Financeiro:** payments, loyalty, wallet, tips
- **Comunicação:** events (WebSocket), notifications, reviews
- **Configuração:** config-hub, restaurant-config, staff

### Shared Mobile

Código compartilhado entre Client e Restaurant em `/mobile/shared/`:

- `i18n/` — translations PT-BR, EN-US, ES-ES
- `theme/` — colors, typography, spacing, shadows, animations
- `services/` — api, auth, socket, storage
- `hooks/` — useWebSocket, useAuth, useI18n, useBiometricAuth
- `contexts/` — ThemeContext, AuthContext, AnalyticsContext
- `config/` — react-query, app.config, env

---

## 2. Convenções de Nomenclatura

### Arquivos

| Tipo | Convenção | Exemplo |
|------|-----------|---------|
| React Native Screen | `PascalCase` + `Screen.tsx` | `LoginScreen.tsx`, `DashboardScreen.tsx` |
| React Component | `PascalCase.tsx` | `OrderCard.tsx`, `SkeletonCard.tsx` |
| Hook customizado | `camelCase.ts` com prefix `use` | `useWebSocket.ts`, `useI18n.ts` |
| Service | `camelCase.ts` | `auth.ts`, `api.ts`, `socket.ts` |
| Utility | `camelCase.ts` | `haptics.ts`, `error-handler.ts` (kebab-case aceito) |
| Context | `PascalCase` + `Context.tsx` | `ThemeContext.tsx`, `AuthContext.tsx` |
| Tipos/Interfaces TS | `PascalCase.ts` ou `types.ts` | `types.ts`, `IOrder` |
| Módulo NestJS | `feature.module.ts` | `orders.module.ts` |
| Controller NestJS | `feature.controller.ts` | `orders.controller.ts` |
| Service NestJS | `feature.service.ts` | `orders.service.ts` |
| DTO NestJS | `action-feature.dto.ts` | `create-order.dto.ts`, `update-order-status.dto.ts` |
| Entity TypeORM | `feature.entity.ts` | `order.entity.ts`, `order-item.entity.ts` |
| Guard NestJS | `name.guard.ts` | `jwt-auth.guard.ts`, `roles.guard.ts` |
| Decorator NestJS | `name.decorator.ts` | `roles.decorator.ts`, `current-user.decorator.ts` |
| Test (unit) | `feature.spec.ts` | `orders.service.spec.ts` |
| Test (integration) | `feature.e2e-spec.ts` | `orders.e2e-spec.ts` |

### Funções e Métodos

- **Regra:** `camelCase`, verbos imperativos no presente.
- Handlers de eventos: prefix `handle` — `handleLogin`, `handleOrderPress`, `handleRefresh`
- Loaders de dados: prefix `fetch`, `load`, `get` — `fetchData`, `loadDashboard`, `getStatusColor`
- Formatters: prefix `format`, `render` — `formatDate`, `renderOrderCard`
- Toggles: prefix `toggle` — `toggleBiometric`
- Validações: prefix `validate` — `validateFields`, `validateForm`
- Callbacks de navegação: prefix `navigate`, `goTo` — `navigateToRestaurant`

```typescript
// CORRETO
const handleLogin = async () => { ... }
const fetchData = useCallback(async () => { ... }, [])
const renderRestaurantCard = (restaurant: Restaurant, index: number) => ( ... )
const validateFields = useCallback((): boolean => { ... }, [])

// ERRADO
const loginHandler = async () => { ... }
const getData = async () => { ... }
const card = (item: Restaurant) => ( ... )
```

### Tipos e Interfaces TypeScript

- Tipos: `PascalCase` — `ThemeColors`, `SupportedLanguage`, `DashboardStats`
- Interfaces: `PascalCase` com prefix `I` — `IOrder`, `IRestaurant`
- Enums: `PascalCase` — `OrderStatus`, `UserRole`, `OrderType`
- Props de componente: sufixo `Props` — `LoginScreenProps`, `OrderCardProps`

```typescript
// Tipos simples
export type SupportedLanguage = 'pt-BR' | 'en-US' | 'es-ES';
export type ThemeColors = typeof lightTheme;

// Interfaces (para objetos com múltiplos campos)
export interface IRestaurant {
  id: string;
  name: string;
  cuisine_type: string[];
}

// Enums (backend, valores persistidos no DB)
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}
```

### Constantes

- `UPPER_SNAKE_CASE` para constantes de módulo.
- `camelCase` para constantes locais dentro de componente/função.

```typescript
// Constantes globais de módulo
const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const BASE_UNIT = 4;
const MAX_RETRY_ATTEMPTS = 3;

// Constantes locais (layout, dimensões)
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.7;
```

### Rotas de Navegação

- Definir como enum com valores string em `kebab-case`.
- Centralizar no arquivo de navegação do app.

```typescript
// mobile/apps/client/src/navigation/routes.ts
export enum NavigationRoutes {
  LOGIN = 'login',
  REGISTER = 'register',
  MAIN = 'main',
  HOME = 'home',
  EXPLORE = 'explore',
  RESTAURANT_DETAIL = 'restaurant-detail',
  ORDER_DETAIL = 'order-detail',
  PROFILE = 'profile',
  NOTIFICATIONS = 'notifications',
}
```

### Endpoints Backend (REST)

Padrão: `/recurso` para coleção, `/recurso/:id` para recurso individual.

```
GET    /orders                        — lista (com paginação)
POST   /orders                        — criar
GET    /orders/:id                    — detalhe
PATCH  /orders/:id                    — atualizar parcialmente
DELETE /orders/:id                    — deletar (soft delete)
PATCH  /orders/:id/status             — sub-recurso de ação
GET    /orders/restaurant/:restaurantId — filtro específico
GET    /orders/kds/kitchen            — endpoint especializado
GET    /orders/waiter/my-tables       — endpoint de contexto
```

---

## 3. Estrutura de Arquivos por Camada

### 3.1 Nova Screen Mobile

Estrutura obrigatória para qualquer nova screen React Native:

```
mobile/apps/[client|restaurant]/src/screens/[domain]/
├── [FeatureName]Screen.tsx     — screen principal
├── components/                  — componentes locais da screen (se necessário)
│   ├── [ComponentName].tsx
│   └── index.ts
└── index.ts                     — re-export opcional
```

**Template de Screen:**

```typescript
// 1. React e React Native imports
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';

// 2. React Native Paper / UI library imports
import { Text, Card, Button, ActivityIndicator } from 'react-native-paper';

// 3. Navigation imports
import { useNavigation } from '@react-navigation/native';

// 4. Shared i18n e tema
import { useI18n } from '@/shared/hooks/useI18n';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';

// 5. Shared contexts e auth
import { useAuth } from '@okinawa/shared/contexts/AuthContext';

// 6. Services e API
import { ApiService } from '@okinawa/shared/services/api';

// 7. Hooks customizados
import { useWebSocket } from '@/shared/hooks/useWebSocket';

// 8. Tipos locais
import type { MyDomainType } from '../../types';

// 9. Constantes de layout (fora do componente)
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 10. Subcomponentes locais (ex: Skeleton)
const SkeletonCard = () => {
  const colors = useColors();
  return ( <View style={[...]} /> );
};

// 11. Componente principal — default export
export default function MyFeatureScreen() {
  // Hooks de sistema
  const { t } = useI18n();
  const colors = useColors();
  const navigation = useNavigation();
  const { user } = useAuth();

  // Estado local
  const [data, setData] = useState<MyDomainType | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Effects
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Callbacks (sempre com useCallback para deps estáveis)
  const fetchData = useCallback(async () => {
    try {
      const result = await ApiService.someEndpoint.get();
      setData(result.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // Handlers de navegação
  const handleItemPress = (id: string) => {
    navigation.navigate('ItemDetail' as never, { id } as never);
  };

  // Styles (sempre com useMemo para recalcular quando colors muda)
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // ...
  }), [colors]);

  // Loading state — skeleton screens (não spinners genéricos)
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  // Render principal
  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* Conteúdo */}
    </ScrollView>
  );
}
```

### 3.2 Novo Módulo NestJS

Estrutura obrigatória de diretórios para um novo módulo:

```
backend/src/modules/[feature]/
├── [feature].module.ts           — module definition
├── [feature].controller.ts       — HTTP handlers
├── [feature].service.ts          — business logic
├── dto/
│   ├── create-[feature].dto.ts
│   ├── update-[feature].dto.ts
│   └── [specific-action].dto.ts
├── entities/
│   └── [feature].entity.ts
├── helpers/                       — helpers se service ficar muito grande
│   ├── [feature]-calculator.helper.ts
│   └── index.ts
├── guards/                        — guards específicos do módulo (se necessário)
└── [feature].service.spec.ts     — unit tests ao lado do service
```

### 3.3 Hooks Customizados

```typescript
// mobile/shared/hooks/use[FeatureName].ts

import { useState, useEffect, useCallback, useRef } from 'react';
// imports de dependências

// Definir tipo de retorno explicitamente
interface UseFeatureReturn {
  data: FeatureData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useFeatureName = (param?: string): UseFeatureReturn => {
  const [data, setData] = useState<FeatureData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // lógica
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [param]);

  useEffect(() => {
    fetchData();
    // cleanup quando necessário
    return () => {
      // cleanup
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};
```

---

## 4. Padrão de Internacionalização (i18n)

### Idiomas Suportados (OBRIGATÓRIO)

| Código | Idioma | Status |
|--------|--------|--------|
| `pt-BR` | Português Brasileiro | Padrão (fallback) |
| `en-US` | English | Obrigatório |
| `es-ES` | Español | Obrigatório |

**TODA string visível ao usuário DEVE ter chave i18n. NUNCA hardcode strings de UI.**

### Localização dos Arquivos

```
mobile/shared/i18n/
├── index.ts          — engine de i18n, funções t(), setLanguage(), useTranslations()
├── pt-BR.ts          — traduções PT-BR (fonte de verdade — sempre completar primeiro)
├── en-US.ts          — traduções EN-US
├── es-ES.ts          — traduções ES-ES
└── dataTranslations.ts — traduções de dados dinâmicos (service types, etc.)
```

### Como Funciona o i18n

O sistema usa um mecanismo simples baseado em objetos aninhados com chave de caminho:

```typescript
// mobile/shared/i18n/index.ts
import { ptBR } from './pt-BR';
import { enUS } from './en-US';
import { esES } from './es-ES';

export type SupportedLanguage = 'pt-BR' | 'en-US' | 'es-ES';

// Função principal de tradução
export function t(keyPath: string, params?: Record<string, string | number>): string

// Hook para componentes
export function useTranslations(): TranslationKeys

// Troca de idioma em runtime
export function setLanguage(lang: SupportedLanguage): void
```

**Nas screens Mobile:**

```typescript
// Opção 1: hook useI18n (padrão nas screens do Client e Restaurant)
import { useI18n } from '@/shared/hooks/useI18n';
const { t } = useI18n();

// Opção 2: função t() diretamente (usado em HomeScreen via @okinawa/shared)
import { t, useTranslations } from '@okinawa/shared/i18n';

// Uso com interpolação de parâmetros (usar {{param}})
t('auth.useBiometricLogin', { type: getBiometricDisplayName() })
// → "Use Face ID para entrar" (pt-BR)
```

### Formato das Chaves

**Padrão:** `secao.subsecao.elemento` (dot-separated, lowercase)

```
auth.welcomeBack
auth.loginSuccess
auth.useBiometricLogin

common.loading
common.retry
common.viewAll

orders.myOrders
orders.orderNumber
orders.status.pending
orders.status.confirmed
orders.status.preparing

restaurant.nearbyRestaurants
restaurant.searchRestaurants
restaurant.cuisineType

financial.todayRevenue
financial.weeklyRevenue

tables.tableStatus
tables.status.occupied
tables.occupancy

kds.avgTime

reservations.pendingReservations
```

### Template para Adicionar Novas Chaves

Ao adicionar qualquer nova string de UI, adicionar nas 3 línguas simultaneamente:

**pt-BR.ts:**
```typescript
// mobile/shared/i18n/pt-BR.ts
export const ptBR = {
  // ... seções existentes ...

  myNewFeature: {
    title: 'Minha Nova Funcionalidade',
    description: 'Descrição da funcionalidade',
    button: {
      confirm: 'Confirmar',
      cancel: 'Cancelar',
    },
    status: {
      active: 'Ativo',
      inactive: 'Inativo',
    },
    // Interpolação com {{variavel}}
    greeting: 'Olá, {{name}}!',
  },
};
```

**en-US.ts:**
```typescript
export const enUS = {
  myNewFeature: {
    title: 'My New Feature',
    description: 'Feature description',
    button: {
      confirm: 'Confirm',
      cancel: 'Cancel',
    },
    status: {
      active: 'Active',
      inactive: 'Inactive',
    },
    greeting: 'Hello, {{name}}!',
  },
};
```

**es-ES.ts:**
```typescript
export const esES = {
  myNewFeature: {
    title: 'Mi Nueva Funcionalidad',
    description: 'Descripción de la funcionalidad',
    button: {
      confirm: 'Confirmar',
      cancel: 'Cancelar',
    },
    status: {
      active: 'Activo',
      inactive: 'Inactivo',
    },
    greeting: '¡Hola, {{name}}!',
  },
};
```

### Nomes Sensíveis ao Contexto (Glossário de Tradução)

Termos que DEVEM ser traduzidos com consistência:

| PT-BR | EN-US | ES-ES | Contexto |
|-------|-------|-------|----------|
| Garçom | Waiter | Mesero | Staff de salão |
| Maitre | Maître | Maître | Responsável pelo salão |
| Cozinheiro | Cook | Cocinero | Equipe de cozinha |
| Barman | Bartender | Barman | Bar |
| Cardápio | Menu | Menú | Lista de pratos |
| Comanda | Order | Pedido | Pedido do cliente |
| Mesa | Table | Mesa | Mesa física |
| Salão | Dining Room | Salón | Área de mesas |
| Gorjeta | Tip | Propina | Valor adicional |
| Fila de espera | Waitlist | Lista de espera | Fila |
| Pagamento | Payment | Pago | Transação |
| Ponto de Fidelidade | Loyalty Points | Puntos de Fidelidad | Programa de recompensas |

### Proibições Absolutas

```typescript
// ERRADO — hardcode de string PT-BR
<Text>Carregando...</Text>
<Text>Pedidos Recentes</Text>
<Button>Confirmar</Button>

// CORRETO — sempre via chave i18n
<Text>{t('common.loading')}</Text>
<Text>{t('orders.recentOrders')}</Text>
<Button>{t('common.confirm')}</Button>
```

---

## 5. Design System — Tokens e Padrões Visuais

### 5.1 Paleta de Cores

Fonte de verdade: `/mobile/shared/theme/colors.ts`

**Tokens Semânticos (usar sempre tokens, nunca hex direto):**

```typescript
// Primário — Warm Sophisticated Orange
primary:     '#EA580C'  // principal ação, botões primários
primaryLight: '#FB923C' // hover/pressed states
primaryDark:  '#C2410C' // estados de destaque

// Secundário — Teal (confiança, inovação)
secondary:    '#0D9488'
secondaryLight: '#2DD4BF'

// Accent — Warm Gold (premium, momentos especiais)
accent:       '#F59E0B'
accentLight:  '#FCD34D'

// Status (usar APENAS para seus propósitos semânticos)
success:      '#10B981'  // confirmações, sucesso
warning:      '#F59E0B'  // avisos, pendências
error:        '#EF4444'  // erros, cancelamentos
info:         '#3B82F6'  // informações neutras

// Gradientes padrão
gradients.primary:   ['#EA580C', '#F59E0B']  // laranja → gold
gradients.secondary: ['#0D9488', '#14B8A6']  // teal escuro → teal claro
gradients.hero:      ['#EA580C', '#0D9488']  // brand gradient
```

**Tokens de Foreground/Background (modo claro e escuro):**

```typescript
// Fundo
background:           '#FFFFFF' / '#0D1117'
backgroundSecondary:  '#F9FAFB' / '#111827'
backgroundTertiary:   '#F3F4F6' / '#1F2937'

// Texto
foreground:           '#111827' / '#F9FAFB'
foregroundSecondary:  '#4B5563' / '#D1D5DB'
foregroundMuted:      '#9CA3AF' / '#6B7280'

// Cards
card:                 '#FFFFFF' / '#111827'
cardHover:            '#F9FAFB' / '#1F2937'

// Bordas
border:               '#E5E7EB' / '#374151'
```

**Tokens Específicos para Restaurant App:**

```typescript
// KDS (Kitchen Display System)
kdsUrgent: colors.error    // >15 min — pedido urgente
kdsHigh:   colors.warning  // 10-15 min — atenção
kdsNormal: colors.success  // <10 min — normal
kdsNew:    colors.info     // novo pedido

// Status de Mesa
tableAvailable: colors.success
tableOccupied:  colors.error
tableReserved:  colors.info
tableCleaning:  colors.warning
```

**Tokens Tailwind (Web/Demo — `tailwind.config.ts`):**

```
--primary, --primary-light, --primary-dark, --primary-foreground
--secondary, --secondary-light, --secondary-dark
--accent, --accent-light, --accent-foreground
--destructive, --destructive-foreground
--success, --success-foreground
--warning, --warning-foreground
--info, --info-foreground
--muted, --muted-foreground
--card, --card-foreground, --card-hover
--background, --foreground, --border, --input, --ring
```

### 5.2 Gradientes

```typescript
// mobile/shared/theme/colors.ts
export const gradients = {
  primary:       ['#EA580C', '#F59E0B'],          // brand principal
  primarySubtle: ['rgba(234,88,12,0.8)', 'rgba(245,158,11,0.8)'],
  secondary:     ['#0D9488', '#14B8A6'],
  accent:        ['#D97706', '#FBBF24'],
  hero:          ['#EA580C', '#0D9488'],           // telas hero/splash
  glass:         ['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)'],
  glassDark:     ['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)'],
};

// Uso no React Native com LinearGradient
import { LinearGradient } from 'expo-linear-gradient';
<LinearGradient colors={gradients.primary} style={styles.header} />
```

### 5.3 Tipografia

Fonte de verdade: `/mobile/shared/theme/typography.ts`

**Escala de Tamanhos:**

| Token | Tamanho | Uso |
|-------|---------|-----|
| `xs` | 10px | nano, badge |
| `sm` | 12px | caption, label small |
| `base` | 14px | body padrão |
| `md` | 16px | body large, botão |
| `lg` | 18px | h3 |
| `xl` | 20px | h2, price large |
| `2xl` | 24px | h1 |
| `3xl` | 30px | display small, price display |
| `4xl` | 36px | display medium |
| `5xl` | 48px | display large, hero |

**Variantes de Tipografia (usar `Text variant=` do React Native Paper):**

```
displayLarge / displayMedium / displaySmall  — hero, splash, números grandes
h1 / h2 / h3 / h4                           — títulos de seção
bodyLarge / bodyMedium / bodySmall           — texto corrente
labelLarge / labelMedium / labelSmall        — labels de formulário, badges
caption                                      — texto auxiliar, datas, metadados
buttonLarge / buttonMedium / buttonSmall     — texto de botão
priceDisplay / priceLarge / priceMedium      — valores monetários
navLabel                                     — rótulos de navegação inferior
badge                                        — chips e badges de status
```

### 5.4 Espaçamento

Fonte de verdade: `/mobile/shared/theme/spacing.ts`

**Base:** 4px. Toda a escala é múltiplo de 4.

```
4px  (spacing.1)  — micro gap entre elementos inline
8px  (spacing.2)  — padding pequeno, gap entre ícone e texto
12px (spacing.3)  — padding interno de chips e badges
16px (spacing.4)  — padding horizontal de telas (screenHorizontal)
20px (spacing.5)  — padding de cards, gap entre seções próximas
24px (spacing.6)  — padding vertical de telas (screenVertical), gap entre seções
32px (spacing.8)  — separação entre grupos de conteúdo
48px (spacing.12) — separação grande, espaço antes de CTAs
```

### 5.5 Border Radius

```typescript
// mobile/shared/theme/spacing.ts — borderRadius
xs:     4px   — badges, tags pequenas
sm:     8px   — chips, ícones com fundo
md:     12px  — inputs, cards pequenos, botões padrão
lg:     16px  — cards (padrão), imagens
xl:     20px  — cards grandes
2xl:    24px  — bottom sheets, modais
3xl:    28px  — liquid glass nav, elementos premium
full:   9999  — avatares, pills, badges circulares
```

### 5.6 Shadows

Fonte de verdade: `/mobile/shared/theme/shadows.ts` e `tailwind.config.ts`

```
shadow-sm        — cards em scroll horizontal, itens de lista
shadow-md        — cards elevados, dropdowns
shadow-lg        — modais, bottom sheets
shadow-glow      — botões de ação primária (usa primary color)
shadow-glow-secondary — elementos de destaque secundário
```

### 5.7 Animações

**Web (Tailwind + CSS keyframes):**

| Animação | Uso | Quando usar |
|----------|-----|-------------|
| `fade-in` | 0.3s, entrada de elementos | Modais, toasts, conteúdo carregado |
| `fade-up` | 0.5s, entrada de baixo para cima | Screens, cards ao rolar |
| `scale-in` | 0.3s, escala de 0.95 → 1 | Popovers, dropdowns |
| `slide-in-right` | 0.4s | Navegação lateral |
| `shimmer` | 2s infinito | Skeleton loading |
| `pulse-ring` | 2s infinito | Status de pedido ativo, notificações |
| `bounce-subtle` | 2s infinito | CTAs de destaque |
| `float` | 3s infinito | Elementos decorativos |

**Mobile (Haptic Feedback — `mobile/shared/utils/haptics.ts`):**

```typescript
import Haptic from '@/shared/utils/haptics';

Haptic.successNotification(); // ação confirmada (pagamento, pedido criado)
Haptic.errorNotification();   // erro de validação, falha
Haptic.warningNotification(); // aviso importante
Haptic.lightImpact();         // toque em botão padrão
Haptic.mediumImpact();        // seleção de item, toggle
Haptic.heavyImpact();         // ação destrutiva confirmada
```

**Regra de Haptics:** Toda ação crítica deve ter feedback tátil — `handleLogin`, confirmação de pagamento, pedido enviado, ação destrutiva confirmada.

### 5.8 Cards

```
standard    — fundo colors.card, elevation: 2, borderRadius: 16
elevated    — fundo colors.card, elevation: 4, shadow-md
accent      — borda ou fundo com primary/accent color
success     — fundo colors.successBackground, borda colors.success
warning     — fundo colors.warningBackground, borda colors.warning
destructive — fundo colors.errorBackground, borda colors.error
```

### 5.9 Badges de Status de Pedido

```typescript
// Mapeamento de status → cor (padrão usado em HomeScreen e Dashboard)
const statusColors = {
  pending:    colors.warning,   // badge amarelo
  confirmed:  colors.info,      // badge azul
  preparing:  colors.primary,   // badge laranja
  ready:      colors.success,   // badge verde
  delivering: colors.secondary, // badge teal
  completed:  colors.success,   // badge verde
  cancelled:  colors.error,     // badge vermelho
};
```

---

## 6. Padrões UX e Usabilidade

### Loading States

**Regra:** SEMPRE usar skeleton screens — nunca spinners genéricos soltos.

```typescript
// CORRETO — skeleton screen (ver HomeScreen.tsx como referência)
const SkeletonCard = () => {
  const colors = useColors();
  return (
    <View style={[skeletonStyles.card, { backgroundColor: colors.card }]}>
      <View style={[skeletonStyles.image, { backgroundColor: colors.backgroundTertiary }]} />
      <View style={skeletonStyles.content}>
        <View style={[skeletonStyles.title, { backgroundColor: colors.backgroundTertiary }]} />
        <View style={[skeletonStyles.subtitle, { backgroundColor: colors.backgroundTertiary }]} />
      </View>
    </View>
  );
};

// Para loading inicial de tela inteira
if (loading) {
  return (
    <View style={styles.loadingContainer}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

// ERRADO — spinner solto sem contexto
if (loading) return <ActivityIndicator size="large" />;
```

A exceção é quando o ActivityIndicator é parte de um componente com contexto claro (ex: dentro de um card que já tem conteúdo carregado, ou em botões com `loading={true}` do React Native Paper).

### Error States

Todo error state deve ter 3 elementos:

1. Mensagem clara do erro em linguagem não técnica
2. Ação de retry
3. Ícone ou ilustração (quando possível)

```typescript
// Padrão de error state em tela
{error && (
  <View style={styles.errorContainer}>
    <IconButton icon="alert-circle-outline" size={48} iconColor={colors.error} />
    <Text variant="titleMedium" style={styles.errorTitle}>
      {t('common.errorOccurred')}
    </Text>
    <Text variant="bodyMedium" style={styles.errorMessage}>
      {error}
    </Text>
    <Button mode="contained" onPress={fetchData} style={styles.retryButton}>
      {t('common.retry')}
    </Button>
  </View>
)}
```

### Empty States

Todo empty state deve ter 4 elementos:

1. Ilustração ou ícone representativo
2. Título (o que está vazio)
3. Subtítulo (por que está vazio ou o que o usuário pode fazer)
4. CTA quando aplicável

```typescript
{data.length === 0 && (
  <View style={styles.emptySection}>
    <IconButton icon="receipt" size={64} iconColor={colors.foregroundMuted} />
    <Text variant="titleMedium" style={styles.emptyTitle}>
      {t('orders.noOrders')}
    </Text>
    <Text variant="bodyMedium" style={styles.emptySubtitle}>
      {t('orders.noOrdersDescription')}
    </Text>
    <Button mode="contained" onPress={() => navigation.navigate('Explore' as never)}>
      {t('restaurant.exploreRestaurants')}
    </Button>
  </View>
)}
```

### Toast / Snackbar

Usar as funções de `@/shared/utils/error-handler`:

```typescript
import { showErrorToast, showSuccessToast } from '@/shared/utils/error-handler';

// Sucesso — verde, ícone check
showSuccessToast(t('auth.loginSuccess'));

// Erro — vermelho, ícone X
showErrorToast(err);
showErrorToast(new Error(t('orders.createFailed')));

// Info — usar conforme implementação do projeto
// Toast de info deve usar cor primary
```

### Confirmações Destrutivas

**TODA ação de DELETE ou irreversível deve ter modal de confirmação antes de executar.**

```typescript
const handleDeleteItem = () => {
  Alert.alert(
    t('common.confirmDelete'),
    t('menu.deleteItemConfirm', { name: item.name }),
    [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          Haptic.heavyImpact();
          await deleteItem(item.id);
        },
      },
    ]
  );
};
```

### Pull-to-Refresh

**Obrigatório em todas as listas e telas com dados dinâmicos.**

```typescript
const [refreshing, setRefreshing] = useState(false);

const onRefresh = useCallback(() => {
  setRefreshing(true);
  fetchData(); // fetchData deve chamar setRefreshing(false) no finally
}, [fetchData]);

<ScrollView
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  }
>
```

### Paginação Infinita

Para listas longas (pedidos, restaurantes, histórico), usar paginação cursor-based com FlatList:

```typescript
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);

const loadMore = useCallback(() => {
  if (!hasMore || loading) return;
  setPage(prev => prev + 1);
}, [hasMore, loading]);

<FlatList
  data={items}
  onEndReached={loadMore}
  onEndReachedThreshold={0.3}
  ListFooterComponent={loading ? <ActivityIndicator /> : null}
/>
```

### Feedback Tátil (Haptics)

Regra: ações críticas DEVEM ter Haptic feedback.

| Ação | Haptic |
|------|--------|
| Login bem-sucedido | `successNotification` |
| Erro de validação | `errorNotification` |
| Pedido criado/confirmado | `successNotification` |
| Pagamento confirmado | `successNotification` |
| Ação destrutiva confirmada | `heavyImpact` |
| Seleção de item de menu | `mediumImpact` |
| Toggle de switch | `mediumImpact` |
| Tap em botão padrão | `lightImpact` |

### Acessibilidade

**Obrigatório em todos os botões de ação e elementos interativos:**

```typescript
<TouchableOpacity
  onPress={handleRestaurantPress}
  accessibilityLabel={t('restaurant.viewRestaurant', { name: restaurant.name })}
  accessibilityRole="button"
  accessibilityHint={t('restaurant.viewRestaurantHint')}
  activeOpacity={0.8}
>

<Button
  mode="contained"
  onPress={handleLogin}
  accessibilityLabel={t('auth.login')}
>
```

### Responsividade Mobile

- Usar `Dimensions.get('window')` para dimensões relativas (width %).
- Considerar `PixelRatio.getFontScale()` para textos.
- Cards horizontais: `width: SCREEN_WIDTH * 0.7`.
- Padding horizontal padrão de telas: 16px (`spacing.screenHorizontal`).
- Testar com Dynamic Type (iOS) e Font Size (Android) em tamanho grande.

---

## 7. Padrões de Componentes React Native

### 7.1 TanStack Query (useQuery / useMutation)

Configuração global em `/mobile/shared/config/react-query.ts`:

```typescript
// staleTime: 5 minutos (dados considerados frescos)
// gcTime: 30 minutos (garbage collection)
// retry: 2 tentativas com backoff exponencial
// refetchOnWindowFocus: true (ao voltar para o app)
```

**Padrão de queryKeys — usar a fábrica centralizada:**

```typescript
import { queryKeys } from '@okinawa/shared/config/react-query';

// Uso em useQuery
const { data: orders } = useQuery({
  queryKey: queryKeys.orders.list({ status: 'active' }),
  queryFn: () => ApiService.orders.getMyOrders(),
});

// Invalidação após mutation
import { invalidateQueries } from '@okinawa/shared/config/react-query';

const mutation = useMutation({
  mutationFn: (data) => ApiService.orders.create(data),
  onSuccess: () => {
    invalidateQueries.afterOrderMutation();
    showSuccessToast(t('orders.orderCreated'));
  },
  onError: (err) => {
    showErrorToast(err);
    Haptic.errorNotification();
  },
});
```

**Estrutura de queryKeys (para novos domínios):**

```typescript
// Adicionar em mobile/shared/config/react-query.ts
myNewDomain: {
  all: ['myNewDomain'] as const,
  list: (filters?: Record<string, any>) => ['myNewDomain', 'list', filters] as const,
  detail: (id: string) => ['myNewDomain', 'detail', id] as const,
},
```

### 7.2 React Hook Form + Zod

Validação de formulários sempre com React Hook Form + Zod, via utilitário centralizado:

```typescript
// Definir schema em mobile/shared/validation/schemas.ts
import { z } from 'zod';

export const myFormSchema = z.object({
  email: z.string().email('Email inválido').min(1, 'Email obrigatório'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});
export type MyFormData = z.infer<typeof myFormSchema>;

// Uso com validateForm helper (padrão do LoginScreen)
import { validateForm } from '@/shared/validation/schemas';

const result = validateForm(myFormSchema, { email, password });
if (!result.success) {
  setFieldErrors(result.errors);
  Haptic.errorNotification();
  return;
}
```

### 7.3 React Navigation

**Stack Navigator para fluxos:**

```typescript
import { createNativeStackNavigator } from '@react-navigation/native-stack';
const Stack = createNativeStackNavigator();

<Stack.Navigator screenOptions={{ headerShown: false }}>
  <Stack.Screen name="Login" component={LoginScreen} />
  <Stack.Screen name="Register" component={RegisterScreen} />
</Stack.Navigator>
```

**Bottom Tab Navigator para navegação principal:**

```typescript
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
const Tab = createBottomTabNavigator();
```

**Modal Pattern (para telas de confirmação, detalhes):**

```typescript
<Stack.Screen
  name="PaymentConfirm"
  component={PaymentConfirmScreen}
  options={{ presentation: 'modal' }}
/>
```

**Navegação type-safe:**

```typescript
// Evitar `as never` onde possível — definir types de params
type RootStackParamList = {
  RestaurantDetail: { restaurantId: string };
  OrderDetail: { orderId: string };
};
```

### 7.4 WebSocket (Socket.IO)

Usar o hook `useWebSocket` de `/mobile/shared/hooks/useWebSocket.ts`:

```typescript
const { connected, emit, on, off, joinRoom, leaveRoom } = useWebSocket('/orders');

useEffect(() => {
  if (connected && restaurantId) {
    joinRoom(`restaurant:${restaurantId}`);

    const handleNewOrder = (data: any) => {
      // atualizar estado
    };

    on('new-order', handleNewOrder);

    // OBRIGATÓRIO: cleanup para evitar memory leaks
    return () => {
      off('new-order', handleNewOrder);
      leaveRoom(`restaurant:${restaurantId}`);
    };
  }
}, [connected, restaurantId]);
```

**Regra:** SEMPRE remover listeners no cleanup do useEffect. NUNCA deixar listeners pendurados.

### 7.5 Zustand Stores

Para estado global que não é server state (TanStack Query cuida do server state):

```typescript
// mobile/shared/stores/useCartStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CartState {
  items: CartItem[];
  restaurantId: string | null;
  addItem: (item: CartItem) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      restaurantId: null,
      addItem: (item) => set((state) => ({ items: [...state.items, item] })),
      removeItem: (itemId) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== itemId) })),
      clearCart: () => set({ items: [], restaurantId: null }),
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

### 7.6 Autenticação

**Token storage:** Usar `SecureStore` (Expo) via `secureStorage` service:

```typescript
import { secureStorage } from '@/shared/services/storage';

// Salvar
await secureStorage.setAccessToken(token);
await secureStorage.setUserEmail(email);

// Ler
const token = await secureStorage.getAccessToken();

// Biometria
await secureStorage.setBiometricEnabled(true);
const enabled = await secureStorage.getBiometricEnabled();
```

**API interceptors:** O `ApiService` em `/mobile/shared/services/api.ts` já injeta o token automaticamente nos headers. Não adicionar manualmente.

**Contexto de Auth:**

```typescript
import { useAuth } from '@okinawa/shared/contexts/AuthContext';
const { user, isAuthenticated, logout } = useAuth();
```

---

## 8. Padrões de Backend NestJS

### 8.1 Checklist para Criar Novo Módulo

- [ ] Criar diretório `backend/src/modules/[feature]/`
- [ ] Criar `[feature].module.ts` com imports de TypeORM, dependências
- [ ] Criar `[feature].controller.ts` com todos os decorators obrigatórios
- [ ] Criar `[feature].service.ts` com Logger e injeção de dependências
- [ ] Criar `entities/[feature].entity.ts` com decorators TypeORM
- [ ] Criar `dto/create-[feature].dto.ts` e `dto/update-[feature].dto.ts`
- [ ] Adicionar o módulo em `app.module.ts`
- [ ] Criar `[feature].service.spec.ts` com testes básicos
- [ ] Adicionar migration para nova entidade

### 8.2 Controller — Decorators Obrigatórios

Todo controller DEVE ter:

```typescript
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiResponse, ApiQuery
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums';

@ApiTags('feature-name')          // tag no Swagger
@Controller('feature-name')       // prefixo da rota REST
@UseGuards(JwtAuthGuard, RolesGuard)  // guards em nível de controller
@ApiBearerAuth()                  // indica auth no Swagger
export class FeatureController {
  constructor(private readonly featureService: FeatureService) {}

  @Post()
  @Roles(UserRole.CUSTOMER, UserRole.OWNER)
  @ApiOperation({ summary: 'Create feature' })
  @ApiResponse({ status: 201, description: 'Created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(@CurrentUser() user: any, @Body() dto: CreateFeatureDto) {
    return this.featureService.create(user.id, dto);
  }

  @Get(':id')
  @Roles(UserRole.CUSTOMER, UserRole.OWNER)
  @ApiOperation({ summary: 'Get feature by ID' })
  @ApiResponse({ status: 200, description: 'Returns feature details' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.featureService.findOne(id);
  }
}
```

**Regras de Roles (RBAC):**
- Rotas de customer: `UserRole.CUSTOMER`
- Rotas de staff genérico: `UserRole.OWNER, UserRole.MANAGER`
- Rotas de KDS cozinha: `UserRole.CHEF`
- Rotas de KDS bar: `UserRole.BARMAN`
- Rotas de garçom: `UserRole.WAITER`
- Rotas de maitre: `UserRole.MAITRE`
- Sempre incluir `UserRole.OWNER` e `UserRole.MANAGER` em rotas de staff

### 8.3 Service — Estrutura

```typescript
import {
  Injectable, NotFoundException,
  BadRequestException, ForbiddenException,
  InternalServerErrorException, Logger
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class FeatureService {
  // Logger sempre presente em services
  private readonly logger = new Logger(FeatureService.name);

  constructor(
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
    // outras injeções
  ) {}

  async findOne(id: string): Promise<Feature> {
    const item = await this.featureRepository.findOne({ where: { id } });

    if (!item) {
      throw new NotFoundException('Feature not found');
    }

    return item;
  }

  async create(userId: string, dto: CreateFeatureDto): Promise<Feature> {
    try {
      const item = this.featureRepository.create({ ...dto, user_id: userId });
      return await this.featureRepository.save(item);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to create feature: ${err.message}`, err.stack);

      // Re-throw exceptions conhecidas
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      // Wrap em InternalServerErrorException para erros desconhecidos
      throw new InternalServerErrorException('Failed to create feature');
    }
  }
}
```

**Padrão de tratamento de erros:**
- `NotFoundException` — recurso não encontrado no DB
- `BadRequestException` — dados inválidos de negócio (ex: item não disponível)
- `ForbiddenException` — acesso negado por permissão
- `InternalServerErrorException` — erros inesperados (nunca expor stack trace)
- Sempre logar com `this.logger.error(message, stack)` antes de throw

### 8.4 DTOs — Validação

```typescript
import {
  IsNotEmpty, IsString, IsOptional, IsNumber,
  IsEnum, IsUUID, IsArray, ValidateNested,
  Min, Max, MaxLength, ArrayMinSize
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class CreateFeatureDto {
  @ApiProperty({ description: 'Campo obrigatório' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())  // sempre trim em strings opcionais
  description?: string;

  @ApiProperty({ enum: FeatureType })
  @IsEnum(FeatureType, { message: 'Invalid type' })
  type: FeatureType;

  @ApiProperty({ minimum: 0, maximum: 10000 })
  @Type(() => Number)  // necessário para query params
  @IsNumber()
  @Min(0)
  @Max(10000)
  amount: number;
}
```

**Regras obrigatórias de DTO:**
- Todo campo obrigatório tem `@IsNotEmpty()` e `@ApiProperty()`
- Todo campo opcional tem `@IsOptional()` e `required: false` no `@ApiProperty()`
- Strings devem ter `@MaxLength()` com valor razoável
- Números devem ter `@Min()` e `@Max()` quando aplicável
- UUIDs devem usar `@IsUUID('4')`
- Usar `@Transform(({ value }) => value?.trim())` em strings de texto livre

### 8.5 Entities TypeORM

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index
} from 'typeorm';

@Entity('feature_table_name')
@Index(['foreign_key_id'])   // sempre indexar FKs e campos de filtro frequente
@Index(['status'])
@Index(['created_at'])
export class Feature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  restaurant_id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: FeatureStatus,
    default: FeatureStatus.ACTIVE,
  })
  status: FeatureStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'boolean', default: false })
  is_deleted: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // Timestamps automáticos — SEMPRE presentes
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Soft delete — usar DeleteDateColumn quando recurso pode ser "deletado"
  @DeleteDateColumn({ nullable: true })
  deleted_at: Date;

  // Relacionamentos
  @ManyToOne(() => Restaurant, (restaurant) => restaurant.features)
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;
}
```

**Regras de Entity:**
- SEMPRE ter `created_at` e `updated_at` com `@CreateDateColumn` / `@UpdateDateColumn`
- Usar `@DeleteDateColumn` para soft delete (nunca deletar fisicamente registros de negócio)
- Indexar todos os campos que aparecem em `WHERE` ou `ORDER BY` frequentemente
- UUID como PK: `@PrimaryGeneratedColumn('uuid')`
- Decimais para valores monetários: `{ type: 'decimal', precision: 10, scale: 2 }`

### 8.6 Migrations

```bash
# Criar nova migration
npm run typeorm migration:generate -- -n CreateFeatureTable

# Executar migrations
npm run typeorm migration:run

# Reverter última migration
npm run typeorm migration:revert
```

**Regras de Migration:**
- NUNCA alterar uma migration que já foi executada em produção
- Nome descritivo: `CreateOrdersTable`, `AddIndexToOrdersStatus`, `AddTipAmountToOrders`
- Toda nova entidade tem migration de criação
- Toda adição de coluna tem migration separada
- Migrations são imutáveis após deploy

### 8.7 Guards e RBAC

```typescript
// Sempre aplicar JwtAuthGuard + RolesGuard em rotas protegidas
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.MANAGER)
@Get('sensitive-data')
getSensitiveData() { ... }

// Para rotas públicas, não aplicar guards (ou usar @Public() decorator)
@Get('public-data')
getPublicData() { ... }
```

**UserRole enum:**

```typescript
export enum UserRole {
  CUSTOMER = 'customer',
  OWNER = 'owner',
  MANAGER = 'manager',
  WAITER = 'waiter',
  CHEF = 'chef',
  BARMAN = 'barman',
  COOK = 'cook',
  MAITRE = 'maitre',
}
```

### 8.8 WebSocket Gateway

```typescript
import {
  WebSocketGateway, WebSocketServer,
  SubscribeMessage, OnGatewayConnection,
  OnGatewayDisconnect, ConnectedSocket, MessageBody
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' } })
export class FeatureGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    // validar token JWT do handshake
  }

  handleDisconnect(client: Socket) {
    // limpar rooms
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { room: string }) {
    client.join(data.room);
  }

  // Emissão server-side (chamado por services)
  notifyRoom(room: string, event: string, data: any) {
    this.server.to(room).emit(event, data);
  }
}
```

**Convenção de rooms:**
- `restaurant:{restaurantId}` — notificações de restaurante
- `order:{orderId}` — notificações de pedido específico
- `user:{userId}` — notificações pessoais

### 8.9 Testes NestJS

```typescript
// orders.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepository: jest.Mocked<any>;

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(Order),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    orderRepository = module.get(getRepositoryToken(Order));
  });

  describe('findOne', () => {
    it('should return an order when found', async () => {
      const mockOrder = { id: 'uuid-123', status: 'pending' };
      orderRepository.findOne.mockResolvedValue(mockOrder);

      const result = await service.findOne('uuid-123');
      expect(result).toEqual(mockOrder);
    });

    it('should throw NotFoundException when order not found', async () => {
      orderRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(NotFoundException);
    });
  });
});
```

---

## 9. Fluxo de Testes (Testing)

### Estrutura

```
backend/
├── src/modules/orders/
│   ├── orders.service.ts
│   └── orders.service.spec.ts     ← unit test ao lado do arquivo
└── test/
    └── orders.e2e-spec.ts          ← integration/e2e tests

mobile/shared/
├── hooks/
│   ├── useWebSocket.ts
│   └── __tests__/
│       └── useWebSocket.test.ts   ← unit tests em subdiretório
├── services/
│   └── __tests__/
│       └── api.test.ts
└── __tests__/
    ├── integration.test.ts
    └── AdvancedIntegration.test.ts
```

### Critérios por User Story

Para cada user story implementada, os seguintes testes são obrigatórios:

**Happy Path (obrigatório):**
- Cenário principal funcionando corretamente com dados válidos
- Verificar retorno correto
- Verificar efeitos colaterais esperados (emit de evento, atualização de state)

**Error Path (obrigatório):**
- Comportamento com dados inválidos (DTO inválido)
- Recurso não encontrado (NotFoundException)
- Acesso negado (ForbiddenException)
- Falha de rede / timeout

**Edge Cases (principais):**
- Valores limite (min/max de quantidades, strings vazias)
- Estado de loading intermediário
- Race conditions em mutations paralelas
- Comportamento offline (mobile)

### Unit Tests — Padrão

```typescript
describe('FeatureService', () => {
  // setup fixtures
  const mockUser = { id: 'user-uuid', role: UserRole.CUSTOMER };
  const mockItem = { id: 'item-uuid', status: 'active' };

  describe('create', () => {
    it('should create item successfully with valid data', async () => {
      // Arrange
      mockRepository.create.mockReturnValue(mockItem);
      mockRepository.save.mockResolvedValue(mockItem);

      // Act
      const result = await service.create(mockUser.id, validDto);

      // Assert
      expect(result).toEqual(mockItem);
      expect(mockRepository.save).toHaveBeenCalledOnce();
    });

    it('should throw BadRequestException when item is unavailable', async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue({ ...mockItem, is_available: false });

      // Act & Assert
      await expect(service.create(mockUser.id, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when referenced entity not found', async () => {
      mockRepository.find.mockResolvedValue([]);
      await expect(service.create(mockUser.id, dto)).rejects.toThrow(NotFoundException);
    });
  });
});
```

### Mobile Tests — React Native Testing Library

```typescript
// mobile/shared/hooks/__tests__/useFeature.test.ts
import { renderHook, act } from '@testing-library/react-hooks';
import { useFeature } from '../useFeature';

describe('useFeature', () => {
  it('should return data on successful fetch', async () => {
    // mock do service
    const { result, waitForNextUpdate } = renderHook(() => useFeature('param'));

    await waitForNextUpdate();

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeDefined();
    expect(result.current.error).toBeNull();
  });

  it('should set error on failed fetch', async () => {
    // mock de falha
    const { result, waitForNextUpdate } = renderHook(() => useFeature('invalid'));
    await waitForNextUpdate();

    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toBeNull();
  });
});
```

### Coverage Mínimo

- **Novos módulos NestJS:** 70% de cobertura de linhas
- **Hooks customizados:** 60% de cobertura
- **Utilitários (formatters, validators):** 80% de cobertura
- **Contexts:** happy path + error state cobertos

---

## 10. Referências de Design — Como Usar

### Hierarquia de Referências

```
┌────────────────────────────────────────────────────────┐
│  FONTE FUNCIONAL (LÓGICA DE NEGÓCIO)                   │
│  /src/components/demo/experiences/[ServiceType]Demo.tsx │
│  /src/components/demo/restaurant/                       │
│                                                         │
│  Extrair: fluxos, estados, dados de exemplo,            │
│           regras de negócio, service types              │
└────────────────────────────────────────────────────────┘
            +
┌────────────────────────────────────────────────────────┐
│  FONTE VISUAL (DESIGN)                                  │
│  /src/components/mobile-preview-v2/screens/[Name]V2.tsx │
│                                                         │
│  Extrair: layout, tipografia, espaçamentos,             │
│           componentes visuais, gradientes, estados UI   │
└────────────────────────────────────────────────────────┘
            +
┌────────────────────────────────────────────────────────┐
│  ESTRUTURA DE CÓDIGO (PADRÕES)                          │
│  /mobile/apps/client/src/screens/ (código existente)    │
│  /mobile/apps/restaurant/src/screens/                   │
│                                                         │
│  Extrair: imports, hooks, patterns, StyleSheet          │
└────────────────────────────────────────────────────────┘
            =
    IMPLEMENTAÇÃO FINAL DA FEATURE
```

### Regra de Extração

| Componente | Fonte Primária | Fonte Secundária |
|------------|----------------|-----------------|
| Lógica de negócio | `/src/components/demo/` | Backend modules |
| Layout e visual | `/src/components/mobile-preview-v2/screens/` | Design tokens |
| Hooks e patterns | Código mobile existente | Este documento |
| i18n keys | `DEMO_TRANSLATIONS` (DemoI18n.tsx) | pt-BR.ts |
| Tipos de serviço | `serviceTypes` em DemoI18n.tsx | — |

### Referências por Domínio

**Demo Client (funcional):**
```
/src/components/demo/experiences/
  ├── FineDiningDemo.tsx
  ├── QuickServiceDemo.tsx
  ├── FastCasualDemo.tsx
  ├── CafeBakeryDemo.tsx
  └── ... (11 tipos de serviço)
```

**Demo Restaurant (funcional):**
```
/src/components/demo/restaurant/
  ├── OwnerDashboard.tsx
  ├── ManagerOperations.tsx
  ├── WaiterTables.tsx
  ├── ChefKDS.tsx
  ├── BarmanKDS.tsx
  └── MaitreFloor.tsx
```

**Mobile V2 (visual):**
```
/src/components/mobile-preview-v2/screens/
  ├── HomeScreenV2.tsx
  ├── OrderScreenV2.tsx
  ├── PaymentScreenV2.tsx
  ├── ProfileScreenV2.tsx
  └── ... (telas de referência de design)
```

---

## 11. Git Workflow

### Branch Naming

```
feat/epic-1-login-screen           — nova funcionalidade de um épico
feat/epic-3-kds-kitchen-display    — nova funcionalidade
fix/orders-status-not-updating     — correção de bug
fix/epic-2-payment-validation      — correção em épico específico
chore/update-react-query-config    — tarefa de manutenção/config
chore/add-missing-i18n-keys        — tarefa de manutenção
refactor/orders-service-helpers    — refatoração sem mudança de comportamento
test/epic-4-reservation-unit-tests — adição de testes
docs/epic-5-loyalty-documentation  — documentação
```

### Commit Format (Conventional Commits)

```
<type>(<scope>): <description in English>

feat(epic-1): add biometric authentication to login screen
fix(orders): resolve status not updating after payment confirmation
feat(epic-3): implement kitchen KDS real-time order display
chore(i18n): add missing Spanish translations for payment module
refactor(orders-service): extract calculation logic to helper classes
test(auth): add unit tests for JWT guard and roles decorator
docs(epic-2): update menu management epic documentation
```

**Types:**
- `feat` — nova funcionalidade
- `fix` — correção de bug
- `refactor` — refatoração (sem mudança de comportamento)
- `test` — testes
- `chore` — manutenção, config, build
- `docs` — documentação
- `style` — formatação, lint (sem mudança lógica)
- `perf` — otimização de performance

### Pull Requests

**Requisitos:**
- Mínimo 2 aprovações de outros desenvolvedores
- Todos os checks de CI devem passar (lint, build, tests)
- Branch deve estar atualizada com `main` antes do merge
- Descrição do PR deve incluir: o que muda, por que muda, como testar

**PROIBIDO:** commit direto em `main`. Todo código vai por PR.

---

## 12. Formato de Documentação de Épico

Template obrigatório para documentação de cada épico:

```markdown
# Epic N — [Nome do Épico]
> Épico de [domínio]: [descrição em uma linha]
> Status: [Planning | In Progress | Complete]
> Versão: 1.0 | Data: YYYY-MM-DD

## Objetivo
[Parágrafo descrevendo o objetivo de negócio do épico e o valor entregue]

## Escopo

### Inclui
- [Feature 1]
- [Feature 2]

### Não Inclui (fora do escopo)
- [Feature X — motivo]
- [Feature Y — motivo]

## User Stories

### US-N.1 — [Título da User Story]
**Como** [persona], **quero** [ação], **para** [benefício].

**Critérios de Aceitação:**
- [ ] CA1: [critério mensurável]
- [ ] CA2: [critério mensurável]
- [ ] CA3: [critério mensurável]

**Referências de Design:**
- Demo: `/src/components/demo/[...]`
- Mobile V2: `/src/components/mobile-preview-v2/screens/[...]`

**Notas Técnicas:**
- [Nota técnica relevante para implementação]

---

## Arquitetura Técnica

### Novos Endpoints
| Método | Rota | Roles | Descrição |
|--------|------|-------|-----------|
| POST | /resource | CUSTOMER | Criar recurso |

### Novos Módulos / Alterações
- `backend/src/modules/[feature]/` — novo módulo
- Alteração em `orders.service.ts` — [motivo]

### Novas Chaves i18n (obrigatório listar)
```
feature.title
feature.button.confirm
feature.status.active
```

### Migrations Necessárias
- `AddFeatureTable` — nova tabela
- `AddColumnToExisting` — nova coluna

## Dependências
- Épico N depende de Épico M (motivo)
- Requer módulo [X] do backend

## Definition of Done
(ver seção 13 deste documento)
```

---

## 13. Checklist de Definition of Done (DoD)

Toda user story deve satisfazer TODOS os itens antes de ser marcada como concluída:

### Código

- [ ] Código implementado e funcionando no ambiente de dev
- [ ] Seguindo as convenções de nomenclatura deste documento
- [ ] Sem código comentado ou `console.log` de debug esquecidos
- [ ] Sem warnings de TypeScript (`tsc --noEmit` passa limpo)
- [ ] Sem `any` desnecessário — tipos explícitos onde possível
- [ ] Sem strings hardcode — toda UI string usa i18n com 3 idiomas

### i18n

- [ ] Todas as strings visíveis ao usuário têm chave i18n
- [ ] Chave adicionada em `pt-BR.ts`, `en-US.ts` e `es-ES.ts`
- [ ] Chaves seguem o padrão `secao.subsecao.elemento`
- [ ] Interpolações usam `{{paramName}}` e são passadas corretamente

### Design / UX

- [ ] Loading state implementado com skeleton screen (não spinner genérico)
- [ ] Error state implementado com mensagem + retry action
- [ ] Empty state implementado com ilustração + CTA quando aplicável
- [ ] Pull-to-refresh implementado em listas e telas com dados dinâmicos
- [ ] Feedback tátil (Haptic) em ações críticas
- [ ] `accessibilityLabel` em todos os botões de ação
- [ ] Cores usam tokens do design system (sem hex hardcode)
- [ ] Tipografia usa variantes do design system (sem fontSize hardcode)
- [ ] Espaçamento usa escala de 4px (sem valores arbitrários)

### Segurança (Backend)

- [ ] Rotas protegidas têm `@UseGuards(JwtAuthGuard, RolesGuard)`
- [ ] `@Roles()` aplicado com os roles corretos
- [ ] Dados sensíveis não expostos em responses
- [ ] Validação de ownership em recursos do usuário (não acessar dados de outros)
- [ ] DTOs validando todos os campos com class-validator
- [ ] Nenhum `InternalServerErrorException` expõe stack trace

### Testes

- [ ] Happy path testado
- [ ] Error path testado (NotFoundException, ForbiddenException, BadRequestException)
- [ ] Edge cases principais cobertos
- [ ] Coverage >= 70% para novo service
- [ ] Todos os testes passando (`npm test` ou `yarn test`)

### Documentação

- [ ] Épico atualizado com as user stories concluídas
- [ ] Novos endpoints documentados com `@ApiOperation` e `@ApiResponse`
- [ ] Novos hooks têm JSDoc básico descrevendo parâmetros e retorno
- [ ] Migration tem nome descritivo

### Git

- [ ] Branch segue naming convention (`feat/epic-N-description`)
- [ ] Commits seguem Conventional Commits
- [ ] PR criado com descrição clara
- [ ] Nenhum conflito com `main`
- [ ] CI passes (lint + build + tests)
- [ ] Mínimo 2 aprovações antes do merge

---

## 14. Glossário NOOWE

| Termo | Definição | Contexto |
|-------|-----------|----------|
| **Service Type** | Tipo de serviço do restaurante. 11 tipos: fine-dining, quick-service, fast-casual, cafe-bakery, buffet, drive-thru, food-truck, chefs-table, casual-dining, pub-bar, club. Define a UX e fluxo de pedido. | Config Hub, Demo |
| **Comanda** | Pedido realizado por um cliente em uma mesa. Termo PT-BR para `Order` no contexto de dine-in. | Mobile Restaurant, Waiter flow |
| **Tab** | Conta aberta de uma mesa ou cliente. Agrega comandas do mesmo grupo. | Waiter flow, Payment |
| **Waiter Calls** | Chamadas do cliente ao garçom via app (ex: "chamar garçom", "pedir conta"). Notificação em tempo real via WebSocket. | Mobile Client, Mobile Restaurant |
| **KDS** | Kitchen Display System. Tela para cozinha ou bar que exibe pedidos em tempo real, substituindo a comanda impressa. Tem visão por tempo, categoria e urgência. | Mobile Restaurant, Chef/Barman role |
| **Floor Plan** | Mapa visual das mesas do salão. Permite ao maitre e gerente visualizar ocupação, reservas e atribuição de garçons em tempo real. | Mobile Restaurant, Maitre role |
| **Split Bill** | Divisão de conta entre os clientes de uma mesa. Pode ser por itens individuais, divisão igual ou valor personalizado por pessoa. | Payment flow, Mobile Client |
| **TAP to Pay** | Pagamento por aproximação NFC direto no smartphone do garçom ou no terminal do restaurante. Modalidade de pagamento contactless. | Payment, Waiter role |
| **Loyalty Tier** | Nível de fidelidade do cliente no programa de recompensas. Tiers: bronze, silver, gold, platinum. Define benefícios e taxa de acúmulo de pontos. | Loyalty module, Mobile Client |
| **Config Hub** | Módulo de configuração avançada do restaurante. Define quais features estão ativas por service type, configurações de integração, parâmetros de operação. | Restaurant settings, Owner/Manager |
| **Maitre** | Papel operacional responsável pelo salão: gerencia reservas, atribui mesas a garçons, controla fluxo de entrada. No sistema: `UserRole.MAITRE`. | Mobile Restaurant, Floor Plan |
| **Barman** | Papel operacional responsável pelo bar: recebe pedidos de bebidas via KDS, gerencia estoque de bebidas. No sistema: `UserRole.BARMAN`. | Mobile Restaurant, KDS Bar |
| **Order Number** | Identificador curto de um pedido, exibido na interface. Gerado sequencialmente por restaurante, diferente do UUID interno. | UI, KDS, Comanda |
| **Soft Delete** | Padrão de deleção onde o registro não é removido do banco, mas marcado como deletado via `deleted_at` timestamp. Garante integridade de histórico. | TypeORM, Entities |
| **QueryRunner** | Mecanismo de transação do TypeORM. Usado em `OrdersService.create()` para garantir atomicidade ao criar pedido com múltiplos items. | Backend, TypeORM |
| **Pagination** | Paginação de listas via `page` e `limit`. Response segue padrão `{ items, total, page, limit, totalPages }` via helper `paginate()`. | Backend, REST API |
| **RBAC** | Role-Based Access Control. Controle de acesso baseado em roles (`UserRole` enum). Implementado via `RolesGuard` + `@Roles()` decorator. | Backend, Auth |
| **Guest** | Cliente adicional em uma mesa que não é o titular do pedido. Registrado em `OrderGuest` para divisão de conta e rastreamento. | Orders module, Split Bill |
| **Haptics** | Feedback tátil via `expo-haptics`. Obrigatório em ações críticas para melhorar a UX mobile. | Mobile shared utils |
| **Skeleton Screen** | Placeholder de loading que imita o layout do conteúdo real. Substitui spinners genéricos. Ver `SkeletonCard` em `HomeScreen.tsx`. | Mobile UX pattern |

---

*Documento mantido por: equipe de arquitetura NOOWE.*
*Para sugestões de atualização, abrir PR com prefixo `docs/standards-`.*
