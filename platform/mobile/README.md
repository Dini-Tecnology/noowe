# 📱 Project Okinawa - Mobile Apps

Aplicativos mobile construídos com React Native + Expo para a plataforma de tecnologia para restaurantes.

## 📋 Índice

- [Stack Tecnológica](#stack-tecnológica)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Desenvolvimento](#desenvolvimento)
- [Build](#build)
- [Estrutura](#estrutura)

## 🛠️ Stack Tecnológica

- **Framework**: React Native 0.74+
- **SDK**: Expo 51+
- **Linguagem**: TypeScript 5.x
- **Navigation**: React Navigation 6.x
- **State Management**: React Query 5.x
- **Forms**: React Hook Form + Zod
- **UI Library**: React Native Paper 5.x
- **HTTP Client**: Axios
- **WebSocket**: Socket.IO Client 4.x
- **Maps**: React Native Maps

## 📦 Pré-requisitos

- Node.js >= 20.0.0
- npm >= 10.0.0
- Expo CLI
- iOS Simulator (Mac) ou Xcode
- Android Studio + Android SDK

## 🚀 Instalação

### 1. Instale dependências

```bash
# Na raiz do workspace mobile
npm install

# Em cada app
cd apps/client && npm install
cd apps/restaurant && npm install
```

### 2. Configure variáveis de ambiente

Copie o exemplo em cada app e preencha com os valores do seu projeto Supabase:

```bash
cp apps/client/.env.example apps/client/.env
cp apps/restaurant/.env.example apps/restaurant/.env
```

Variáveis **obrigatórias** em ambos os apps:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

Opcionais (OAuth, biometria, Sentry, auth redirect): veja comentários em cada `.env.example`.

**Notas importantes:**

- API e WebSocket em dev usam `http://localhost:3000` fixo (`shared/config/env.ts`) — não defina `API_URL` nem `WEBSOCKET_URL` no `.env`.
- Google Maps (app cliente): a chave é configurada nativamente (`app.json` / EAS secrets), não no `.env`.
- E-mail de cadastro (Resend): configure secrets no Supabase (`platform/supabase/.env.example`).
- Builds de produção (EAS): `API_BASE_URL`, `WS_URL`, `FIREBASE_*` e `SENTRY_DSN` vão em `eas.json` ou `eas secret:create`.

## 💻 Desenvolvimento

### App Cliente

```bash
# Iniciar
npm run client

# iOS
npm run client:ios

# Android
npm run client:android
```

### App Restaurante

```bash
# Iniciar
npm run restaurant

# iOS
npm run restaurant:ios

# Android
npm run restaurant:android
```

### Expo Go

1. Instale Expo Go no seu dispositivo
2. Execute `npm run client` ou `npm run restaurant`
3. Escaneie o QR code

## 🏗️ Estrutura do Projeto

```
mobile/
├── apps/
│   ├── client/                 # App do Cliente
│   │   ├── src/
│   │   │   ├── screens/        # Telas
│   │   │   │   ├── auth/       # Login, Register
│   │   │   │   ├── home/       # Home
│   │   │   │   ├── menu/       # Menu e pedidos
│   │   │   │   ├── orders/     # Pedidos
│   │   │   │   └── ...
│   │   │   ├── components/     # Componentes
│   │   │   ├── navigation/     # Navegação
│   │   │   ├── services/       # API services
│   │   │   ├── hooks/          # Custom hooks
│   │   │   ├── types/          # Types
│   │   │   └── theme/          # Tema
│   │   └── app.json
│   │
│   └── restaurant/             # App do Restaurante
│       └── (estrutura similar)
│
└── shared/                     # Código compartilhado
    ├── types/
    └── utils/
```

## 📱 Features

### App Cliente

- ✅ Autenticação (Email/OAuth)
- ✅ Descoberta de restaurantes
- ✅ Mapas e geolocalização
- ✅ Navegação de menu
- ✅ Carrinho e checkout
- ✅ QR code scanner
- ✅ Pedidos em tempo real
- ✅ Reservas
- ✅ Carteira digital
- ✅ Avaliações
- ✅ Push notifications

### App Restaurante

- ✅ Autenticação multi-role
- ✅ Dashboard
- ✅ KDS (Kitchen Display)
- ✅ Gestão de pedidos
- ✅ Gestão de reservas
- ✅ Planta do salão
- ✅ Gestão de cardápio
- ✅ Relatórios financeiros
- ✅ Gorjetas
- ✅ Push notifications

## 🔧 Navegação

### App Cliente

- **Auth Stack**: Login, Register, Forgot Password
- **Main Tabs**:
  - Home
  - Explore
  - Orders
  - Profile

### App Restaurante

- **Auth Stack**: Login
- **Main Drawer**:
  - Dashboard
  - KDS
  - Orders
  - Reservations
  - Menu
  - Reports

## 🎨 Tema

Tema customizado baseado no design system "Modern Chic":

- **Primary**: Orange sofisticado (orange-600 / #EA580C)
- **Secondary**: Cores complementares seguindo tokens semânticos
- **Accent**: Cores de destaque definidas no tema
- **Dark mode**: Totalmente suportado via tokens semânticos
- **Glassmorphism**: Efeito "Liquid Glass" na navegação

## 🔌 API Integration

### HTTP Requests

```typescript
import { api } from '@/services/api';

const restaurants = await api.get('/restaurants');
```

### WebSocket

```typescript
import { socket } from '@/services/socket';

socket.on('order:created', (data) => {
  // Handle new order
});
```

### React Query

```typescript
import { useQuery } from '@tanstack/react-query';

const { data, isLoading } = useQuery({
  queryKey: ['restaurants'],
  queryFn: () => api.get('/restaurants'),
});
```

## 📦 Build

### Development Build

```bash
# Cliente iOS
npm run build:client:ios

# Cliente Android
npm run build:client:android

# Restaurante iOS
npm run build:restaurant:ios

# Restaurante Android
npm run build:restaurant:android
```

### Production Build (EAS)

```bash
# Configure EAS
eas build:configure

# Build
eas build --platform all --profile production
```

### Submit to Stores

```bash
# iOS App Store
eas submit --platform ios

# Google Play Store
eas submit --platform android
```

## 🧪 Testes

```bash
npm run test
```

## 📝 Convenções

- **Componentes**: PascalCase
- **Hooks**: useCamelCase
- **Screens**: PascalCase + Screen suffix
- **Services**: camelCase
- **Types**: PascalCase

## 🔐 Segurança

- Tokens armazenados em Secure Store
- HTTPS obrigatório em produção
- Certificate pinning
- Validação de dados

## 🤝 Contribuindo

Veja [CONTRIBUTING.md](../CONTRIBUTING.md)

## 📄 Licença

MIT

---

**Desenvolvido com ❤️ pela equipe Project Okinawa**
