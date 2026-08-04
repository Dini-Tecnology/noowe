# NOOWE Client — release checklist

The production code path is Supabase-only and exposes casual dining features. Payment, wallet, monetary tips, bill splitting and special-service routes are not part of the production navigator.

## Required EAS environment values

Configure separate `preview` and `production` EAS environments. Never reuse the same Supabase project between them.

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
- `EXPO_PUBLIC_SUPPORT_WHATSAPP`

Analytics must remain disabled until a real analytics project and consent flow are approved.

## Supabase promotion

1. Apply the exact migrations to staging, including `20260803170000_client_production_backend.sql`.
2. Run `supabase db lint` and `supabase test db`.
3. Validate customer A/customer B isolation, QR, order idempotency and loyalty idempotency.
4. Deploy `send-push-notification` and configure a Database Webhook from `notifications` inserts to that function, authenticated with the service-role secret.
5. Promote the same migration files and Edge Function revision to production.

## Provider configuration

- Configure Apple and Google providers in Supabase for both environments.
- Register `noowe://auth/callback`, `noowe://auth/reset-password` and the matching `https://noowebr.com` universal links.
- Configure APNs/FCM credentials in EAS and the Expo project.
- Configure Sentry release/environment upload credentials without exposing them as public app values, except for the public DSN.

## Release validation

Run:

```sh
cd platform/mobile
npm ci
npm run lint:client -- --max-warnings=0
npm run typecheck:client
npm run test:client -- --ci

cd apps/client
npx expo-doctor
eas build --profile staging --platform all
```

Install both staging artifacts on physical devices and execute the acceptance scenarios before running the production build and store submission.
