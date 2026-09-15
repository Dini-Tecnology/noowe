import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Security Tests: public/runtime secret exposure
 */
describe('Runtime Secret Security', () => {
  const files = [
    path.resolve(__dirname, '../../../../docker-compose.yml'),
    path.resolve(__dirname, '../../../../.env.docker'),
    path.resolve(__dirname, '../../../.env.example'),
  ];

  it('does not keep custom JWT auth secrets in runtime config', () => {
    for (const filePath of files) {
      const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';

      expect(content).not.toContain('JWT_SECRET');
      expect(content).not.toContain('JWT_REFRESH_SECRET');
      expect(content).not.toContain('your-jwt-secret');
      expect(content).not.toContain('csrf-secret-key');
    }
  });

  it('does not expose Supabase service_role keys to public clients', () => {
    for (const filePath of files) {
      const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';

      expect(content).not.toMatch(/VITE_.*SERVICE_ROLE/i);
      expect(content).not.toMatch(/EXPO_PUBLIC_.*SERVICE_ROLE/i);
      expect(content).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=/i);
    }
  });

  it('documents anon/publishable Supabase client variables for the site', () => {
    const siteEnvExample = fs.readFileSync(path.resolve(__dirname, '../../../.env.example'), 'utf-8');

    expect(siteEnvExample).toContain('VITE_SUPABASE_URL');
    expect(siteEnvExample).toMatch(/VITE_SUPABASE_(PUBLISHABLE_KEY|ANON_KEY)/);
  });
});
